# 工程架构

Go Echo Admin 是模块化单体：后端提供稳定的 JSON API，React 管理前端通过 API 登录、加载租户权限和处理业务。默认数据库为 MySQL，Redis 为可选依赖。

工程参考 Bytebase 后端的启动编排、持久化隔离和迁移组织方式，而不引入其产品业务或企业功能；管理端参考已有 React 管理项目的工作台、表格和导航习惯。业务边界由 `docs/echo-admin-prd.md` 定义。

```text
cmd/server/            HTTP 服务入口
cmd/echo-admin/        Cobra CLI 入口
internal/app/          配置、依赖组装、启动生命周期
internal/module/       业务模型、服务与 HTTP 协议
internal/platform/     数据库、认证与基础设施适配
web/                   React + TypeScript 管理前端
migrations/            数据库升级说明与版本化迁移
```

## HTTP 链路

请求经过恢复、请求 ID、日志、安全/CORS、体积限制与限流后进入路由。公开认证接口不需要业务 Token；受保护接口先认证，再依据 Token 的租户与成员关系建立租户上下文，最后进行 API 权限校验和审计。Handler 绑定与验证 DTO，调用服务后返回统一结构；领域错误交由全局错误处理器转换。

Token 中的租户上下文是数据隔离边界。请求头或请求体的 `tenant_id` 不能覆盖已认证租户。租户切换需要校验用户成员关系、轮换会话并重新签发 Token。共享表中的租户查询需要始终带有 `tenant_id` 条件。

## 生命周期与配置

CLI 和 HTTP 共用强类型 Config 与应用服务。配置在启动时加载、校验并冻结；数据库、Token 密钥与存储凭据变更后重启。开发环境启动会执行兼容性 AutoMigrate，生产环境必须先执行升级 CLI/迁移服务；健康检查区分存活与依赖就绪，收到终止信号后关闭 HTTP、调度器与数据库连接。

`APP_ENV` 仅接受 `development` 和 `production`。演示数据属于显式开发配置，不存在自动切换 Demo 的运行环境。生产应禁用演示种子、开发工具和宽松 CORS，并从环境或秘密管理服务注入安全项。

## 能力边界与后续演进

当前工程覆盖认证、多租户、基础管理、租户隔离文件中心、代码生成安全预览、通知基础能力、任务运行记录、S3 兼容对象存储、分片续传、数据库持久队列、定时任务执行器、组织权限矩阵、审计报表、系统监控和生产升级工具。OIDC、OpenTelemetry 和多节点外部队列属于待选增强项，可按部署规模和集成需求接入。未实现的执行器应明确展示能力边界，不提供虚假的成功结果。

## 模块注册约定

业务模块应通过注册函数接入 Echo 路由，并将迁移、种子、菜单/API 资源和健康检查放在同一个模块边界内。Handler 只做绑定、验证和响应转换；领域错误返回 `httpx.Error`，由应用级 `HTTPErrorHandler` 统一映射。Repository 查询必须接收 `tenant.Identity` 或显式 `TenantScope`，没有租户上下文时失败关闭。
