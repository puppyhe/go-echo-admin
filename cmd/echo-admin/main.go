// Command echo-admin provides lifecycle and development commands for Go Echo Admin.
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/puppyhe/go-echo-admin/internal/app"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/spf13/cobra"
)

var (
	configPath    string
	overwrite     bool
	adminUsername string
	adminPassword string
	tenantCode    string
	tenantName    string
)

func main() {
	root := &cobra.Command{Use: "echo-admin", Short: "Go Echo Admin lifecycle and development CLI", SilenceUsage: true, SilenceErrors: true}
	root.PersistentFlags().StringVar(&configPath, "config", ".env", "path to the environment file")
	root.AddCommand(initCommand(), migrateCommand(), seedCommand(), genCommand(), pluginCommand(), upgradeCommand(), backupCommand())
	if err := root.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func initCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "init", Short: "generate a local .env with a random signing key", RunE: func(cmd *cobra.Command, _ []string) error {
		if err := app.InitEnvironment(configPath, overwrite); err != nil {
			return err
		}
		fmt.Printf("generated %s (permissions 0600)\n", configPath)
		return nil
	}}
	cmd.Flags().BoolVar(&overwrite, "overwrite", false, "replace an existing environment file")
	return cmd
}

func load() (*app.Application, error) {
	cfg, err := app.LoadConfig(configPath)
	if err != nil {
		return nil, err
	}
	return app.New(cfg)
}

func migrateCommand() *cobra.Command {
	return &cobra.Command{Use: "migrate", Short: "apply database migrations", RunE: func(cmd *cobra.Command, _ []string) error {
		cfg, err := app.LoadConfig(configPath)
		if err != nil {
			return err
		}
		db, err := database.Open(database.Config{Driver: cfg.Database.Driver, DSN: cfg.Database.DSN, Host: cfg.Database.Host, Port: cfg.Database.Port, Name: cfg.Database.Name, User: cfg.Database.User, Password: cfg.Database.Password})
		if err != nil {
			return err
		}
		defer db.Close()
		return db.Migrate(cmd.Context())
	}}
}

func seedCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "seed", Short: "create the initial administrator and tenant", RunE: func(cmd *cobra.Command, _ []string) error {
		if strings.TrimSpace(adminUsername) == "" {
			adminUsername = os.Getenv("ECHO_ADMIN_ADMIN_USERNAME")
		}
		if strings.TrimSpace(adminPassword) == "" {
			adminPassword = os.Getenv("ECHO_ADMIN_ADMIN_PASSWORD")
		}
		if adminUsername == "" {
			adminUsername = "admin"
		}
		if adminPassword == "" {
			return fmt.Errorf("admin password is required: pass --password or ECHO_ADMIN_ADMIN_PASSWORD")
		}
		if tenantCode == "" {
			tenantCode = "default"
		}
		if tenantName == "" {
			tenantName = "Default tenant"
		}
		application, err := load()
		if err != nil {
			return err
		}
		defer application.Close()
		if err := application.Seed(cmd.Context(), adminUsername, adminPassword, tenantCode, tenantName, application.Config.Demo.Enabled); err != nil {
			return err
		}
		fmt.Printf("seeded administrator %q in tenant %q\n", adminUsername, tenantCode)
		return nil
	}}
	cmd.Flags().StringVarP(&adminUsername, "username", "u", "", "administrator username")
	cmd.Flags().StringVarP(&adminPassword, "password", "p", "", "administrator password (prefer environment variable in CI)")
	cmd.Flags().StringVar(&tenantCode, "tenant-code", "default", "initial tenant code")
	cmd.Flags().StringVar(&tenantName, "tenant-name", "Default tenant", "initial tenant name")
	return cmd
}

func genCommand() *cobra.Command {
	return &cobra.Command{Use: "gen", Short: "inspect registered modules and generation capabilities", RunE: func(cmd *cobra.Command, _ []string) error {
		fmt.Println("code generation preview is available through the development API; module generators are registered by feature packages")
		return nil
	}}
}
func pluginCommand() *cobra.Command {
	return &cobra.Command{Use: "plugin", Short: "manage optional modules", RunE: func(cmd *cobra.Command, _ []string) error {
		fmt.Println("no optional plugins are installed")
		return nil
	}}
}
