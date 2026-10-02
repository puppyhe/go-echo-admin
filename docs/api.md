# API 合约

服务端 API 使用 `/api/v1` 前缀。成功响应统一为：

```json
{"code":"OK","message":"success","data":{},"request_id":"..."}
```

列表 `data` 使用 `{items, page, page_size, total}`。ID 以字符串序列化，时间使用 RFC 3339。错误响应的 `code` 是稳定错误码，例如 `AUTH_REQUIRED`、`AUTH_INVALID_TOKEN`、`TENANT_SELECTION_REQUIRED`、`TENANT_CONTEXT_REQUIRED`、`TENANT_ACCESS_DENIED` 和 `TENANT_SUSPENDED`。

## 公开接口

- `POST /api/v1/auth/login`：租户管理员使用用户名/邮箱、密码和必填 `tenant_code` 登录。密码优先校验该租户成员凭据。
- `POST /api/v1/auth/switch-tenant`：提交 `selection_token`、`tenant_code`，签发当前租户 Access/Refresh Token。
- `POST /api/v1/auth/refresh`：提交 `refresh_token`。Refresh Token 单次轮换，旧令牌立即撤销。

平台初始化使用独立入口（兼容参考前端的 `code: 0 / msg / data` 响应格式）：

- `POST /api/platform/login`：平台管理员登录，返回 `data.token`。
- `GET /api/tenancy/info`、`GET /api/tenancy/resolve?code=acme`：租户入口检查和编码解析。
- `GET /api/platform/tenants`：携带 `x-platform-token` 查询租户。
- `POST /api/platform/tenants`：携带 `x-platform-token` 创建租户，同时创建租户管理员成员和初始权限菜单。请求示例：`{"code":"acme","name":"Acme","adminUsername":"admin","adminPassword":"at-least-12-chars"}`。
- `POST /api/platform/tenants/:id/enable|disable|retry`：启用、停用或重试租户。

## 受保护接口

请求使用 `Authorization: Bearer <access_token>`。认证中间件从令牌恢复租户成员关系，忽略请求体或请求头中的 `tenant_id`。

自动化调用也可以使用管理端签发的 API Token：`Authorization: Bearer gea_...`。服务端只按哈希查找令牌，并重新校验令牌所属租户、成员、角色、状态和过期时间；令牌作废后立即不可用。

API 资源同步后，服务端会在认证中间件中按“请求方法 + 路径”检查租户禁用状态和角色 API 授权。尚未同步的旧路由继续使用菜单权限兼容链路；API Token 始终受签发时选择的角色约束。

