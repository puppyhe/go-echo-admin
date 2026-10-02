package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
	"gorm.io/gorm"
)

var ErrQueueClosed = errors.New("scheduler queue is closed")

type JobTask struct {
	TenantID      uint64
	JobID         uint64
	RunID         uint64
	OccurrenceKey string
	Trigger       string
	ActorID       uint64
}

type JobQueue interface {
	Enqueue(context.Context, JobTask) error
	Dequeue(context.Context) (JobTask, error)
	Close()
}

// MemoryQueue is the default queue for a single process. The interface lets a
// deployment replace it with Redis, NATS or another durable queue later while
// keeping the scheduler's execution and lease semantics unchanged.
type MemoryQueue struct {
	items  chan JobTask
	closed chan struct{}
	once   sync.Once
}

// DatabaseQueue turns queued OpsRun rows into a durable work queue. A worker
// can be restarted without losing a manual or scheduled run; leasing is an
// atomic compare-and-swap so two workers cannot execute the same run.
type DatabaseQueue struct {
	DB     *database.DB
	Poll   time.Duration
	closed chan struct{}
	once   sync.Once
}

func NewDatabaseQueue(db *database.DB, poll time.Duration) *DatabaseQueue {
	if poll <= 0 {
		poll = time.Second
	}
	return &DatabaseQueue{DB: db, Poll: poll, closed: make(chan struct{})}
}
func (q *DatabaseQueue) Enqueue(context.Context, JobTask) error { return nil }
func (q *DatabaseQueue) Close() {
	q.once.Do(func() {
		close(q.closed)
		if q.DB != nil {
			_ = q.DB.Model(&database.OpsRun{}).Where("status = ?", "leased").Update("status", "queued").Error
		}
	})
}
func (q *DatabaseQueue) Dequeue(ctx context.Context) (JobTask, error) {
	for {
		var row database.OpsRun
		if err := q.DB.WithContext(ctx).Where("status = ?", "queued").Order("id asc").First(&row).Error; err == nil {
			result := q.DB.WithContext(ctx).Model(&database.OpsRun{}).Where("id = ? AND tenant_id = ? AND status = ?", row.ID, row.TenantID, "queued").Updates(map[string]any{"status": "leased"})
			if result.Error == nil && result.RowsAffected == 1 {
				return JobTask{TenantID: row.TenantID, JobID: row.JobID, RunID: row.ID, OccurrenceKey: row.OccurrenceKey, Trigger: row.Trigger, ActorID: row.ActorID}, nil
			}
		}
		timer := time.NewTimer(q.Poll)
		select {
		case <-q.closed:
			timer.Stop()
			return JobTask{}, ErrQueueClosed
		case <-ctx.Done():
			timer.Stop()
			return JobTask{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func NewMemoryQueue(capacity int) *MemoryQueue {
	if capacity < 1 {
		capacity = 100
	}
	return &MemoryQueue{items: make(chan JobTask, capacity), closed: make(chan struct{})}
}
func (q *MemoryQueue) Enqueue(ctx context.Context, task JobTask) error {
	select {
	case <-q.closed:
		return ErrQueueClosed
	default:
	}
	select {
	case q.items <- task:
		return nil
	case <-q.closed:
		return ErrQueueClosed
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (q *MemoryQueue) Dequeue(ctx context.Context) (JobTask, error) {
	select {
	case task := <-q.items:
		return task, nil
	case <-q.closed:
		return JobTask{}, ErrQueueClosed
	case <-ctx.Done():
		return JobTask{}, ctx.Err()
	}
}
func (q *MemoryQueue) Close() { q.once.Do(func() { close(q.closed) }) }

type Scheduler struct {
	DB         *database.DB
	Queue      JobQueue
	Workers    int
	Tick       time.Duration
	HTTPClient *http.Client
	Storage    storage.Store
}

func NewScheduler(db *database.DB, workers int, queue JobQueue) *Scheduler {
	if workers < 1 {
		workers = 2
	}
	if queue == nil {
		queue = NewMemoryQueue(workers * 50)
	}
	return &Scheduler{DB: db, Queue: queue, Workers: workers, Tick: 10 * time.Second, HTTPClient: &http.Client{Timeout: 30 * time.Second}}
}

func (s *Scheduler) Start(ctx context.Context) {
	if s == nil || s.DB == nil || s.Queue == nil {
		return
	}
	if s.Tick <= 0 {
		s.Tick = 10 * time.Second
	}
	for i := 0; i < s.Workers; i++ {
		go s.worker(ctx)
	}
	s.recoverQueued(ctx)
	go s.dispatcher(ctx)
}

// OpsRun is the durable hand-off between the scheduler and the in-process
// queue. A restart can therefore repopulate the queue instead of silently
// dropping runs that were accepted before the process stopped.
func (s *Scheduler) recoverQueued(ctx context.Context) {
	// A database-backed queue may have leased work when the previous process
	// exited. Put it back into the durable queue before creating workers.
	_ = s.DB.WithContext(ctx).Model(&database.OpsRun{}).Where("status = ?", "leased").Update("status", "queued").Error
	var runs []database.OpsRun
	if err := s.DB.WithContext(ctx).Where("status=?", "queued").Order("id asc").Limit(10000).Find(&runs).Error; err != nil {
		return
	}
	for _, run := range runs {
		_ = s.Queue.Enqueue(ctx, JobTask{TenantID: run.TenantID, JobID: run.JobID, RunID: run.ID, OccurrenceKey: run.OccurrenceKey, Trigger: run.Trigger, ActorID: run.ActorID})
	}
}

func (s *Scheduler) Stop() {
	if s != nil && s.Queue != nil {
		s.Queue.Close()
	}
}

func (s *Scheduler) dispatcher(ctx context.Context) {
	ticker := time.NewTicker(s.Tick)
	defer ticker.Stop()
	// Do one scan at startup. Jobs without a schedule are never dispatched.
	s.cleanupExpiredUploads(ctx, time.Now())
	s.scan(ctx, time.Now())
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.cleanupExpiredUploads(ctx, now)
			s.scan(ctx, now)
		}
	}
}

func (s *Scheduler) cleanupExpiredUploads(ctx context.Context, now time.Time) {
	if s.Storage == nil {
		return
	}
	var sessions []database.FileUploadSession
	if err := s.DB.WithContext(ctx).Where("expires_at < ? AND status IN ?", now, []string{"initiated", "uploading"}).Limit(100).Find(&sessions).Error; err != nil {
		return
	}
	for _, session := range sessions {
		var parts []database.FileUploadPart
		if s.DB.WithContext(ctx).Where("session_id=? AND tenant_id=?", session.ID, session.TenantID).Find(&parts).Error != nil {
			continue
		}
		if err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&database.FileUploadSession{}).Where("id=? AND tenant_id=? AND status IN ?", session.ID, session.TenantID, []string{"initiated", "uploading"}).Update("status", "expired").Error; err != nil {
				return err
			}
			return tx.Where("session_id=? AND tenant_id=?", session.ID, session.TenantID).Delete(&database.FileUploadPart{}).Error
		}); err != nil {
			continue
		}
		for _, part := range parts {
			_ = s.Storage.Delete(ctx, part.StoreKey)
		}
	}
}

func (s *Scheduler) scan(ctx context.Context, now time.Time) {
	var jobs []database.OpsJob
	if err := s.DB.WithContext(ctx).Where("enabled=?", true).Find(&jobs).Error; err != nil {
		return
	}
	for _, job := range jobs {
		var settings database.OpsSettings
		if err := s.DB.WithContext(ctx).Where("tenant_id=?", job.TenantID).First(&settings).Error; err == nil && !settings.WorkerEnabled {
			continue
		}
		definition := opsDefinition(job.Definition)
		expression := jobStringValue(definition, "cron", "schedule")
		scheduleNow := now
		if timezone := jobStringValue(definition, "timezone"); timezone != "" {
			if location, loadErr := time.LoadLocation(timezone); loadErr == nil {
				scheduleNow = now.In(location)
			}
		}
		if expression == "" || !cronDue(expression, scheduleNow) {
			continue
		}
		occurrence := fmt.Sprintf("cron-%d-%d", job.ID, scheduleNow.Truncate(time.Minute).Unix())
		run, created, err := s.reserve(ctx, job, occurrence, "schedule", 0)
		if err != nil || !created {
			continue
		}
		if err := s.Queue.Enqueue(ctx, JobTask{TenantID: job.TenantID, JobID: job.ID, RunID: run.ID, OccurrenceKey: occurrence, Trigger: "schedule"}); err != nil {
			_ = s.finish(ctx, run, "failed", 0, 0, map[string]any{"error": err.Error()}, "QUEUE_ERROR", err.Error())
		}
	}
}

func (s *Scheduler) worker(ctx context.Context) {
	for {
		task, err := s.Queue.Dequeue(ctx)
		if err != nil {
			return
		}
		s.execute(ctx, task)
	}
}

func (s *Scheduler) EnqueueManual(ctx context.Context, tenantID, jobID, actorID uint64) (database.OpsRun, error) {
	var job database.OpsJob
	if err := s.DB.WithContext(ctx).Where("id=? AND tenant_id=?", jobID, tenantID).First(&job).Error; err != nil {
		return database.OpsRun{}, err
	}
	occurrence := fmt.Sprintf("manual-%d-%d", job.ID, time.Now().UnixNano())
	run, _, err := s.reserve(ctx, job, occurrence, "manual", actorID)
	if err != nil {
		return run, err
	}
	if err := s.Queue.Enqueue(ctx, JobTask{TenantID: tenantID, JobID: jobID, RunID: run.ID, OccurrenceKey: occurrence, Trigger: "manual", ActorID: actorID}); err != nil {
		_ = s.finish(ctx, run, "failed", 0, 0, map[string]any{"error": err.Error()}, "QUEUE_ERROR", err.Error())
		return run, err
	}
	return run, nil
}

func (s *Scheduler) reserve(ctx context.Context, job database.OpsJob, occurrence, trigger string, actor uint64) (database.OpsRun, bool, error) {
	var run database.OpsRun
	created := false
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		run = database.OpsRun{TenantID: job.TenantID, JobID: job.ID, JobName: job.Name, JobRevision: job.Revision, Trigger: trigger, Status: "queued", ActorID: actor, OccurrenceKey: occurrence, CreatedAt: time.Now()}
		if err := tx.Create(&run).Error; err != nil {
			var existing database.OpsRun
			if findErr := tx.Where("tenant_id=? AND job_id=? AND occurrence_key=?", job.TenantID, job.ID, occurrence).First(&existing).Error; findErr == nil {
				run = existing
				return nil
			}
			return err
		}
		created = true
		return tx.Model(&database.OpsJob{}).Where("id=? AND tenant_id=?", job.ID, job.TenantID).Updates(map[string]any{"active_run_id": run.ID, "next_run_at": time.Now().Add(time.Minute)}).Error
	})
	if err != nil {
		return run, false, err
	}
	return run, created, nil
}

