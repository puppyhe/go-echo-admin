package admin

import (
	"context"
	"fmt"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func (s *Service) ListRoles(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.Role
	q := s.DB.WithContext(ctx).Model(&database.Role{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "name": r.Name, "code": r.Code, "status": r.Status, "description": r.Description, "created_at": r.CreatedAt})
	}
	return pageResult(items, page, size, total), nil
}
func (s *Service) CreateRole(ctx context.Context, id tenant.Identity, name, code, description string) (map[string]any, error) {
	if name == "" || code == "" {
		return nil, httpx.NewError(400, "VALIDATION_ERROR", "name and code are required")
	}
	role := database.Role{TenantID: id.TenantID, Name: name, Code: code, Description: description, Status: "active"}
	if err := s.DB.WithContext(ctx).Create(&role).Error; err != nil {
		return nil, httpx.NewError(409, "ROLE_EXISTS", "Role name already exists")
	}
	return map[string]any{"id": fmt.Sprint(role.ID), "name": role.Name, "code": role.Code, "status": role.Status, "description": role.Description}, nil
}
func (s *Service) ListDepartments(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.Department
	q := s.DB.WithContext(ctx).Model(&database.Department{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("sort asc,id asc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "name": r.Name, "code": r.Code, "parent_id": r.ParentID, "leader_id": r.LeaderID, "sort": r.Sort, "status": r.Status})
	}
	return pageResult(items, page, size, total), nil
}
func (s *Service) ListDictionaries(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.Dictionary
	q := s.DB.WithContext(ctx).Model(&database.Dictionary{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "name": r.Name, "code": r.Type, "type": r.Type, "status": r.Status})
	}
	return pageResult(items, page, size, total), nil
}
func (s *Service) ListParams(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.SystemParam
	q := s.DB.WithContext(ctx).Model(&database.SystemParam{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		value := r.Value
		if r.Sensitive {
			value = "******"
		}
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "name": r.Name, "key": r.Key, "value": value, "sensitive": r.Sensitive})
	}
	return pageResult(items, page, size, total), nil
}
func (s *Service) ListLoginLogs(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.TenantLoginLog
	q := s.DB.WithContext(ctx).Model(&database.TenantLoginLog{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "user_id": r.UserID, "ip": r.IP, "result": r.Result, "failure_reason": r.FailureReason, "request_id": r.RequestID, "created_at": r.CreatedAt})
	}
	return pageResult(items, page, size, total), nil
}
func (s *Service) ListAuditLogs(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	page, size = normalizePage(page, size)
	var total int64
	var rows []database.AuditLog
	q := s.DB.WithContext(ctx).Model(&database.AuditLog{}).Where("tenant_id = ?", id.TenantID)
	q.Count(&total)
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]any{"id": fmt.Sprint(r.ID), "user_id": r.UserID, "resource": r.Resource, "action": r.Action, "method": r.Method, "path": r.Path, "result": r.Result, "request_id": r.RequestID, "ip": r.IP, "created_at": r.CreatedAt})
	}
	return pageResult(items, page, size, total), nil
}
func normalizePage(page, size int) (int, int) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}
func pageResult(items any, page, size int, total int64) map[string]any {
	return map[string]any{"items": items, "page": page, "page_size": size, "total": total}
}
