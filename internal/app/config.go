package app

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Environment string
	ConfigFile  string
	Server      struct {
		Address        string
		AllowedOrigins []string
		RequestTimeout time.Duration
	}
	Database struct {
		Driver, DSN, Host, Name, User, Password string
		Port                                    int
	}
	Auth struct {
		JWTSecret             string
		AccessTTL, RefreshTTL time.Duration
	}
	Cache struct {
		Enabled bool
		Address string
	}
	Queue struct {
		Driver  string
		Address string
	}
	Scheduler struct {
		Enabled      bool
		Workers      int
		PollInterval time.Duration
	}
	Log struct {
		Level  string
		Format string
	}
	Demo    struct{ Enabled bool }
	Storage struct {
		Provider       string
		Path           string
		MaxBytes       int64
		S3Endpoint     string
		S3Bucket       string
		S3Region       string
		S3AccessKey    string
		S3SecretKey    string
		S3Prefix       string
		S3UsePathStyle bool
	}
}

func LoadConfig(path string) (*Config, error) {
	v := viper.New()
	v.SetEnvPrefix("ECHO_ADMIN")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()
	defaults := map[string]any{"server.address": ":8080", "server.allowed_origins": []string{"http://localhost:8000", "http://localhost:5173"}, "server.request_timeout": "30s", "database.driver": "mysql", "database.host": "127.0.0.1", "database.port": 3306, "database.name": "echo_admin", "database.user": "echo_admin", "auth.access_ttl": "15m", "auth.refresh_ttl": "168h", "cache.enabled": false, "cache.address": "127.0.0.1:6379", "queue.driver": "memory", "queue.address": "127.0.0.1:6379", "scheduler.enabled": true, "scheduler.workers": 2, "scheduler.poll_interval": "10s", "log.level": "info", "log.format": "json", "demo.enabled": false, "storage.provider": "local", "storage.path": "./data/uploads", "storage.max_bytes": 10485760, "storage.s3_region": "us-east-1", "storage.s3_use_path_style": true}
	for k, val := range defaults {
		v.SetDefault(k, val)
	}
	if path == "" {
		path = ".env"
	}
	v.SetConfigFile(path)
	v.SetConfigType("env")
	if err := v.ReadInConfig(); err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("read config: %w", err)
		}
	}
	// .env uses the same names as process environment variables, including APP_ENV.
	for _, key := range []string{"server.address", "server.allowed_origins", "server.request_timeout", "database.driver", "database.dsn", "database.host", "database.port", "database.name", "database.user", "database.password", "auth.jwt_secret", "auth.access_ttl", "auth.refresh_ttl", "cache.enabled", "cache.address", "queue.driver", "queue.address", "scheduler.enabled", "scheduler.workers", "scheduler.poll_interval", "log.level", "log.format", "demo.enabled", "storage.provider", "storage.path", "storage.max_bytes", "storage.s3_endpoint", "storage.s3_bucket", "storage.s3_region", "storage.s3_access_key", "storage.s3_secret_key", "storage.s3_prefix", "storage.s3_use_path_style"} {
		env := "ECHO_ADMIN_" + strings.ToUpper(strings.ReplaceAll(key, ".", "_"))
		if value := v.Get(env); value != nil {
			v.SetDefault(key, value)
		}
		_ = v.BindEnv(key, env)
	}
	environment := os.Getenv("APP_ENV")
	if environment == "" {
		environment = v.GetString("APP_ENV")
	}
	if environment == "" {
		environment = "development"
	}
	c := &Config{Environment: environment, ConfigFile: path}
	c.Server.Address = v.GetString("server.address")
	c.Server.AllowedOrigins = allowedOrigins(v.Get("server.allowed_origins"))
	c.Server.RequestTimeout = v.GetDuration("server.request_timeout")
	c.Database.Driver = v.GetString("database.driver")
	c.Database.DSN = v.GetString("database.dsn")
	c.Database.Host = v.GetString("database.host")
	c.Database.Port = v.GetInt("database.port")
	c.Database.Name = v.GetString("database.name")
	c.Database.User = v.GetString("database.user")
	c.Database.Password = v.GetString("database.password")
	c.Auth.JWTSecret = v.GetString("auth.jwt_secret")
	c.Auth.AccessTTL = v.GetDuration("auth.access_ttl")
	c.Auth.RefreshTTL = v.GetDuration("auth.refresh_ttl")
	c.Cache.Enabled = v.GetBool("cache.enabled")
	c.Cache.Address = v.GetString("cache.address")
	c.Queue.Driver = v.GetString("queue.driver")
	c.Queue.Address = v.GetString("queue.address")
	c.Scheduler.Enabled = v.GetBool("scheduler.enabled")
	c.Scheduler.Workers = v.GetInt("scheduler.workers")
	c.Scheduler.PollInterval = v.GetDuration("scheduler.poll_interval")
	c.Log.Level = v.GetString("log.level")
	c.Log.Format = v.GetString("log.format")
	c.Demo.Enabled = v.GetBool("demo.enabled")
	c.Storage.Provider = strings.ToLower(strings.TrimSpace(v.GetString("storage.provider")))
	c.Storage.Path = v.GetString("storage.path")
	c.Storage.MaxBytes = v.GetInt64("storage.max_bytes")
	c.Storage.S3Endpoint = v.GetString("storage.s3_endpoint")
	c.Storage.S3Bucket = v.GetString("storage.s3_bucket")
	c.Storage.S3Region = v.GetString("storage.s3_region")
	c.Storage.S3AccessKey = v.GetString("storage.s3_access_key")
	c.Storage.S3SecretKey = v.GetString("storage.s3_secret_key")
	c.Storage.S3Prefix = v.GetString("storage.s3_prefix")
	c.Storage.S3UsePathStyle = v.GetBool("storage.s3_use_path_style")
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return c, nil
}