func (s *Scheduler) execute(ctx context.Context, task JobTask) {
	var run database.OpsRun
	if s.DB.WithContext(ctx).Where("id=? AND tenant_id=?", task.RunID, task.TenantID).First(&run).Error != nil {
		return
	}
	started := time.Now()
	claim := s.DB.WithContext(ctx).Model(&run).Where("status IN ?", []string{"queued", "leased"}).Updates(map[string]any{"status": "running", "started_at": started})
	if claim.Error != nil || claim.RowsAffected == 0 {
		return
	}
	run.StartedAt = &started
	var job database.OpsJob
	if err := s.DB.WithContext(ctx).Where("id=? AND tenant_id=?", task.JobID, task.TenantID).First(&job).Error; err != nil {
		_ = s.finish(ctx, run, "failed", 0, 0, nil, "JOB_NOT_FOUND", err.Error())
		return
	}
	status, code, message, result, httpStatus, responseBytes := s.runJob(ctx, job)
	_ = s.finish(ctx, run, status, httpStatus, responseBytes, result, code, message)
	_ = s.DB.WithContext(ctx).Model(&database.OpsJob{}).Where("id=? AND tenant_id=?", job.ID, job.TenantID).Updates(map[string]any{"last_run_at": time.Now(), "active_run_id": 0}).Error
}

