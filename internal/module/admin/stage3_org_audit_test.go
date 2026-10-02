package admin

import (
	"context"
	"net/http"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
)

func TestStage3PermissionMatrixAndReportsAreTenantScoped(t *testing.T) {
	s := testService(t)
	if err := s.Seed(context.Background(), "admin", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "admin")
	role := database.Role{TenantID: id.TenantID, Name: "报表只读", Code: "report_reader", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	var menu database.Menu
	if err := s.DB.Where("tenant_id = ? AND path = ?", id.TenantID, "/ops/audit").First(&menu).Error; err != nil {
		t.Fatal(err)
	}
	put := orgContext(s, http.MethodPut, "/enterprise/permissions/matrix/"+itoa(role.ID), map[string]any{
		"menuIds": []uint64{menu.ID},
		"actions": []map[string]any{{"resource": "audit", "action": "list", "effect": true}, {"resource": "audit", "action": "list", "effect": false}},
	}, id)
	setOrgPath(put, "roleId", itoa(role.ID))
	if err := s.stage3PermissionMatrix(put); err != nil {
		t.Fatal(err)
	}
	var action database.IAMRoleAction
	if err := s.DB.Where("tenant_id = ? AND role_id = ? AND resource = ? AND action = ?", id.TenantID, role.ID, "audit", "list").First(&action).Error; err != nil {
		t.Fatal(err)
	}
	if action.Effect {
		t.Fatal("last duplicate action grant should be an explicit deny")
	}

	if err := s.DB.Create(&database.AuditLog{TenantID: &id.TenantID, UserID: &id.UserID, Resource: "role", Action: "update", Result: "success", Method: "PUT", Path: "/authority/updateAuthority"}).Error; err != nil {
		t.Fatal(err)
	}
	report := orgContext(s, http.MethodGet, "/enterprise/audit/report", nil, id)
	if err := s.stage3AuditReport(report); err != nil {
		t.Fatal(err)
	}
	monitor := orgContext(s, http.MethodGet, "/enterprise/monitor/overview", nil, id)
	if err := s.stage3MonitorOverview(monitor); err != nil {
		t.Fatal(err)
	}
}
