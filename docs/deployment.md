# 生产部署与升级

## 运行时拓扑

生产环境建议使用 `backend + MySQL + Redis + Nginx`。当前持久任务队列由 MySQL 中的运行记录承担，Redis 用于限流和可选缓存；文件中心可以使用本地持久卷，也可以切换到 S3 兼容对象存储。Compose 文件提供 MySQL、Redis、后端、前端和可选 MinIO，正式环境应将密码、JWT 密钥和对象存储密钥放在 Secret 管理系统中。

```sh
cp .env.example .env
# 编辑 .env，至少替换数据库密码、JWT 密钥、CORS 来源
docker compose up -d mysql redis
docker compose run --rm migrate
docker compose up -d backend web
```

`/health/live` 只表示进程存活，`/health/ready` 会检查数据库连接。反向代理应只公开前端和必要的健康检查，MySQL、Redis 和对象存储端口使用内部网络；不要把数据库端口映射到公网。

## 发布前检查

发布构建使用不可变镜像标签，并在发布前执行：

```sh
go vet ./...
go test ./...
npm --prefix web ci
npm --prefix web run build
docker compose config
```

生产配置需要满足：

- `APP_ENV=production`，关闭演示种子和开发工具。
- `ECHO_ADMIN_AUTH_JWT_SECRET` 至少 32 个随机字符。
- `ECHO_ADMIN_SERVER_ALLOWED_ORIGINS` 只包含实际域名，禁止 `*`。
- 设置 `ECHO_ADMIN_STORAGE_PROVIDER=local` 或 `s3`，并为生产文件配置持久卷或对象存储。
- 开启 Redis 时配置 `ECHO_ADMIN_CACHE_ENABLED=true` 与受限的 Redis 地址。
- 容器使用非 root 用户，数据库和上传目录使用独立持久卷，备份目录不挂载到公网。

## 数据库升级

升级采用“备份 → 计划 → 应用 → 验证”的顺序。`upgrade plan` 只连接数据库并输出目标版本，不写入任何表；`upgrade apply` 执行当前可审查的增量结构并记录版本。破坏性变更必须先增加版本化迁移，不能依赖 AutoMigrate 删除列。

```sh
make backup BACKUP_OUTPUT=backups/release-2026-10-02.sql
make upgrade-plan
make upgrade
make upgrade-status
curl -fsS http://127.0.0.1:8080/health/ready
```

备份命令调用本机 `mysqldump`，密码通过 `MYSQL_PWD` 传给子进程，不出现在命令参数中；使用 DSN 连接时请按实际连接参数执行 `mysqldump`。升级失败时先保留日志和备份，再回滚应用镜像；数据库回滚只能使用经过验证的备份或专门的逆向迁移。

## 容器升级

先拉取新镜像并执行迁移，再滚动替换后端：

```sh
docker compose pull
docker compose run --rm migrate
docker compose up -d --no-deps backend web
docker compose ps
docker compose logs --tail=200 backend
```

开发环境后端启动仍会执行兼容性的 AutoMigrate，以便新环境开箱即用；生产环境后端不会自动改表，生产发布的事实来源是升级 CLI 和版本化迁移记录。不要在数据库迁移完成前删除旧镜像或备份。
