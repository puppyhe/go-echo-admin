package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/puppyhe/go-echo-admin/internal/app"
)

func main() {
	cfg, err := app.LoadConfig("")
	if err != nil {
		slog.Error("configuration failed", "error", err)
		os.Exit(1)
	}
	application, err := app.New(cfg)
	if err != nil {
		slog.Error("application startup failed", "error", err)
		os.Exit(1)
	}
	defer application.Close()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	slog.Info("echo-admin started", "address", cfg.Server.Address, "environment", cfg.Environment, "middleware", "Recover → RequestID → Logger → Secure/CORS → BodyLimit → Timeout → Auth → TenantContext → Authorization → Audit")
	if err := application.Serve(ctx); err != nil {
		slog.Error("server stopped with error", "error", err)
		os.Exit(1)
	}
}
