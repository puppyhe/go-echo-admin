package storage

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestLocalStoreRejectsTraversalAndRoundTripsBytes(t *testing.T) {
	store, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), "tenants/7/file.txt", strings.NewReader("hello")); err != nil {
		t.Fatal(err)
	}
	reader, err := store.Open(context.Background(), "tenants/7/file.txt")
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || string(data) != "hello" {
		t.Fatalf("unexpected bytes %q: %v", data, err)
	}
	for _, key := range []string{"../escape", "/absolute", "tenants/../escape"} {
		if err := store.Put(context.Background(), key, strings.NewReader("bad")); err == nil {
			t.Fatalf("unsafe key %q accepted", key)
		}
	}
	if err := store.Delete(context.Background(), "tenants/7/file.txt"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(context.Background(), "tenants/7/file.txt"); err == nil {
		t.Fatal("deleted file remained readable")
	}
}
