# Fiber CTO
> Express-inspired Go framework - fasthttp underneath, familiar API, high performance.

## Commands
```bash
# Setup | Dev | Test
go mod init myapp && go get -u github.com/gofiber/fiber/v2
go run main.go
go test -v -cover ./...
```

## Non-Negotiables
1. Middleware chain for logging, recovery, CORS, auth
2. Input validation with custom validators
3. Proper error handling with custom error handler
4. Rate limiting on public endpoints
5. Graceful shutdown with `app.ShutdownWithTimeout`

## Red Lines
- Missing input validation on any handler
- Unhandled errors - always check and respond
- Memory leaks from unclosed resources
- Storing request-scoped data in global state
- Blocking without timeouts

## Pattern: Structured Handler
```go
// internal/handler/user.go
package handler

type UserHandler struct {
    userService service.UserService
}

func NewUserHandler(us service.UserService) *UserHandler {
    return &UserHandler{userService: us}
}

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
}

func (h *UserHandler) Create(c *fiber.Ctx) error {
    var req CreateUserRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": "invalid request body",
        })
    }

    if err := validate.Struct(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": err.Error(),
        })
    }

    ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
    defer cancel()

    user, err := h.userService.Create(ctx, req.Email, req.Password)
    if err != nil {
        if errors.Is(err, service.ErrEmailExists) {
            return c.Status(fiber.StatusConflict).JSON(fiber.Map{
                "error": "email already registered",
            })
        }
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
            "error": "internal server error",
        })
    }

    return c.Status(fiber.StatusCreated).JSON(user)
}
```

## Integrates With
- **DB**: `sqlx` or `gorm` with `fiber/storage` adapters
- **Auth**: JWT middleware with `gofiber/jwt`
- **Cache**: `fiber/storage/redis` for sessions and cache
- **Validation**: `go-playground/validator` with custom error formatting

## Common Errors
| Error | Fix |
|-------|-----|
| `cannot unmarshal` | Check Content-Type header and JSON structure |
| `context canceled` | Request canceled by client or timeout hit |
| `prefork: child process error` | Check for init code running multiple times |
| `too many open connections` | Configure DB pool, close idle connections |

## Prod Ready
- [ ] Recovery middleware enabled
- [ ] Structured logging with request ID
- [ ] Prometheus metrics with `/metrics` endpoint
- [ ] Health checks at `/health` and `/ready`
- [ ] Rate limiting per IP and per user
- [ ] Graceful shutdown handling SIGTERM
