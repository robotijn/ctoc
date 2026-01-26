# Gin CTO
> Fast Go HTTP framework - minimal overhead, maximal control, production-proven.

## Commands
```bash
# Setup | Dev | Test
go mod init myapp && go get -u github.com/gin-gonic/gin
go run main.go
go test -v -cover ./...
```

## Non-Negotiables
1. Middleware for cross-cutting concerns (logging, auth, recovery)
2. Binding and validation with struct tags
3. Proper error handling - never ignore returned errors
4. Context propagation with timeouts
5. Graceful shutdown on SIGTERM

## Red Lines
- Ignoring errors from any function
- Missing input validation on handlers
- Blocking operations without context timeout
- Panics leaking to production - use recovery middleware
- Global state without synchronization

## Pattern: Clean Handler Structure
```go
// internal/handler/user.go
package handler

type UserHandler struct {
    userService *service.UserService
    validator   *validator.Validate
}

func NewUserHandler(us *service.UserService) *UserHandler {
    return &UserHandler{
        userService: us,
        validator:   validator.New(),
    }
}

type CreateUserRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=8"`
}

func (h *UserHandler) Create(c *gin.Context) {
    var req CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
    defer cancel()

    user, err := h.userService.Create(ctx, req.Email, req.Password)
    if err != nil {
        if errors.Is(err, service.ErrEmailExists) {
            c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
        return
    }

    c.JSON(http.StatusCreated, user)
}
```

## Integrates With
- **DB**: `sqlx` or `gorm` with connection pooling
- **Auth**: JWT with `golang-jwt/jwt` middleware
- **Cache**: `go-redis/redis` with context support
- **Validation**: `go-playground/validator` struct tags

## Common Errors
| Error | Fix |
|-------|-----|
| `context deadline exceeded` | Increase timeout or optimize query |
| `binding: Key: 'Field' Error:` | Check struct tags match JSON field names |
| `runtime error: invalid memory address` | Nil pointer - check initialization |
| `too many open files` | Set `DB.SetMaxOpenConns()`, use connection pool |

## Prod Ready
- [ ] Recovery middleware catches panics
- [ ] Structured logging with `zerolog` or `zap`
- [ ] Health check at `/health` and `/ready`
- [ ] Metrics with Prometheus `promhttp`
- [ ] Graceful shutdown with signal handling
- [ ] Rate limiting with `tollbooth` or `limiter`
