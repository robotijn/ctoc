# Chi CTO
> Lightweight Go HTTP router - composable, idiomatic, stdlib-compatible.

## Commands
```bash
# Setup | Dev | Test
go mod init myapp && go get github.com/go-chi/chi/v5
go run main.go
go test -v ./...
```

## Non-Negotiables
1. Middleware composition with `r.Use()`
2. Context for request-scoped data
3. Sub-routers for modular organization
4. Panic recovery middleware
5. Graceful shutdown on SIGTERM

## Red Lines
- Global mutable state - use context
- Missing middleware (logging, recovery)
- Ignoring context cancellation
- No request timeouts
- Blocking without context

## Pattern: Structured Router
```go
package main

import (
    "encoding/json"
    "net/http"
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

    // Middleware
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.Timeout(30 * time.Second))

    // Routes
    userHandler := &UserHandler{service: NewUserService()}
    r.Mount("/users", userHandler.Routes())

    // Health check
    r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("ok"))
    })

    http.ListenAndServe(":3000", r)
}
```

## Integrates With
- **DB**: `sqlx` or `pgx` with context propagation
- **Auth**: `chi/jwtauth` or custom middleware
- **Validation**: `go-playground/validator`
- **Tracing**: OpenTelemetry middleware

## Common Errors
| Error | Fix |
|-------|-----|
| `context canceled` | Check timeout, client disconnection |
| `panic: runtime error` | Add `middleware.Recoverer` |
| `404 on route` | Check route registration, trailing slashes |
| `chi: no middlewares` | Register middleware before routes |

## Prod Ready
- [ ] Request ID middleware
- [ ] Timeout middleware configured
- [ ] Prometheus metrics
- [ ] Health and readiness endpoints
- [ ] Graceful shutdown
- [ ] Structured logging
