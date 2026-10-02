package admin

import (
	"context"
	"testing"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/testdb"
)

func TestCronDueSupportsCommonExpressions(t *testing.T) {
	now := time.Date(2026, time.January, 2, 3, 4, 0, 0, time.UTC) // Friday
	for _, expression := range []string{"4 3 * * *", "*/2 * * * *", "4 3 2 1 5", "4,5 3 * * *"} {
		if !cronDue(expression, now) {
			t.Fatalf("expected cron expression %q to match", expression)
		}
	}
	if cronDue("5 3 * * *", now) {
		t.Fatal("unexpected cron match")
	}
}

func TestMemoryQueueCloseUnblocksConsumers(t *testing.T) {
	queue := NewMemoryQueue(1)
	queue.Close()
	if err := queue.Enqueue(context.Background(), JobTask{}); err != ErrQueueClosed {
		t.Fatalf("enqueue error=%v", err)
	}
	if _, err := queue.Dequeue(context.Background()); err != ErrQueueClosed {
		t.Fatalf("dequeue error=%v", err)
	}
}

func TestSchedulerReservesDuplicateOccurrenceOnce(t *testing.T) {
	db := testdb.Open(t)
	scheduler := NewScheduler(db, 1, NewMemoryQueue(1))
	job := database.OpsJob{TenantID: 1, Name: "heartbeat", Revision: 1, Definition: `{"cron":"* * * * *","method":"system.heartbeat"}`}
	if err := db.Create(&job).Error; err != nil {
		t.Fatal(err)
	}
	first, created, err := scheduler.reserve(context.Background(), job, "cron-1-1", "schedule", 0)
	if err != nil || !created {
		t.Fatalf("first reserve created=%v err=%v", created, err)
	}
	second, created, err := scheduler.reserve(context.Background(), job, "cron-1-1", "schedule", 0)
	if err != nil || created || second.ID != first.ID {
		t.Fatalf("duplicate reserve created=%v first=%d second=%d err=%v", created, first.ID, second.ID, err)
	}
}

func TestSchedulerExecutesBuiltinHeartbeat(t *testing.T) {
	s := testService(t)
	if err := s.Seed(context.Background(), "alice", "correct horse battery", "sched", "Scheduler", false); err != nil {
		t.Fatal(err)
	}
	var tenant database.Tenant
	if err := s.DB.Where("code=?", "sched").First(&tenant).Error; err != nil {
		t.Fatal(err)
	}
	job := database.OpsJob{TenantID: tenant.ID, Name: "心跳", Executor: "method", Revision: 1, Definition: `{"name":"心跳","executor":"method","methodKey":"system.heartbeat","cron":"* * * * *"}`}
	if err := s.DB.Create(&job).Error; err != nil {
		t.Fatal(err)
	}
	scheduler := NewScheduler(s.DB, 1, NewMemoryQueue(1))
	run, err := scheduler.EnqueueManual(context.Background(), tenant.ID, job.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	scheduler.execute(context.Background(), JobTask{TenantID: tenant.ID, JobID: job.ID, RunID: run.ID})
	var completed database.OpsRun
	if err := s.DB.First(&completed, run.ID).Error; err != nil {
		t.Fatal(err)
	}
	if completed.Status != "success" {
		t.Fatalf("status=%s error=%s", completed.Status, completed.Error)
	}
}
