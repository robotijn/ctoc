# Gin CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go mod init myapp
go get -u github.com/gin-gonic/gin
# Requires Go 1.21+
go run main.go
```

## Claude's Common Mistakes
1. **Ignoring returned errors** — Go requires explicit error handling; never `_`
2. **Missing context timeouts** — Always use `context.WithTimeout` for I/O operations
3. **Panics leaking to production** — Use `gin.Recovery()` middleware
4. **Global state without sync** — Use sync primitives or avoid global state
5. **Missing input validation** — Use struct tags with `binding:"required,email"`

## Correct Patterns (2026)
```go
package main

import (
    "context"
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
)

type CreateUserRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=8"`
}

func (h *UserHandler) Create(c *gin.Context) {
    var req CreateUserRequest

    // Always check binding errors
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Always use context with timeout
    ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
    defer cancel()

    user, err := h.userService.Create(ctx, req.Email, req.Password)
    if err != nil {
        // Handle specific errors
        if errors.Is(err, ErrEmailExists) {
            c.JSON(http.StatusConflict, gin.H{"error": "email exists"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
        return
    }

    c.JSON(http.StatusCreated, user)
}

func main() {
    r := gin.Default()  // Includes Logger and Recovery middleware

    // Graceful shutdown
    srv := &http.Server{Addr: ":8080", Handler: r}
    go srv.ListenAndServe()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
}
```

## Version Gotchas
- **Go 1.21+**: Required for latest Gin features
- **gin.Default()**: Includes Logger and Recovery middleware
- **gin.New()**: Bare router without middleware
- **Connection pools**: Always set `DB.SetMaxOpenConns()`

## What NOT to Do
- ❌ `_, err := ...` then ignore `err` — Always handle errors
- ❌ Database calls without `context.WithTimeout` — Can hang forever
- ❌ Missing `gin.Recovery()` — Panics crash server
- ❌ Global variables without `sync.Mutex` — Race conditions
- ❌ `c.JSON` after `return` — Response already sent

## Middleware Order
```go
r := gin.New()
r.Use(gin.Logger())      // 1. Logging
r.Use(gin.Recovery())    // 2. Panic recovery
r.Use(corsMiddleware())  // 3. CORS
r.Use(authMiddleware())  // 4. Authentication
```

## Common Errors
| Error | Fix |
|-------|-----|
| `context deadline exceeded` | Increase timeout or optimize query |
| `binding: Key: 'Field'` | Check struct tags match JSON |
| `invalid memory address` | Nil pointer; check initialization |
| `too many open files` | Set `DB.SetMaxOpenConns()` |
