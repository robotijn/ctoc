# Chi CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go mod init myapp
go get github.com/go-chi/chi/v5
# Chi 5.x - requires Go 1.21+
go run main.go
```

## Claude's Common Mistakes
1. **Global mutable state** — Use request context for request-scoped data
2. **Missing middleware** — Always add Logger, Recoverer, Timeout
3. **Ignoring context cancellation** — Check `ctx.Done()` in long operations
4. **No request timeouts** — Use `middleware.Timeout()`
5. **Blocking without context** — Pass context to all downstream calls

## Correct Patterns (2026)
```go
package main

import (
    "context"
    "encoding/json"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

type UserHandler struct {
    service *UserService
}

func (h *UserHandler) Routes() chi.Router {
    r := chi.NewRouter()
    r.Post("/", h.Create)
    r.Get("/{id}", h.Get)
    return r
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request", http.StatusBadRequest)
        return
    }

    // Always use context from request
    ctx := r.Context()
    user, err := h.service.Create(ctx, req)
    if err != nil {
        http.Error(w, "server error", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(user)
}

func main() {
    r := chi.NewRouter()

    // Middleware (REQUIRED)
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.Timeout(30 * time.Second))

    // Routes
    userHandler := &UserHandler{service: NewUserService()}
    r.Mount("/users", userHandler.Routes())

    http.ListenAndServe(":3000", r)
}
```

## Version Gotchas
- **Chi 5.x**: Requires Go 1.21+; stdlib `http.ServeMux` compatible
- **Context**: Always propagate from `r.Context()`
- **Middleware order**: Logger before Recoverer
- **Sub-routers**: Use `r.Mount()` for modularity

## What NOT to Do
- ❌ Global variables for state — Use context
- ❌ Missing `middleware.Recoverer` — Panics crash server
- ❌ `http.ListenAndServe` without timeout middleware — No timeout
- ❌ Ignoring `ctx.Done()` — Operations continue after timeout
- ❌ Middleware after routes — Won't apply

## Middleware Stack
```go
r.Use(middleware.RequestID)    // 1. Add request ID
r.Use(middleware.RealIP)       // 2. Get real client IP
r.Use(middleware.Logger)       // 3. Log requests
r.Use(middleware.Recoverer)    // 4. Recover from panics
r.Use(middleware.Timeout(30*time.Second))  // 5. Timeout
```

## Common Errors
| Error | Fix |
|-------|-----|
| `context canceled` | Client disconnected or timeout |
| `panic: runtime error` | Add `middleware.Recoverer` |
| `404 on route` | Check registration and trailing slashes |
| `No middleware running` | Register middleware before routes |
