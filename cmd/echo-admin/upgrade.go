package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/app"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/spf13/cobra"
)

func upgradeCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "upgrade", Short: "inspect or apply additive database upgrades"}
	cmd.AddCommand(
		&cobra.Command{Use: "plan", Short: "show the pending schema contract without writing", RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := app.LoadConfig(configPath)
			if err != nil {
				return err
			}
			db, err := database.Open(database.Config{Driver: cfg.Database.Driver, DSN: cfg.Database.DSN, Host: cfg.Database.Host, Port: cfg.Database.Port, Name: cfg.Database.Name, User: cfg.Database.User, Password: cfg.Database.Password})
			if err != nil {
				return err
			}
			defer db.Close()
			result, err := db.Upgrade(cmd.Context(), true)
			if err != nil {
				return err
			}
			return printJSON(result)
		}},
		&cobra.Command{Use: "apply", Short: "apply the schema contract and record the release", RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := app.LoadConfig(configPath)
			if err != nil {
				return err
			}
			db, err := database.Open(database.Config{Driver: cfg.Database.Driver, DSN: cfg.Database.DSN, Host: cfg.Database.Host, Port: cfg.Database.Port, Name: cfg.Database.Name, User: cfg.Database.User, Password: cfg.Database.Password})
			if err != nil {
				return err
			}
			defer db.Close()
			result, err := db.Upgrade(cmd.Context(), false)
			if err != nil {
				return err
			}
			return printJSON(result)
		}},
		&cobra.Command{Use: "status", Short: "list applied schema contracts", RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := app.LoadConfig(configPath)
			if err != nil {
				return err
			}
			db, err := database.Open(database.Config{Driver: cfg.Database.Driver, DSN: cfg.Database.DSN, Host: cfg.Database.Host, Port: cfg.Database.Port, Name: cfg.Database.Name, User: cfg.Database.User, Password: cfg.Database.Password})
			if err != nil {
				return err
			}
			defer db.Close()
			rows, err := db.MigrationStatus(cmd.Context())
			if err != nil {
				return err
			}
			return printJSON(rows)
		}},
	)
	return cmd
}

func backupCommand() *cobra.Command {
	var output string
	cmd := &cobra.Command{Use: "backup", Short: "create a transactional MySQL dump before an upgrade", RunE: func(cmd *cobra.Command, _ []string) error {
		cfg, err := app.LoadConfig(configPath)
		if err != nil {
			return err
		}
		if cfg.Database.Driver != "mysql" {
			return errors.New("backup currently supports only MySQL")
		}
		if strings.TrimSpace(cfg.Database.DSN) != "" {
			return errors.New("backup does not parse ECHO_ADMIN_DATABASE_DSN; use mysqldump with the DSN's connection options explicitly")
		}
		if output == "" {
			output = filepath.Join("backups", fmt.Sprintf("echo-admin-%s.sql", time.Now().UTC().Format("20060102-150405")))
		}
		if err := os.MkdirAll(filepath.Dir(output), 0700); err != nil {
			return err
		}
		file, err := os.OpenFile(output, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
		if err != nil {
			return err
		}
		defer file.Close()
		args := []string{"--single-transaction", "--quick", "--routines", "--events", "--triggers", "--column-statistics=0", "--host", cfg.Database.Host, "--port", fmt.Sprint(cfg.Database.Port), "--user", cfg.Database.User, cfg.Database.Name}
		process := exec.CommandContext(cmd.Context(), "mysqldump", args...)
		process.Stdout = file
		process.Stderr = os.Stderr
		process.Env = append(os.Environ(), "MYSQL_PWD="+cfg.Database.Password)
		if err := process.Run(); err != nil {
			_ = os.Remove(output)
			return fmt.Errorf("mysqldump failed: %w", err)
		}
		fmt.Printf("backup written to %s\n", output)
		return nil
	}}
	cmd.Flags().StringVarP(&output, "output", "o", "", "output SQL file (default backups/echo-admin-<UTC>.sql)")
	return cmd
}

func printJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}
