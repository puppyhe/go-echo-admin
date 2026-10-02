package httpx

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v5"
)

type Error struct {
	Status        int
	Code, Message string
	Fields        map[string]string
	Data          any
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }
func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

type Envelope struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Data      any               `json:"data,omitempty"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"request_id"`
}

func Respond(c *echo.Context, data any) error {
	return c.JSON(http.StatusOK, Envelope{Code: "OK", Message: "success", Data: data, RequestID: c.Response().Header().Get("X-Request-ID")})
}
func ErrorHandler(c *echo.Context, err error) {
	response, unwrapErr := echo.UnwrapResponse(c.Response())
	if unwrapErr == nil && response.Committed {
		return
	}
	e := &Error{Status: 500, Code: "INTERNAL_ERROR", Message: "An unexpected error occurred"}
	var domain *Error
	if errors.As(err, &domain) {
		e = domain
	} else if status := echo.StatusCode(err); status > 0 {
		// Echo v5 represents router errors (including not-found and method
		// not-allowed) with HTTPStatusCoder values rather than *HTTPError.
		// Resolve those here so an unknown route is reported as 404/405 instead
		// of being misclassified as an internal server failure.
		e.Status = status
		e.Code = http.StatusText(status)
		e.Message = http.StatusText(status)
	}
	if e.Status >= 500 {
		c.Echo().Logger.Error("request failed", "request_id", c.Response().Header().Get("X-Request-ID"), "error", err)
	}
	_ = c.JSON(e.Status, Envelope{Code: e.Code, Message: e.Message, Fields: e.Fields, Data: e.Data, RequestID: c.Response().Header().Get("X-Request-ID")})
}

// WithData adds structured error details while preserving the stable error code.
func (e *Error) WithData(data any) *Error { e.Data = data; return e }
