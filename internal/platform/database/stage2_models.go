package database

import "time"

// Stage 2 models back the tenant-scoped file, notification and operations
// capabilities. JSON fields intentionally keep the extension points stable
// while allowing deployments to add provider or task-specific properties.
type Notification struct {
	ID           uint64     `gorm:"primaryKey;autoIncrement"`
	TenantID     uint64     `gorm:"not null;index"`
	UserID       uint64     `gorm:"not null;index"`
	Title        string     `gorm:"size:200;not null"`
	Content      string     `gorm:"type:text"`
	Link         string     `gorm:"size:500"`
	Category     string     `gorm:"size:40;index"`
	TemplateCode string     `gorm:"size:120;index"`
	Urgent       bool       `gorm:"not null;default:false"`
	ReadAt       *time.Time `gorm:"index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type NotificationChannel struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID  uint64 `gorm:"not null;index"`
	Name      string `gorm:"size:120;not null"`
	Type      string `gorm:"size:40;not null"`
	Target    string `gorm:"size:500"`
	Enabled   bool   `gorm:"not null;default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type NotificationDelivery struct {
	ID             uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID       uint64 `gorm:"not null;index"`
	NotificationID uint64 `gorm:"not null;index"`
	ChannelName    string `gorm:"size:120"`
	Type           string `gorm:"size:40"`
	Status         string `gorm:"size:30;index"`
	Attempts       int
	LastError      string `gorm:"size:500"`
	CreatedAt      time.Time
	SentAt         *time.Time
}

type NotificationTemplate struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;uniqueIndex:ux_tenant_notification_template"`
	Code        string `gorm:"size:120;not null;uniqueIndex:ux_tenant_notification_template"`
	Name        string `gorm:"size:160;not null"`
	Category    string `gorm:"size:40;not null"`
	Title       string `gorm:"size:500"`
	Body        string `gorm:"type:text"`
	Variables   string `gorm:"type:text"`
	Channels    string `gorm:"type:text"`
	Description string `gorm:"size:500"`
	Enabled     bool   `gorm:"not null;default:true"`
	Version     int    `gorm:"not null;default:1"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type NotificationPreference struct {
	TenantID   uint64 `gorm:"primaryKey"`
	UserID     uint64 `gorm:"primaryKey"`
	Matrix     string `gorm:"type:text"`
	QuietStart string `gorm:"size:20"`
	QuietEnd   string `gorm:"size:20"`
	Timezone   string `gorm:"size:80"`
	Quiet      bool   `gorm:"not null;default:false"`
	Version    int    `gorm:"not null;default:1"`
	UpdatedAt  time.Time
}

type NotificationRuntime struct {
	TenantID           uint64 `gorm:"primaryKey"`
	WorkerEnabled      bool
	SMSEnabled         bool
	MaxAttempts        int
	LeaseSeconds       int
	TimeoutSeconds     int
	BatchSize          int
	RetentionDays      int
	SuppressMinutes    int
	DefaultQuietStart  string `gorm:"size:20"`
	DefaultQuietEnd    string `gorm:"size:20"`
	DefaultTimezone    string `gorm:"size:80"`
	AllowedWebhookHost string `gorm:"type:text"`
	Version            int    `gorm:"not null;default:1"`
	UpdatedAt          time.Time
}

type NotificationProvider struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID      uint64 `gorm:"not null;uniqueIndex:ux_tenant_notification_provider"`
	Code          string `gorm:"size:120;not null;uniqueIndex:ux_tenant_notification_provider"`
	Name          string `gorm:"size:160;not null"`
	Type          string `gorm:"size:40;not null"`
	Provider      string `gorm:"size:80"`
	Enabled       bool
	Default       bool
	RatePerMinute int
	Description   string `gorm:"size:500"`
	Config        string `gorm:"type:text"`
	Secrets       string `gorm:"type:text"`
	Version       int    `gorm:"not null;default:1"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type OpsSettings struct {
	TenantID      uint64 `gorm:"primaryKey"`
	WorkerEnabled bool
	HTTPEnabled   bool
	AllowedHosts  string `gorm:"type:text"`
	Revision      int    `gorm:"not null;default:1"`
	UpdatedAt     time.Time
}

type OpsJob struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;index"`
	Definition  string `gorm:"type:text"`
	Name        string `gorm:"size:160;index"`
	Group       string `gorm:"size:120;index"`
	Executor    string `gorm:"size:30"`
	Enabled     bool   `gorm:"index"`
	Revision    int    `gorm:"not null;default:1"`
	OwnerID     uint64 `gorm:"index"`
	NextRunAt   *time.Time
	LastRunAt   *time.Time
	ActiveRunID uint64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type OpsTemplate struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID   uint64 `gorm:"not null;uniqueIndex:ux_tenant_ops_template"`
	Key        string `gorm:"size:120;not null;uniqueIndex:ux_tenant_ops_template"`
	Name       string `gorm:"size:160;not null"`
	Definition string `gorm:"type:text"`
	Revision   int    `gorm:"not null;default:1"`
	Builtin    bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type OpsRun struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID      uint64 `gorm:"not null;uniqueIndex:ux_ops_run_occurrence"`
	JobID         uint64 `gorm:"not null;uniqueIndex:ux_ops_run_occurrence"`
	JobName       string `gorm:"size:160"`
	JobRevision   int
	Trigger       string `gorm:"size:30"`
	Status        string `gorm:"size:30;index"`
	ActorID       uint64
	OccurrenceKey string `gorm:"size:160;uniqueIndex:ux_ops_run_occurrence"`
	CreatedAt     time.Time
	StartedAt     *time.Time
	FinishedAt    *time.Time
	DurationMS    int64
	HTTPStatus    int
	ResponseBytes int64
	Result        string `gorm:"type:text"`
	ErrorCode     string `gorm:"size:80"`
	Error         string `gorm:"size:500"`
}

func init() {
	Models = append(Models, &Notification{}, &NotificationChannel{}, &NotificationDelivery{}, &NotificationTemplate{}, &NotificationPreference{}, &NotificationRuntime{}, &NotificationProvider{}, &OpsSettings{}, &OpsJob{}, &OpsTemplate{}, &OpsRun{})
}
