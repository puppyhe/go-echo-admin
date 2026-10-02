package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// LocalStore stores files below Root. Keys are intentionally restricted to
// relative paths so a database or request value can never escape Root.
type LocalStore struct{ Root string }

func NewLocal(root string) (*LocalStore, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, errors.New("storage root is required")
	}
	if err := os.MkdirAll(root, 0o750); err != nil {
		return nil, fmt.Errorf("create storage root: %w", err)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve storage root: %w", err)
	}
	return &LocalStore{Root: absolute}, nil
}

func (s *LocalStore) path(key string) (string, error) {
	if s == nil || s.Root == "" {
		return "", errors.New("storage is not configured")
	}
	key = filepath.ToSlash(strings.TrimSpace(key))
	if key == "" || strings.HasPrefix(key, "/") || strings.ContainsRune(key, 0) {
		return "", errors.New("invalid storage key")
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("invalid storage key")
		}
	}
	clean := filepath.Clean(filepath.FromSlash(key))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid storage key")
	}
	root, err := filepath.Abs(s.Root)
	if err != nil {
		return "", err
	}
	candidate, err := filepath.Abs(filepath.Join(root, clean))
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid storage key")
	}
	return candidate, nil
}

func (s *LocalStore) Put(ctx context.Context, key string, r io.Reader) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create storage directory: %w", err)
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return fmt.Errorf("create storage temp file: %w", err)
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if _, err = io.Copy(temp, r); err != nil {
		_ = temp.Close()
		return fmt.Errorf("write storage file: %w", err)
	}
	if err = temp.Chmod(0o640); err != nil {
		_ = temp.Close()
		return fmt.Errorf("set storage file mode: %w", err)
	}
	if err = temp.Close(); err != nil {
		return fmt.Errorf("close storage file: %w", err)
	}
	if err = os.Rename(tempName, path); err != nil {
		return fmt.Errorf("commit storage file: %w", err)
	}
	return nil
}

func (s *LocalStore) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	path, err := s.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *LocalStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
