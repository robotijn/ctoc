# Gorilla Mux CTO
> Powerful Go HTTP router - regex matching, middleware, subrouters.

## Commands
```bash
# Setup | Dev | Test
go mod init myapp && go get github.com/gorilla/mux
go run main.go
go test -v ./...
```

## Non-Negotiables
1. Route variables with type constraints
2. Middleware chains via `Use()`
3. Subrouters for API versioning
4. Proper CORS handling
5. Request matching with headers/queries

## Red Lines
- Missing route variable validation
- No panic recovery middleware
- Ignoring `StrictSlash` behavior
- Missing request timeouts
- Unvalidated path parameters

## Pattern: Structured Router
```go
package main

import (
    "encoding/json"
    "net/http"
    "strconv"
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
    id, _ := strconv.Atoi(vars["id"]) // Already validated by regex

    user, err := h.service.GetByID(r.Context(), id)
    if err != nil {
        http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}

func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        log.Printf("%s %s", r.Method, r.URL.Path)
        next.ServeHTTP(w, r)
    })
}

func main() {
    r := mux.NewRouter()
    r.Use(loggingMiddleware)
    r.Use(recoveryMiddleware)

    // API v1
    api := r.PathPrefix("/api/v1").Subrouter()

    userHandler := &UserHandler{service: NewUserService()}
    api.HandleFunc("/users", userHandler.Create).Methods("POST")
    api.HandleFunc("/users/{id:[0-9]+}", userHandler.Get).Methods("GET")

    // Health check
    r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("ok"))
    }).Methods("GET")

    srv := &http.Server{
        Handler:      r,
        Addr:         ":3000",
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
    }
    srv.ListenAndServe()
}
```

## Integrates With
- **DB**: `sqlx` or `pgx` with context
- **Auth**: `gorilla/sessions` or JWT middleware
- **Validation**: `go-playground/validator`
- **CORS**: `gorilla/handlers` CORS helper

## Common Errors
| Error | Fix |
|-------|-----|
| `405 Method Not Allowed` | Check `.Methods()` matches request |
| `mux: variable not found` | Check route pattern matches path |
| `Trailing slash mismatch` | Use `r.StrictSlash(true)` |
| `nil pointer` | Check route handlers registered |

## Prod Ready
- [ ] Recovery middleware added
- [ ] Request timeouts configured
- [ ] Health check endpoint
- [ ] CORS configured
- [ ] Graceful shutdown
- [ ] Prometheus metrics