func (s *Scheduler) finish(ctx context.Context, run database.OpsRun, status string, httpStatus int, responseBytes int64, result map[string]any, code, message string) error {
	finished := time.Now()
	updates := map[string]any{"status": status, "finished_at": finished, "duration_ms": finished.Sub(nonNilTime(run.StartedAt, finished)).Milliseconds(), "http_status": httpStatus, "response_bytes": responseBytes, "result": stage2JSON(result), "error_code": code, "error": message}
	return s.DB.WithContext(ctx).Model(&database.OpsRun{}).Where("id=? AND tenant_id=?", run.ID, run.TenantID).Updates(updates).Error
}

func nonNilTime(value *time.Time, fallback time.Time) time.Time {
	if value != nil {
		return *value
	}
	return fallback
}

func (s *Scheduler) runJob(ctx context.Context, job database.OpsJob) (status, code, message string, result map[string]any, httpStatus int, responseBytes int64) {
	var tenantRow database.Tenant
	if err := s.DB.WithContext(ctx).First(&tenantRow, job.TenantID).Error; err != nil || tenantRow.Status != "active" {
		return "failed", "TENANT_DISABLED", "租户未启用", nil, 0, 0
	}
	definition := opsDefinition(job.Definition)
	executor := strings.ToLower(strings.TrimSpace(job.Executor))
	if executor == "" {
		executor = strings.ToLower(jobStringValue(definition, "executor", "type"))
	}
	if executor == "" || executor == "builtin" || executor == "system" || executor == "method" {
		method := jobStringValue(definition, "methodKey", "method", "key", "name")
		switch method {
		case "system.heartbeat", "heartbeat", "":
			return "success", "", "", map[string]any{"message": "系统心跳完成", "at": time.Now()}, 0, 0
		case "notification.dispatch":
			return "failed", "DISPATCH_NOT_CONFIGURED", "通知投递器尚未配置真实通道", map[string]any{"message": "请先配置通知服务商"}, 0, 0
		default:
			return "failed", "UNKNOWN_EXECUTOR", "未找到内置任务", map[string]any{"method": method}, 0, 0
		}
	}
	if executor != "http" && executor != "webhook" {
		return "failed", "EXECUTOR_UNSUPPORTED", "任务执行器不受支持", map[string]any{"executor": executor}, 0, 0
	}
	var settings database.OpsSettings
	if s.DB.Where("tenant_id=?", job.TenantID).First(&settings).Error != nil || !settings.HTTPEnabled {
		return "failed", "HTTP_DISABLED", "HTTP 任务执行未启用", nil, 0, 0
	}
	target := jobStringValue(definition, "url", "target")
	if nested, ok := definition["http"].(map[string]any); ok && target == "" {
		target = jobStringValue(nested, "url", "target")
	}
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "failed", "URL_INVALID", "任务 URL 无效", nil, 0, 0
	}
	allowed := stage2Slice(settings.AllowedHosts)
	if !hostAllowed(u.Host, allowed) && !hostAllowed(u.Hostname(), allowed) {
		return "failed", "HOST_DENIED", "任务目标主机不在允许列表中", nil, 0, 0
	}
	method := strings.ToUpper(jobStringValue(definition, "method"))
	if nested, ok := definition["http"].(map[string]any); ok && method == "" {
		method = strings.ToUpper(jobStringValue(nested, "method"))
	}
	if method == "" {
		method = http.MethodPost
	}
	body := jobStringValue(definition, "body")
	if body == "" {
		if parameters, ok := definition["parameters"]; ok {
			encoded, _ := json.Marshal(parameters)
			body = string(encoded)
		}
	}
	requestContext := ctx
	if timeoutRaw, ok := definition["timeoutSeconds"].(float64); ok && timeoutRaw > 0 && timeoutRaw <= 600 {
		var cancel context.CancelFunc
		requestContext, cancel = context.WithTimeout(ctx, time.Duration(timeoutRaw)*time.Second)
		defer cancel()
	}
	request, err := http.NewRequestWithContext(requestContext, method, u.String(), bytes.NewBufferString(body))
	if err != nil {
		return "failed", "REQUEST_INVALID", err.Error(), nil, 0, 0
	}
	request.Header.Set("Content-Type", "application/json")
	headers, _ := definition["headers"].(map[string]any)
	if headers == nil {
		if nested, ok := definition["http"].(map[string]any); ok {
			headers, _ = nested["headers"].(map[string]any)
		}
	}
	if headers != nil {
		for key, value := range headers {
			if strings.EqualFold(key, "Authorization") {
				continue
			}
			request.Header.Set(key, fmt.Sprint(value))
		}
	}
	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	// Redirects would otherwise bypass the host allowlist on the next hop.
	client = &http.Client{Transport: client.Transport, Timeout: client.Timeout, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return "failed", "HTTP_REQUEST_FAILED", err.Error(), nil, 0, 0
	}
	defer response.Body.Close()
	content, _ := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	responseBytes = int64(len(content))
	httpStatus = response.StatusCode
	result = map[string]any{"status": response.StatusCode, "body": string(content)}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "failed", "HTTP_STATUS", fmt.Sprintf("目标返回 HTTP %d", response.StatusCode), result, httpStatus, responseBytes
	}
	return "success", "", "", result, httpStatus, responseBytes
}

