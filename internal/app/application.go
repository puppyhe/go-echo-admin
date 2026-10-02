package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/puppyhe/go-echo-admin/internal/module/admin"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
)

// Application owns the infrastructure and module registrations for one process.
type Application struct {
	Config    *Config
	DB        *database.DB
	Echo      *echo.Echo
	Admin     *admin.Service
	Scheduler *admin.Scheduler
}

func New(cfg *Config) (*Application, error) {
	if cfg == nil {
		return nil, errors.New("config is required")
	}
	if cfg.Server.RequestTimeout <= 0 {
		cfg.Server.RequestTimeout = 30 * time.Second
	}
	if cfg.Storage.MaxBytes <= 0 {
		cfg.Storage.MaxBytes = 10 * 1024 * 1024
	}
	if cfg.Storage.Path == "" {
		cfg.Storage.Path = "./data/uploads"
	}
	if cfg.Storage.Provider == "" {
		cfg.Storage.Provider = "local"
	}
	if cfg.Queue.Driver == "" {
		cfg.Queue.Driver = "memory"
	}
	if cfg.Scheduler.Workers < 1 {
		cfg.Scheduler.Workers = 2
	}
	if cfg.Scheduler.PollInterval <= 0 {
		cfg.Scheduler.PollInterval = 10 * time.Second
	}
	if cfg.Server.Address == "" {
		cfg.Server.Address = ":8080"
	}
	if len(cfg.Server.AllowedOrigins) == 0 {
		cfg.Server.AllowedOrigins = []string{"http://localhost:8000", "http://localhost:5173"}
	}
	db, err := database.Open(database.Config{Driver: cfg.Database.Driver, DSN: cfg.Database.DSN, Host: cfg.Database.Host, Port: cfg.Database.Port, Name: cfg.Database.Name, User: cfg.Database.User, Password: cfg.Database.Password})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	a := &Application{Config: cfg, DB: db}
	e := echo.New()
	e.HTTPErrorHandler = httpx.ErrorHandler
	// Multipart adds a small boundary/header envelope around file bytes. Keep
	// the request guard slightly above the configured file limit; the upload
	// handler still enforces the exact byte limit for the file itself.
	bodyLimit := cfg.Storage.MaxBytes + 1024*1024
	e.Use(middleware.Recover(), middleware.RequestID(), middleware.RequestLogger(), middleware.CORSWithConfig(middleware.CORSConfig{AllowOrigins: cfg.Server.AllowedOrigins, AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodPatch, http.MethodPost, http.MethodDelete, http.MethodOptions}, AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, echo.HeaderXRequestID}}), middleware.BodyLimit(bodyLimit), middleware.ContextTimeout(cfg.Server.RequestTimeout), middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(1000)), middleware.Secure())
	a.Echo = e
	var fileStore storage.Store
	if cfg.Storage.Provider == "s3" {
		fileStore, err = storage.NewS3(storage.S3Config{Endpoint: cfg.Storage.S3Endpoint, Bucket: cfg.Storage.S3Bucket, Region: cfg.Storage.S3Region, AccessKey: cfg.Storage.S3AccessKey, SecretKey: cfg.Storage.S3SecretKey, Prefix: cfg.Storage.S3Prefix, UsePathStyle: cfg.Storage.S3UsePathStyle})
	} else {
		fileStore, err = storage.NewLocal(cfg.Storage.Path)
	}
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("open file storage: %w", err)
	}
	var queue admin.JobQueue
	if cfg.Queue.Driver == "memory" {
		queue = admin.NewMemoryQueue(cfg.Scheduler.Workers * 50)
	} else {
		queue = admin.NewDatabaseQueue(db, cfg.Scheduler.PollInterval)
	}
	scheduler := admin.NewScheduler(db, cfg.Scheduler.Workers, queue)
	scheduler.Tick = cfg.Scheduler.PollInterval
	scheduler.Storage = fileStore
	a = &Application{Config: cfg, DB: db, Echo: e, Scheduler: scheduler}
	a.Admin = &admin.Service{DB: db, Scheduler: scheduler, Storage: fileStore, Config: admin.RuntimeConfig{JWTSecret: cfg.Auth.JWTSecret, AccessTTL: cfg.Auth.AccessTTL, RefreshTTL: cfg.Auth.RefreshTTL, StorageMaxBytes: cfg.Storage.MaxBytes}, RouteProvider: func() echo.Routes { return e.Router().Routes() }}
	e.Use(a.Admin.ErrorCaptureMiddleware)
	// Development keeps the original zero-to-running experience. Production
	// uses the explicit upgrade CLI/Compose migrate service so a server restart
	// cannot silently alter the schema.
	if cfg.Environment != "production" {
		if err := a.Migrate(context.Background()); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("migrate database: %w", err)
		}
	}
	admin.RegisterRoutes(e, a.Admin)
	e.GET("/health/live", func(c *echo.Context) error {
		return httpx.Respond(c, map[string]any{"status": "ok", "service": "echo-admin"})
	})
	e.GET("/health/ready", func(c *echo.Context) error {
		if err := db.Ping(c.Request().Context()); err != nil {
			return httpx.NewError(http.StatusServiceUnavailable, "DEPENDENCY_UNAVAILABLE", "database is not ready")
		}
		return httpx.Respond(c, map[string]any{"status": "ready"})
	})
	e.GET("/version", func(c *echo.Context) error {
		return httpx.Respond(c, map[string]any{"name": "go-echo-admin", "version": "0.1.0"})
	})
	return a, nil
}

func (a *Application) Migrate(ctx context.Context) error { return a.DB.Migrate(ctx) }
func (a *Application) Seed(ctx context.Context, username, password, tenantCode, tenantName string, demo bool) error {
	return a.Admin.Seed(ctx, username, password, tenantCode, tenantName, demo)
}

// Serve starts the HTTP listener and returns when ctx is cancelled or the server fails.
func (a *Application) Serve(ctx context.Context) error {
	if a.Config.Scheduler.Enabled && a.Scheduler != nil {
		a.Scheduler.Start(ctx)
		defer a.Scheduler.Stop()
	}
	return (echo.StartConfig{Address: a.Config.Server.Address, HideBanner: true, GracefulTimeout: 10 * time.Second}).Start(ctx, a.Echo)
}

func (a *Application) Close() error {
	if a == nil || a.DB == nil {
		return nil
	}
	if a.Scheduler != nil {
		a.Scheduler.Stop()
	}
	return a.DB.Close()
}