// allowedOrigins accepts both the []string default and the comma-separated
// ECHO_ADMIN_SERVER_ALLOWED_ORIGINS environment value. Empty entries are
// discarded so Echo's CORS middleware never receives an invalid origin.
func allowedOrigins(raw any) []string {
	var values []string
	switch value := raw.(type) {
	case []string:
		values = value
	case string:
		values = strings.Split(value, ",")
	default:
		values = []string{}
	}
	origins := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			origins = append(origins, value)
		}
	}
	return origins
}
func (c *Config) Validate() error {
	if c.Environment != "development" && c.Environment != "production" {
		return fmt.Errorf("APP_ENV must be development or production")
	}
	if len(c.Auth.JWTSecret) < 32 {
		return fmt.Errorf("ECHO_ADMIN_AUTH_JWT_SECRET must contain at least 32 characters; run echo-admin init")
	}
	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "mysql") {
		return fmt.Errorf("database driver must be mysql")
	}
	if c.Environment == "production" {
		if c.Demo.Enabled {
			return fmt.Errorf("demo configuration is forbidden in production")
		}
		if c.Database.Password == "" && c.Database.DSN == "" {
			return fmt.Errorf("production requires database credentials")
		}
		for _, origin := range c.Server.AllowedOrigins {
			if origin == "*" {
				return fmt.Errorf("wildcard CORS origin forbidden in production")
			}
		}
	}
	if c.Auth.AccessTTL <= 0 || c.Auth.RefreshTTL <= c.Auth.AccessTTL {
		return fmt.Errorf("token expiry settings are invalid")
	}
	if c.Log.Format != "json" && c.Log.Format != "text" {
		return fmt.Errorf("ECHO_ADMIN_LOG_FORMAT must be json or text")
	}
	if c.Cache.Enabled && strings.TrimSpace(c.Cache.Address) == "" {
		return fmt.Errorf("ECHO_ADMIN_CACHE_ADDRESS is required when cache is enabled")
	}
	if c.Queue.Driver != "memory" && c.Queue.Driver != "database" {
		return fmt.Errorf("ECHO_ADMIN_QUEUE_DRIVER must be memory or database")
	}
	if c.Scheduler.Workers < 1 || c.Scheduler.Workers > 100 || c.Scheduler.PollInterval <= 0 {
		return fmt.Errorf("scheduler worker and poll interval settings are invalid")
	}
	if c.Storage.Provider != "local" && c.Storage.Provider != "s3" {
		return fmt.Errorf("ECHO_ADMIN_STORAGE_PROVIDER must be local or s3")
	}
	if c.Storage.Provider == "s3" && (c.Storage.S3Endpoint == "" || c.Storage.S3Bucket == "" || c.Storage.S3Region == "" || c.Storage.S3AccessKey == "" || c.Storage.S3SecretKey == "") {
		return fmt.Errorf("S3 storage requires endpoint, bucket, region and credentials")
	}
	return nil
}
func InitEnvironment(path string, overwrite bool) error {
	if path == "" {
		path = ".env"
	}
	if !overwrite {
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("%s already exists", path)
		}
	}
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	contents := fmt.Sprintf("# Generated by echo-admin init. Never commit this file.\nAPP_ENV=development\nECHO_ADMIN_SERVER_ADDRESS=:8080\nECHO_ADMIN_SERVER_ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173\nECHO_ADMIN_DATABASE_DRIVER=mysql\nECHO_ADMIN_DATABASE_HOST=127.0.0.1\nECHO_ADMIN_DATABASE_PORT=3306\nECHO_ADMIN_DATABASE_NAME=echo_admin\nECHO_ADMIN_DATABASE_USER=echo_admin\nECHO_ADMIN_DATABASE_PASSWORD=%s\nECHO_ADMIN_AUTH_JWT_SECRET=%s\nECHO_ADMIN_AUTH_ACCESS_TTL=15m\nECHO_ADMIN_AUTH_REFRESH_TTL=168h\nECHO_ADMIN_CACHE_ENABLED=false\nECHO_ADMIN_CACHE_ADDRESS=127.0.0.1:6379\nECHO_ADMIN_QUEUE_DRIVER=memory\nECHO_ADMIN_QUEUE_ADDRESS=127.0.0.1:6379\nECHO_ADMIN_SCHEDULER_ENABLED=true\nECHO_ADMIN_SCHEDULER_WORKERS=2\nECHO_ADMIN_SCHEDULER_POLL_INTERVAL=10s\nECHO_ADMIN_DEMO_ENABLED=false\nECHO_ADMIN_STORAGE_PROVIDER=local\nECHO_ADMIN_STORAGE_PATH=./data/uploads\nECHO_ADMIN_STORAGE_MAX_BYTES=10485760\nECHO_ADMIN_STORAGE_S3_ENDPOINT=\nECHO_ADMIN_STORAGE_S3_BUCKET=echo-admin\nECHO_ADMIN_STORAGE_S3_REGION=us-east-1\nECHO_ADMIN_STORAGE_S3_ACCESS_KEY=\nECHO_ADMIN_STORAGE_S3_SECRET_KEY=\nECHO_ADMIN_STORAGE_S3_PREFIX=\nECHO_ADMIN_STORAGE_S3_USE_PATH_STYLE=true\n", hex.EncodeToString(random[:16]), hex.EncodeToString(random))
	return os.WriteFile(path, []byte(contents), 0600)
}
