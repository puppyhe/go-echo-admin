package admin

import (
	"context"
	"net/http"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
)

func TestAPIResourceRuntimeAuthorization(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "alice", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "alice")
	resource := database.APIResource{Method: http.MethodGet, Path: "/secured/report", Group: "报表", Permission: "报表读取"}
	if err := s.DB.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}

	// A registered API with no role assignments remains compatible with the
	// existing permission model.
	open := orgContext(s, http.MethodGet, resource.Path, nil, id)
	open.SetPath(resource.Path)
	if err := s.authorizeAPIResource(open, id); err != nil {
		t.Fatalf("unassigned API should remain compatible: %v", err)
	}

	role := database.Role{TenantID: id.TenantID, Name: "审计员", Code: "auditor", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.IAMRoleAPI{TenantID: id.TenantID, RoleID: role.ID, APIResourceID: resource.ID}).Error; err != nil {
		t.Fatal(err)
	}

	denied := orgContext(s, http.MethodGet, resource.Path, nil, id)
	denied.SetPath(resource.Path)
	if err := s.authorizeAPIResource(denied, id); err == nil {
		t.Fatal("user without the assigned role unexpectedly passed API authorization")
	}

	if err := s.DB.Create(&database.RoleMembership{TenantID: id.TenantID, RoleID: role.ID, UserID: id.UserID}).Error; err != nil {
		t.Fatal(err)
	}
	allowed := orgContext(s, http.MethodGet, resource.Path, nil, id)
	allowed.SetPath(resource.Path)
	if err := s.authorizeAPIResource(allowed, id); err != nil {
		t.Fatalf("assigned role should pass API authorization: %v", err)
	}

	if err := s.DB.Create(&database.TenantAPIGrant{TenantID: id.TenantID, APIResourceID: resource.ID, Enabled: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Model(&database.TenantAPIGrant{}).Where("tenant_id = ? AND api_resource_id = ?", id.TenantID, resource.ID).Update("enabled", false).Error; err != nil {
		t.Fatal(err)
	}
	disabled := orgContext(s, http.MethodGet, resource.Path, nil, id)
	disabled.SetPath(resource.Path)
	if err := s.authorizeAPIResource(disabled, id); err == nil {
		t.Fatal("disabled tenant API unexpectedly passed authorization")
	}
}

func TestAPIResourceRuntimeAuthorizationHonorsAPITokenRole(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "alice", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "alice")
	role := database.Role{TenantID: id.TenantID, Name: "审计员", Code: "auditor", Status: "active"}
	other := database.Role{TenantID: id.TenantID, Name: "只读", Code: "reader", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.RoleMembership{TenantID: id.TenantID, RoleID: role.ID, UserID: id.UserID}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.RoleMembership{TenantID: id.TenantID, RoleID: other.ID, UserID: id.UserID}).Error; err != nil {
		t.Fatal(err)
	}
	resource := database.APIResource{Method: http.MethodPost, Path: "/secured/write", Group: "系统", Permission: "写入"}
	if err := s.DB.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.IAMRoleAPI{TenantID: id.TenantID, RoleID: role.ID, APIResourceID: resource.ID}).Error; err != nil {
		t.Fatal(err)
	}

	c := orgContext(s, http.MethodPost, resource.Path, nil, id)
	c.SetPath(resource.Path)
	c.Set("claims", Claims{RoleID: other.ID, TokenType: "api_access"})
	if err := s.authorizeAPIResource(c, id); err == nil {
		t.Fatal("API token with another role unexpectedly passed authorization")
	}
	c.Set("claims", Claims{RoleID: role.ID, TokenType: "api_access"})
	if err := s.authorizeAPIResource(c, id); err != nil {
		t.Fatalf("API token with assigned role was rejected: %v", err)
	}
}
