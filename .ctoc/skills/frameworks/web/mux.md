# Gorilla Mux CTO
> Powerful Go HTTP router.

## Non-Negotiables
1. Route variables with types
2. Middleware chains
3. Subrouters for versioning
4. Proper CORS handling
5. Request matching

## Red Lines
- Missing route variable validation
- No panic recovery
- Ignoring StrictSlash behavior
- Missing timeouts

## Pattern
```go
r := mux.NewRouter()
r.Use(loggingMiddleware)

api := r.PathPrefix("/api/v1").Subrouter()
api.HandleFunc("/users/{id:[0-9]+}", getUser).Methods("GET")
api.HandleFunc("/users", createUser).Methods("POST")
```