func jobStringValue(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := data[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
func hostAllowed(host string, allowed []any) bool {
	host = strings.ToLower(host)
	for _, value := range allowed {
		pattern := strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
		if pattern == host || (strings.HasPrefix(pattern, "*.") && strings.HasSuffix(host, strings.TrimPrefix(pattern, "*"))) {
			return true
		}
	}
	return false
}

// cronDue supports the conventional five-field cron form, including lists,
// ranges, wildcards and step expressions. It deliberately rejects macros and
// seconds fields so the execution cadence remains bounded to one minute.
func cronDue(expression string, now time.Time) bool {
	fields := strings.Fields(strings.TrimSpace(expression))
	if len(fields) != 5 {
		return false
	}
	return cronField(fields[0], now.Minute(), 0, 59) && cronField(fields[1], now.Hour(), 0, 23) && cronField(fields[2], now.Day(), 1, 31) && cronField(fields[3], int(now.Month()), 1, 12) && cronField(fields[4], int(now.Weekday()), 0, 7)
}
func cronField(field string, value, min, max int) bool {
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		base, step := part, 1
		if pieces := strings.SplitN(part, "/", 2); len(pieces) == 2 {
			base = pieces[0]
			step, _ = strconv.Atoi(pieces[1])
			if step <= 0 {
				continue
			}
		}
		if base == "*" {
			if (value-min)%step == 0 {
				return true
			}
			continue
		}
		bounds := strings.SplitN(base, "-", 2)
		start, err := strconv.Atoi(bounds[0])
		if err != nil {
			continue
		}
		end := start
		if len(bounds) == 2 {
			end, err = strconv.Atoi(bounds[1])
			if err != nil {
				continue
			}
		}
		if start < min || end > max || start > end {
			continue
		}
		if value >= start && value <= end && (value-start)%step == 0 {
			return true
		}
	}
	return false
}
