# Gorilla Mux CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go mod init myapp
go get github.com/gorilla/mux
go run main.go
# Gorilla Mux 1.8.x - powerful Go HTTP router
```

## Claude's Common Mistakes
1. **Missing route variable regex** — Use `{id:[0-9]+}` for validation
2. **No panic recovery middleware** — Server crashes on panic
3. **Ignoring StrictSlash** — Causes 301 redirects
4. **Missing request timeouts** — Use `http.Server` timeout config
5. **Not using context** — Pass `r.Context()` to services

## Correct Patterns (2026)
```go
package main

import (
    "encoding/json"
    "net/http"
    "strconv"
    "time"
    "github.com/gorilla/mux"
)

type UserHandler struct {
    service *UserService
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
        return
    }

    // Pass context for cancellation
    user, err := h.service.Create(r.Context(), req)
    if err != nil {
        http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(user)
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])  // Already validated by regex

    user, err := h.service.GetByID(r.Context(), id)
    if err != nil {
        http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}

func main() {
    r := mux.NewRouter()
    r.Use(loggingMiddleware)
    r.Use(recoveryMiddleware)  // REQUIRED

    // API subrouter
    api := r.PathPrefix("/api/v1").Subrouter()

    userHandler := &UserHandler{service: NewUserService()}
    api.HandleFunc("/users", userHandler.Create).Methods("POST")
    api.HandleFunc("/users/{id:[0-9]+}", userHandler.Get).Methods("GET")  // Regex validation

    // Server with timeouts (REQUIRED)
    srv := &http.Server{
        Handler:      r,
        Addr:         ":3000",
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
    }
    srv.ListenAndServe()
}
```

## Version Gotchas
- **Gorilla Mux 1.8.x**: Maintenance mode; consider chi for new projects
- **Route variables**: Use regex like `{id:[0-9]+}` for validation
- **StrictSlash**: `r.StrictSlash(true)` for consistent trailing slash
- **Subrouters**: Use `PathPrefix().Subrouter()` for versioned APIs

## What NOT to Do
- ❌ Missing recovery middleware — Server crashes on panic
- ❌ `{id}` without regex — No validation on path params
- ❌ Missing server timeouts — DoS vulnerability
- ❌ Ignoring `r.Context()` — No cancellation propagation
- ❌ Hardcoded paths — Use subrouters for versioning

## Common Errors
| Error | Fix |
|-------|-----|
| `405 Method Not Allowed` | Check `.Methods()` matches request |
| `mux: variable not found` | Check route pattern matches path |
| `Trailing slash mismatch` | Use `r.StrictSlash(true)` |
| `Server panic` | Add recovery middleware |
