package storage

// This file intentionally keeps the S3 adapter free of a vendor SDK.  The
// wire contract is the S3 API, so the same implementation works with AWS S3,
// MinIO, Ceph RGW and other S3-compatible services.  Requests use Signature
// Version 4 and UNSIGNED-PAYLOAD; the application already enforces the file
// size limit before a request reaches this adapter.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type S3Config struct {
	Endpoint     string
	Bucket       string
	Region       string
	AccessKey    string
	SecretKey    string
	Prefix       string
	UsePathStyle bool
	HTTPClient   *http.Client
}

type S3Store struct {
	Endpoint     *url.URL
	Bucket       string
	Region       string
	AccessKey    string
	SecretKey    string
	Prefix       string
	UsePathStyle bool
	Client       *http.Client
}

func NewS3(cfg S3Config) (*S3Store, error) {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" || strings.TrimSpace(cfg.Bucket) == "" || strings.TrimSpace(cfg.Region) == "" {
		return nil, errors.New("s3 endpoint, bucket and region are required")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("s3 endpoint must be an absolute http(s) URL")
	}
	if strings.TrimSpace(cfg.AccessKey) == "" || strings.TrimSpace(cfg.SecretKey) == "" {
		return nil, errors.New("s3 access key and secret key are required")
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	return &S3Store{Endpoint: u, Bucket: strings.Trim(cfg.Bucket, "/"), Region: cfg.Region, AccessKey: cfg.AccessKey, SecretKey: cfg.SecretKey, Prefix: strings.Trim(cfg.Prefix, "/"), UsePathStyle: cfg.UsePathStyle, Client: client}, nil
}

func (s *S3Store) key(key string) (string, error) {
	key = strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	if key == "" || strings.HasPrefix(key, "/") || strings.ContainsRune(key, 0) {
		return "", errors.New("invalid storage key")
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("invalid storage key")
		}
	}
	if s.Prefix != "" {
		key = s.Prefix + "/" + key
	}
	return key, nil
}

func (s *S3Store) request(ctx context.Context, method, key string, body io.Reader) (*http.Request, error) {
	object, err := s.key(key)
	if err != nil {
		return nil, err
	}
	u := *s.Endpoint
	encodedKey := encodeObjectPath(object)
	if s.UsePathStyle {
		u.Path = strings.TrimRight(u.Path, "/") + "/" + url.PathEscape(s.Bucket) + "/" + encodedKey
	} else {
		u.Host = s.Bucket + "." + u.Host
		u.Path = strings.TrimRight(u.Path, "/") + "/" + encodedKey
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, err
	}
	s.sign(req)
	return req, nil
}

func encodeObjectPath(object string) string {
	parts := strings.Split(object, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func (s *S3Store) sign(req *http.Request) {
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	date := now.Format("20060102")
	payload := "UNSIGNED-PAYLOAD"
	req.Header.Set("Host", req.Host)
	req.Header.Set("x-amz-content-sha256", payload)
	req.Header.Set("x-amz-date", amzDate)
	canonicalHeaders := "host:" + strings.ToLower(req.Host) + "\n" + "x-amz-content-sha256:" + payload + "\n" + "x-amz-date:" + amzDate + "\n"
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalRequest := strings.Join([]string{req.Method, canonicalURI, canonicalQuery(req.URL.Query()), canonicalHeaders, signedHeaders, payload}, "\n")
	scope := date + "/" + s.Region + "/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hexSHA256([]byte(canonicalRequest))
	kDate := hmacSHA256([]byte("AWS4"+s.SecretKey), []byte(date))
	kRegion := hmacSHA256(kDate, []byte(s.Region))
	kService := hmacSHA256(kRegion, []byte("s3"))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+s.AccessKey+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}

func canonicalQuery(values url.Values) string {
	type item struct{ k, v string }
	items := make([]item, 0)
	for key, values := range values {
		for _, value := range values {
			items = append(items, item{url.QueryEscape(key), url.QueryEscape(value)})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].k == items[j].k {
			return items[i].v < items[j].v
		}
		return items[i].k < items[j].k
	})
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, item.k+"="+item.v)
	}
	return strings.Join(parts, "&")
}

func hexSHA256(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }
func hmacSHA256(key, value []byte) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write(value)
	return h.Sum(nil)
}

func (s *S3Store) do(req *http.Request) (*http.Response, error) {
	client := s.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		defer response.Body.Close()
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("s3 request failed with status %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	return response, nil
}

func (s *S3Store) Put(ctx context.Context, key string, r io.Reader) error {
	req, err := s.request(ctx, http.MethodPut, key, r)
	if err != nil {
		return err
	}
	response, err := s.do(req)
	if response != nil {
		_ = response.Body.Close()
	}
	return err
}

func (s *S3Store) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	req, err := s.request(ctx, http.MethodGet, key, nil)
	if err != nil {
		return nil, err
	}
	response, err := s.do(req)
	if err != nil {
		return nil, err
	}
	return response.Body, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	req, err := s.request(ctx, http.MethodDelete, key, nil)
	if err != nil {
		return err
	}
	response, err := s.do(req)
	if response != nil {
		_ = response.Body.Close()
	}
	return err
}
