# Fiber CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go mod init myapp
go get -u github.com/gofiber/fiber/v2
# Requires Go 1.21+
go run main.go
```

## Claude's Common Mistakes
1. **Missing input validation** — Always validate with struct tags
2. **Ignoring errors from handlers** — Fiber handlers return errors; check them
3. **Prefork mode init issues** — Code runs multiple times; guard initialization
4. **Unclosed resources** — Always close DB connections, files, etc.
5. **Missing context timeouts** — Use `context.WithTimeout` for I/O

## Correct Patterns (2026)
```go
package main

import (
    "context"
    "errors"
    "time"

    "github.com/go-playground/validator/v10"
    "github.com/gofiber/fiber/v2"
)

var validate = validator.New()

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
}

func (h *UserHandler) Create(c *fiber.Ctx) error {
    var req CreateUserRequest

    // Parse body
    if err := c.BodyParser(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": "invalid request body",
        })
    }

    // Validate struct
    if err := validate.Struct(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": err.Error(),
        })
    }

    // Context with timeout for DB operations
    ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
    defer cancel()

    user, err := h.userService.Create(ctx, req.Email, req.Password)
    if err != nil {
        if errors.Is(err, ErrEmailExists) {
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

func main() {
    app := fiber.New(fiber.Config{
        ErrorHandler: customErrorHandler,
    })

    app.Use(recover.New())  // Recovery middleware
    app.Use(logger.New())   // Logging middleware

    // Graceful shutdown
    go app.Listen(":3000")

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
    <-quit

    app.ShutdownWithTimeout(5 * time.Second)
}
```

## Version Gotchas
- **Fiber v2**: Current stable; uses fasthttp underneath
- **Prefork mode**: `fiber.Config{Prefork: true}` runs init code multiple times
- **fasthttp**: Not net/http compatible; some middleware won't work
- **Context**: `c.Context()` returns fasthttp context, not standard

## What NOT to Do
- ❌ `c.BodyParser(&req)` without error check — May silently fail
- ❌ `fiber.Config{Prefork: true}` with global init — Code runs per process
- ❌ Missing `return` after response — Handler continues executing
- ❌ net/http middleware — Not compatible with fasthttp
- ❌ DB calls without `context.WithTimeout` — Can hang

## Fiber vs Gin
| Feature | Fiber | Gin |
|---------|-------|-----|
| HTTP library | fasthttp | net/http |
| Performance | Faster | Standard |
| Ecosystem | Growing | Mature |
| net/http compatible | No | Yes |

## Common Errors
| Error | Fix |
|-------|-----|
| `cannot unmarshal` | Check Content-Type and JSON structure |
| `context canceled` | Client disconnected or timeout hit |
| `prefork: child process error` | Guard init code with `fiber.IsChild()` |
| `too many open connections` | Configure DB pool size |
