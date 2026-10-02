# 参与贡献

感谢参与 Go Echo Admin。提交问题时请包含版本、运行环境、复现步骤和脱敏日志；不要提交 `.env`、密码、Access Token 或数据库连接凭据。

## 开发流程

1. Fork 仓库并从主分支创建主题分支。
2. 通过 `go run ./cmd/echo-admin init` 生成本地 `.env`。
3. 使用 `docker compose up -d` 启动 MySQL 和 Redis，参考 README 启动后端、前端。
4. 修改后执行 `go fmt ./...`、`go vet ./...`、`go test ./...` 和 `npm --prefix web run build`。
5. Pull Request 描述问题、行为变化、验证方法和兼容性影响。涉及权限或查询的修改需要双租户隔离验证。

## 工程约定

- Go module 统一为 `github.com/puppyhe/go-echo-admin`，项目内导入使用完整 module 路径；向本项目贡献代码的 Fork 保留该路径。包名按职责使用简短的小写名称，如 `app`、`database`、`tenant`；管理命令名称为 `echo-admin`。
- Handler 负责 HTTP 协议，Service 负责业务，Repository 负责数据访问。
- 受保护接口必须通过认证、租户上下文和授权链；租户资源缺少上下文时拒绝请求。
- 不从请求体或请求头接受任意 `tenant_id` 作为数据查询范围。
- 数据库修改通过版本化迁移提交。不要只修改本地表结构。
- 错误响应保持统一结构，生产响应不得暴露内部 SQL、连接串和堆栈。
- 新增环境变量需同步 `docs/configuration.md` 与 CLI 初始化模板。

项目以 [产品需求文档](docs/echo-admin-prd.md) 为边界。较大功能请先通过 Issue 描述场景、替代方案和计划交付范围。
