# Echo CTO
> High-performance Go web framework - minimalist, extensible, HTTP/2 ready.

## Commands
```bash
# Setup | Dev | Test
go mod init myapp && go get github.com/labstack/echo/v4
go run main.go
go test -v -cover ./...
```

## Non-Negotiables
1. Middleware for logging, recovery, CORS, auth
2. Request binding with validation tags
3. Custom error handler for consistent responses
4. Context propagation with timeouts
5. Graceful shutdown on signals

## Red Lines
- Unvalidated request input
- Missing error handling
- Context not propagated to downstream calls
- Panics leaking to clients
- Blocking without timeouts

## Pattern: Clean Handler Structure
```go
package handler

import (
    "net/http"
    "github.com/labstack/echo/v4"
)

type UserHandler struct {
    service *service.UserService
}

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
}

func (h *UserHandler) Create(c echo.Context) error {
    var req CreateUserRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
    }

    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }

    ctx := c.Request().Context()
    user, err := h.service.Create(ctx, req.Email, req.Password)
    if err != nil {
        if errors.Is(err, service.ErrEmailExists) {
            return echo.NewHTTPError(http.StatusConflict, "email exists")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, "server error")
    }

    return c.JSON(http.StatusCreated, user)
}

// Custom validator setup
type CustomValidator struct {
    validator *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
    return cv.validator.Struct(i)
}
```

## Integrates With
- **DB**: `sqlx` or `gorm` with context propagation
- **Auth**: JWT middleware with `echo-jwt`
- **Validation**: `go-playground/validator` as custom validator
- **Docs**: Swagger with `swaggo/echo-swagger`

## Common Errors
| Error | Fix |
|-------|-----|
| `validator not registered` | Set `e.Validator = &CustomValidator{...}` |
| `context deadline exceeded` | Increase timeout or optimize query |
| `bind: unexpected EOF` | Check Content-Type header |
| `panic recovered` | Check nil pointers, add nil checks |

## Prod Ready
- [ ] Recovery middleware enabled
- [ ] Request logging with request ID
- [ ] Health check endpoints
- [ ] Prometheus metrics
- [ ] Graceful shutdown configured
- [ ] Rate limiting middleware
