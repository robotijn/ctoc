# Echo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go mod init myapp
go get github.com/labstack/echo/v4
# Echo 4.x - requires Go 1.21+
go run main.go
```

## Claude's Common Mistakes
1. **Missing custom validator** — Echo requires explicit validator setup
2. **Unvalidated request input** — Always bind AND validate
3. **Context not propagated** — Pass `c.Request().Context()` to services
4. **No error handler** — Errors return generic responses without custom handler
5. **Blocking without timeouts** — Use context with deadlines

## Correct Patterns (2026)
```go
package main

import (
    "net/http"

    "github.com/go-playground/validator/v10"
    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"
)

// Custom validator (REQUIRED - Echo doesn't have one)
type CustomValidator struct {
    validator *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
    return cv.validator.Struct(i)
}

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
}

func (h *UserHandler) Create(c echo.Context) error {
    var req CreateUserRequest

    // Bind request body
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
    }

    // Validate (REQUIRED - Bind doesn't validate)
    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }

    // Pass context to service
    ctx := c.Request().Context()
    user, err := h.service.Create(ctx, req.Email, req.Password)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "server error")
    }

    return c.JSON(http.StatusCreated, user)
}

func main() {
    e := echo.New()

    // Set custom validator (REQUIRED)
    e.Validator = &CustomValidator{validator: validator.New()}

    // Middleware
    e.Use(middleware.Logger())
    e.Use(middleware.Recover())
    e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
        Timeout: 30 * time.Second,
    }))

    // Routes
    e.POST("/users", userHandler.Create)

    e.Start(":3000")
}
```

## Version Gotchas
- **Echo 4.x**: No built-in validator; must set `e.Validator`
- **Bind vs Validate**: `Bind()` only parses; `Validate()` checks constraints
- **Context**: Use `c.Request().Context()` for cancellation/timeout
- **HTTPError**: Use `echo.NewHTTPError()` for proper responses

## What NOT to Do
- ❌ `c.Bind(&req)` without `c.Validate(&req)` — No validation
- ❌ Missing `e.Validator = ...` — Validate() panics
- ❌ Ignoring `c.Request().Context()` — No timeout propagation
- ❌ Plain `error` returns — Use `echo.NewHTTPError()`
- ❌ Missing `middleware.Recover()` — Panics crash server

## Common Errors
| Error | Fix |
|-------|-----|
| `validator not registered` | Set `e.Validator = &CustomValidator{...}` |
| `context deadline exceeded` | Increase timeout or optimize |
| `bind: unexpected EOF` | Check Content-Type header |
| `panic: nil pointer` | Add nil checks, use Recover middleware |
