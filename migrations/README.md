# 数据库迁移

初始版本由 `internal/platform/database` 中的 GORM 模型作为结构定义，通过应用的迁移服务执行。开发环境 HTTP 启动会执行兼容性 AutoMigrate；生产环境使用 `echo-admin migrate` 或升级服务显式执行，迁移失败阻止发布继续。

```sh
go run ./cmd/echo-admin migrate
go run ./cmd/echo-admin upgrade plan
go run ./cmd/echo-admin upgrade apply
go run ./cmd/echo-admin upgrade status
```

默认数据库为 MySQL 8.4。迁移可重复执行：已存在且符合模型的表不会重复创建。**AutoMigrate 只覆盖初始开发结构，不能代替生产版本升级中的数据迁移**。发布前须将需要回填数据、添加复合外键、删除/重命名字段的变更固化为经过审查的版本化迁移。不要依赖 ORM 自动删除列或自动恢复业务数据。

租户业务表必须使用非空 `tenant_id`，索引以 `tenant_id` 开头；用户全局身份与租户成员关系分别保存。跨租户引用需要在服务校验之外增加数据库复合外键约束，并通过 MySQL 集成测试验证。具体表结构与已实现约束以模型为准，尚未发布的完整规范见产品需求文档。

Docker Compose 挂载此目录只是为将来版本化 SQL 迁移保留入口。MySQL 的 `/docker-entrypoint-initdb.d` 只在新数据卷初始化时执行，日常升级必须执行应用迁移命令。不要将真实数据库备份、生产导出或管理员密码提交到此目录。

生产发布先使用 `go run ./cmd/echo-admin backup` 或 `make backup` 创建备份，再执行 `upgrade plan` 和 `upgrade apply`。升级记录写入 `schema_migrations`，破坏性变更必须经过审查并增加显式版本迁移，不能依赖 AutoMigrate 删除列。
