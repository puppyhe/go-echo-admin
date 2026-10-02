// Package tenant carries authenticated tenant identity across application boundaries.
package tenant

import (
	"context"
	"errors"
)

type contextKey struct{}

// Identity is established from a verified session, never from user supplied headers.
type Identity struct {
	TenantID, UserID, MembershipID uint64
	PlatformAdmin                  bool
}

func WithIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, contextKey{}, identity)
}
func FromContext(ctx context.Context) (Identity, error) {
	v, ok := ctx.Value(contextKey{}).(Identity)
	if !ok || v.TenantID == 0 || v.UserID == 0 || v.MembershipID == 0 {
		return Identity{}, errors.New("TENANT_CONTEXT_REQUIRED")
	}
	return v, nil
}
