// Package storage defines the tenant-safe file storage boundary used by the
// admin module. Business code never concatenates user supplied file names into
// paths; stores receive an opaque, validated key instead.
package storage

import (
	"context"
	"io"
)

// Store persists opaque file bytes under a key. Implementations may use local
// disk, object storage, or another backend without changing business handlers.
type Store interface {
	Put(ctx context.Context, key string, r io.Reader) error
	Open(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}
