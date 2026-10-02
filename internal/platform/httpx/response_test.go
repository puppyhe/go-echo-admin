package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
)

func TestErrorHandlerPreservesEchoRouterStatus(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want int
	}{
		{name: "not found", err: echo.ErrNotFound, want: http.StatusNotFound},
		{name: "method not allowed", err: echo.ErrMethodNotAllowed, want: http.StatusMethodNotAllowed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/missing", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			ErrorHandler(c, tc.err)

			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
			var body Envelope
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if body.Code != http.StatusText(tc.want) || body.Message != http.StatusText(tc.want) {
				t.Fatalf("error envelope = %#v, want %q", body, http.StatusText(tc.want))
			}
		})
	}
}
