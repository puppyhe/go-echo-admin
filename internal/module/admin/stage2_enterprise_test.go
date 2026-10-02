package admin

import (
	"context"
	"net/http"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
)

func TestNotificationPreferenceSaveWithQuietHours(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	c := orgContext(s, http.MethodPut, "/enterprise/notification-preferences", map[string]any{
		"matrix": map[string]any{}, "quietEnabled": true, "quietStart": "09:00", "quietEnd": "18:00", "timezone": "Asia/Shanghai", "version": 1,
	}, id)
	if err := s.stage2PreferenceSave(c); err != nil {
		t.Fatal(err)
	}
	var row database.NotificationPreference
	if err := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if !row.Quiet || row.QuietStart != "09:00" || row.QuietEnd != "18:00" || row.Timezone != "Asia/Shanghai" {
		t.Fatalf("unexpected preference %#v", row)
	}
}
