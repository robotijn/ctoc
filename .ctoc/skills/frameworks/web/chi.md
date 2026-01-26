# Chi CTO
> Lightweight Go HTTP router.

## Non-Negotiables
1. Middleware composition
2. Context for request-scoped data
3. Sub-routers for organization
4. Proper panic recovery
5. Graceful shutdown

## Red Lines
- Global mutable state
- Missing middleware
- Ignoring context cancellation
- No request timeouts

## Pattern
```go
r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)

r.Route("/users", func(r chi.Router) {
    r.Post("/", createUser)
    r.Get("/{id}", getUser)
})
```