- `GET /api/v1/auth/me`、`POST /api/v1/auth/logout`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/users`、`POST /api/v1/users`、`GET|PUT|DELETE /api/v1/users/:id`
- `GET|POST /api/v1/roles`
- `GET /api/v1/menus`、`GET /api/v1/permissions`
- `GET /api/v1/departments`、`/dictionaries`、`/params`
- `GET /api/v1/audit/login-logs`、`/audit/logs`
- `GET /api/v1/tenants/current`；平台管理员可分页查询 `GET /api/v1/tenants`

参考前端兼容接口使用 `/api` 基址（开发代理会将其转发到后端），其中 `/api/api/*` 提供 API 资源注册、路由同步、租户忽略和角色 API 授权；`/api/sysDictionary/*`、`/api/sysParams/*`、`/api/sysLoginLog/*` 和 `/api/sysOperationRecord/*` 分别提供字典、参数、登录日志和操作审计管理。所有兼容接口都复用当前租户 Token，平台 API 资源的增删改需要平台管理员权限。

账户与安全兼容接口还包括：

- `POST /api/user/changePassword`、`PUT /api/user/setSelfInfo`、`PUT /api/user/setSelfSetting`：当前租户个人资料、密码和前端偏好。
- `GET|PUT /api/system/security`、`GET /api/security/password-status`：租户安全策略和密码规则。
- `POST /api/system/getServerInfo`：服务器运行信息（CPU、内存、Go 版本）。
- `GET|PUT|DELETE /api/sysError/*`：错误日志列表、详情、处理方案和批量作废。
- `POST /api/sysApiToken/createApiToken|getApiTokenList|deleteApiToken`：API Token 签发、查询和作废，仅平台管理员可管理。

文件中心接口：

- `POST /api/fileUploadAndDownload/upload`：使用 multipart 字段 `file` 上传到当前租户，返回文件 ID、随机下载地址、SHA-256、MIME 和大小。
- `GET|POST /api/fileUploadAndDownload/getFileList`、`GET /api/fileUploadAndDownload/findFile`：分页查询当前租户文件。
- `PUT|POST /api/fileUploadAndDownload/updateFile`：修改当前租户文件的名称、分类、标签和备注，不改变实际存储键。
- `PUT|POST /api/fileUploadAndDownload/updateFile`：修改当前租户文件的显示名称、分类、标签和备注。
- `DELETE|POST /api/fileUploadAndDownload/deleteFile`、`DELETE|POST /api/fileUploadAndDownload/deleteFileByIds`：删除当前租户文件及其存储内容。
- `GET /api/uploads/:tenantCode/:key`：受认证保护的文件内容读取；服务端会校验租户编码、会话租户和文件元数据，不能跨租户访问。
- 新模块可使用 `POST|GET|PUT|DELETE /api/v1/files`，底层复用同一租户存储适配器。

代码生成接口（安全预览模式）：

- `GET /api/autoCode/getDB`、`GET /api/autoCode/getTables`、`GET /api/autoCode/getColumn`：读取当前数据库的名称、表和字段元数据。
- `POST /api/autoCode/preview`：生成 Model、Repository、Service、Handler、路由清单、迁移、测试和前端页面的确定性预览。
- `POST /api/autoCode/createTemp`：默认仅保存租户隔离的生成记录、请求配置和文件 SHA-256，不覆盖工作区文件；`onlyTemplate=true` 时返回 ZIP。
- `POST /api/autoCode/getSysHistory`、`getMeta`、`delSysHistory`、`rollback`：查看、复用、删除和安全回滚生成记录状态。
- `POST /api/autoCode/getPackage`、`createPackage`、`delPackage`：维护当前租户的代码包名称。

通知与运维接口：

- `/api/enterprise/notifications`：当前用户的通知收件箱，支持分页、未读筛选、批量已读/删除和全部已读。
- `/api/enterprise/channels`、`/notification-templates`、`/notification-preferences`、`/notification-config`、`/notification-providers`：租户级通知渠道、模板、偏好、运行参数和服务商配置。
- `/api/enterprise/deliveries`：通知投递记录和失败重试入口；敏感服务商凭据只保存于租户记录，不在列表响应中返回。
- `/api/enterprise/ops/jobs`、`/ops/templates`、`/ops/runs`、`/ops/settings`：租户级任务定义、模板、运行记录和执行开关。手动运行进入 `queued`，由 scheduler worker 执行并记录 `queued/leased/running/success|failed` 状态。

文件分片、组织权限与生产化接口：

- `GET /api/v1/files/capabilities`：返回文件上限、分片大小和存储能力。
- `POST /api/v1/files/multipart/initiate`：创建当前租户的分片上传会话。
- `GET /api/v1/files/multipart/:id`：查看会话状态与已完成分片，客户端可据此断点续传。
- `PUT /api/v1/files/multipart/:id/parts/:part`：提交原始二进制分片，可用 `X-Chunk-Hash` 校验分片 SHA-256。
- `POST /api/v1/files/multipart/:id/complete`：按顺序合并、校验完整文件哈希并写入文件中心。
- `DELETE /api/v1/files/multipart/:id`：取消会话并清理临时对象。
- `GET|PUT /api/v1/enterprise/org/users/:id/organization`：读取或保存用户部门、岗位和主部门关系。
- `GET /api/v1/enterprise/permissions/catalog`、`GET|PUT /api/v1/enterprise/permissions/matrix/:roleId`：读取资源目录并原子替换角色菜单、API 和资源动作授权。
- `GET /api/v1/enterprise/audit/report`：按时间、用户、资源、动作和结果汇总审计事件。
- `GET /api/v1/enterprise/monitor/overview`：返回数据库连接池、进程内存、协程数和当前租户错误/审计事件概览。

定时任务由后端 scheduler 扫描 `OpsJob` 的五段 cron 表达式并投递给 worker。生产建议设置 `ECHO_ADMIN_QUEUE_DRIVER=database`，使 `OpsRun` 的 `queued/leased/running` 状态承担持久队列；HTTP 任务还必须在租户运维配置中启用并通过允许主机校验。内置心跳任务不会发起外部请求，未知执行器会失败并记录错误码。

## 健康与版本

`GET /health/live`、`GET /health/ready`、`GET /version` 不需要登录，并仍然使用统一响应包装。Ready 检查会验证数据库连接，不会返回凭据或连接串。

## 示例

```sh
# development 环境启动后
TOKEN=$(curl -s http://127.0.0.1:8080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"change-me","tenant_code":"default"}' \
  | jq -r '.data.access_token')
curl -s http://127.0.0.1:8080/api/v1/users \
  -H "Authorization: Bearer ${TOKEN}"
```
