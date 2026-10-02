package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func orgContext(s *Service, method, path string, body any, identity tenant.Identity) *echo.Context {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	c.Set(identityKey, identity)
	return c
}

func setOrgPath(c *echo.Context, values ...string) {
	pathValues := make(echo.PathValues, 0, len(values)/2)
	for i := 0; i+1 < len(values); i += 2 {
		pathValues = append(pathValues, echo.PathValue{Name: values[i], Value: values[i+1]})
	}
	c.SetPathValues(pathValues)
}

func orgIdentity(t *testing.T, s *Service, code, username string) tenant.Identity {
	t.Helper()
	var ten database.Tenant
	if err := s.DB.Where("code = ?", code).First(&ten).Error; err != nil {
		t.Fatal(err)
	}
	var user database.User
	if err := s.DB.Where("username = ?", username).First(&user).Error; err != nil {
		t.Fatal(err)
	}
	var membership database.TenantMembership
	if err := s.DB.Where("tenant_id = ? AND user_id = ?", ten.ID, user.ID).First(&membership).Error; err != nil {
		t.Fatal(err)
	}
	return tenant.Identity{TenantID: ten.ID, UserID: user.ID, MembershipID: membership.ID}
}

func orgErrorStatus(t *testing.T, err error, status int) {
	t.Helper()
	var domain *httpx.Error
	if !errorsAs(err, &domain) || domain.Status != status {
		t.Fatalf("expected status %d, got %v", status, err)
	}
}

// errorsAs is kept local so this test remains explicit about the domain error
// returned by handlers without depending on Echo's global error handler.
func errorsAs(err error, target **httpx.Error) bool {
	if err == nil {
		return false
	}
	if domain, ok := err.(*httpx.Error); ok {
		*target = domain
		return true
	}
	return false
}

func TestOrganizationPersistenceAndTenantIsolation(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "alice", "password-123", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(ctx, "bob", "password-456", "two", "Two", false); err != nil {
		t.Fatal(err)
	}
	one := orgIdentity(t, s, "one", "alice")
	two := orgIdentity(t, s, "two", "bob")

	create := orgContext(s, http.MethodPost, "/enterprise/org/departments", map[string]any{"name": "研发", "sort": 1, "status": true}, one)
	if err := s.legacyDepartmentMutation(create); err != nil {
		t.Fatal(err)
	}
	var department database.Department
	if err := s.DB.Where("tenant_id = ? AND name = ?", one.TenantID, "研发").First(&department).Error; err != nil {
		t.Fatal(err)
	}
	createOther := orgContext(s, http.MethodPost, "/enterprise/org/departments", map[string]any{"name": "销售"}, two)
	if err := s.legacyDepartmentMutation(createOther); err != nil {
		t.Fatal(err)
	}
	var other database.Department
	if err := s.DB.Where("tenant_id = ? AND name = ?", two.TenantID, "销售").First(&other).Error; err != nil {
		t.Fatal(err)
	}

	// A parent id from another tenant must never be accepted.
	cross := orgContext(s, http.MethodPost, "/enterprise/org/departments", map[string]any{"name": "错误", "parentId": other.ID}, one)
	orgErrorStatus(t, s.legacyDepartmentMutation(cross), http.StatusBadRequest)

	positionCtx := orgContext(s, http.MethodPost, "/enterprise/org/positions", map[string]any{"name": "工程师", "code": "engineer", "status": true}, one)
	if err := s.legacyPositionMutation(positionCtx); err != nil {
		t.Fatal(err)
	}
	var position database.Position
	if err := s.DB.Where("tenant_id = ? AND code = ?", one.TenantID, "engineer").First(&position).Error; err != nil {
		t.Fatal(err)
	}

	membershipCtx := orgContext(s, http.MethodPut, "/enterprise/org/users/"+itoa(one.UserID)+"/memberships", map[string]any{"departmentIds": []uint64{department.ID}, "positionIds": []uint64{position.ID}}, one)
	setOrgPath(membershipCtx, "id", itoa(one.UserID))
	if err := s.legacyUserMembership(membershipCtx); err != nil {
		t.Fatal(err)
	}
	var dm database.DepartmentMember
	if err := s.DB.Where("tenant_id = ? AND department_id = ? AND user_id = ?", one.TenantID, department.ID, one.UserID).First(&dm).Error; err != nil {
		t.Fatal(err)
	}
	var pm database.PositionMember
	if err := s.DB.Where("tenant_id = ? AND position_id = ? AND user_id = ?", one.TenantID, position.ID, one.UserID).First(&pm).Error; err != nil {
		t.Fatal(err)
	}
	var tm database.TenantMembership
	if err := s.DB.Where("tenant_id = ? AND user_id = ?", one.TenantID, one.UserID).First(&tm).Error; err != nil || tm.PrimaryDepartmentID == nil || *tm.PrimaryDepartmentID != department.ID {
		t.Fatalf("primary department was not persisted: %#v, %v", tm, err)
	}

	// The other tenant cannot read or mutate this tenant's organization rows.
	readOther := orgContext(s, http.MethodGet, "/enterprise/org/departments/"+itoa(department.ID)+"/members", nil, two)
	setOrgPath(readOther, "kind", "departments", "id", itoa(department.ID))
	orgErrorStatus(t, s.legacyOrgMembers(readOther), http.StatusNotFound)
}

func itoa(id uint64) string {
	return strconv.FormatUint(id, 10)
}
