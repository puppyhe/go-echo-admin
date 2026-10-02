# 配置参考

服务启动时按以下顺序合并配置：默认值 → `.env` 文件 → `ECHO_ADMIN_*` 环境变量 → CLI 参数。启动日志只输出配置来源、环境和非敏感摘要；密码、连接串、JWT 密钥和对象存储凭据必须脱敏。

执行 `go run ./cmd/echo-admin init` 会创建本地 `.env`。该文件已被 Git 忽略，生产应由秘密管理系统或部署环境注入。仓库不提交带真实凭据的示例配置。

## 核心键

| 配置 | 默认/示例 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `development` | 仅允许 `development`、`production` |
| `ECHO_ADMIN_SERVER_ADDRESS` | `:8080` | HTTP 监听地址 |
| `ECHO_ADMIN_DATABASE_DRIVER` | `mysql` | 数据库驱动，仅支持 MySQL |
| `ECHO_ADMIN_DATABASE_DSN` | 空 | 设置后优先于拆分的连接字段；生产建议由秘密管理注入 |
| `ECHO_ADMIN_DATABASE_HOST` | `127.0.0.1` | MySQL 主机 |
| `ECHO_ADMIN_DATABASE_PORT` | `3306` | MySQL 端口 |
| `ECHO_ADMIN_DATABASE_NAME` | `echo_admin` | 数据库名 |
| `ECHO_ADMIN_DATABASE_USER` | `echo_admin` | 数据库用户 |
| `ECHO_ADMIN_DATABASE_PASSWORD` | 空 | 数据库密码 |
| `ECHO_ADMIN_DATABASE_ROOT_PASSWORD` | 空 | 仅 Docker Compose 初始化使用 |
| `ECHO_ADMIN_CACHE_ENABLED` | `false` | 是否启用 Redis |
| `ECHO_ADMIN_CACHE_ADDRESS` | `127.0.0.1:6379` | Redis 地址 |
| `ECHO_ADMIN_QUEUE_DRIVER` | `memory` | 任务队列；生产建议使用 `database` 持久队列 |
| `ECHO_ADMIN_QUEUE_ADDRESS` | `127.0.0.1:6379` | 外部队列地址预留配置 |
| `ECHO_ADMIN_SCHEDULER_ENABLED` | `true` | 是否启动定时任务调度器 |
| `ECHO_ADMIN_SCHEDULER_WORKERS` | `2` | 任务执行 worker 数量 |
| `ECHO_ADMIN_SCHEDULER_POLL_INTERVAL` | `10s` | 调度扫描和队列轮询间隔 |
| `ECHO_ADMIN_AUTH_JWT_SECRET` | 空 | 至少 32 字符；生产必须随机生成 |
| `ECHO_ADMIN_AUTH_ACCESS_TTL` | `15m` | Access Token 有效期 |
| `ECHO_ADMIN_AUTH_REFRESH_TTL` | `168h` | Refresh Token 有效期 |
| `ECHO_ADMIN_DEMO_ENABLED` | `false` | 仅开发环境显式启用演示种子 |
| `ECHO_ADMIN_ADMIN_USERNAME` | 空 | `seed` 创建管理员时使用 |
| `ECHO_ADMIN_ADMIN_PASSWORD` | 空 | 不写死；生产启动前必须注入 |
| `ECHO_ADMIN_STORAGE_PROVIDER` | `local` | `local` 或 `s3` |
| `ECHO_ADMIN_STORAGE_PATH` | `./data/uploads` | 文件中心本地存储根目录；文件名由服务端随机生成 |
| `ECHO_ADMIN_STORAGE_MAX_BYTES` | `10485760` | 单文件和请求体上限，默认 10 MiB |
| `ECHO_ADMIN_STORAGE_S3_ENDPOINT` | 空 | S3/MinIO HTTP(S) 地址 |
| `ECHO_ADMIN_STORAGE_S3_BUCKET` | 空 | S3 存储桶 |
| `ECHO_ADMIN_STORAGE_S3_REGION` | `us-east-1` | S3 签名区域 |
| `ECHO_ADMIN_STORAGE_S3_ACCESS_KEY` | 空 | S3 访问密钥 |
| `ECHO_ADMIN_STORAGE_S3_SECRET_KEY` | 空 | S3 私密密钥 |
| `ECHO_ADMIN_STORAGE_S3_PREFIX` | 空 | 对象前缀 |
| `ECHO_ADMIN_STORAGE_S3_USE_PATH_STYLE` | `true` | MinIO 等兼容服务建议开启 |
| `ECHO_ADMIN_SERVER_ALLOWED_ORIGINS` | `http://127.0.0.1:5173` | 逗号分隔；生产禁止 `*` 搭配凭据 |
| `ECHO_ADMIN_LOG_LEVEL` | `info` | `debug` 只用于开发 |
| `ECHO_ADMIN_LOG_FORMAT` | `json` | `json` 或 `text` |

代码只应通过强类型 Config 访问配置，不应在 Handler/Service 中直接调用 Viper。数据库、认证密钥和存储凭据修改后重启生效；热更新只允许明确声明的非敏感参数。

## 开发配置

开发时运行 `init` 后可按注释填写数据库和 JWT 配置。Docker Compose 使用 MySQL 8.4 和 Redis 7.4，并提供 `backend`、`web` 服务；只调试主机后端时运行 `docker compose up -d mysql redis`，完整容器栈运行 `docker compose up -d`。端口可通过 `ECHO_ADMIN_DATABASE_PORT`、`ECHO_ADMIN_CACHE_PORT`、`ECHO_ADMIN_SERVER_PORT` 和 `ECHO_ADMIN_WEB_PORT` 调整。`DEMO_ENABLED=true` 仅用于本地演示，且必须配合 `APP_ENV=development`。

## 生产校验

生产启动必须：

- 设置随机 JWT 密钥、数据库凭据和非通配 CORS 来源；
- 禁用演示数据和代码生成开发工具；
- 使用 TLS 终止、限流、结构化日志和受控错误详情；
- 在应用启动前完成备份检查和迁移评审；
- 确保管理员初始密码通过一次性秘密或初始化命令注入，并在首次登录后修改。

配置校验失败应阻止启动并指出缺失键或不安全值，不得静默回退到开发默认值。
