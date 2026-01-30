# Buffalo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
go install github.com/gobuffalo/cli/cmd/buffalo@latest
buffalo new myapp --db-type postgres && cd myapp
buffalo dev
# Buffalo 0.18.x - Rails-like Go framework
```

## Claude's Common Mistakes
1. **Missing Pop middleware** — Add `PopTransaction` for DB operations
2. **Skipping model validations** — Always use `Validate()` method
3. **Business logic in handlers** — Extract to services
4. **Manual schema changes** — Always use migrations
5. **Ignoring context** — Use `buffalo.Context` properly

## Correct Patterns (2026)
```go
// actions/users.go
type UsersResource struct {
    buffalo.Resource
}

func (v UsersResource) Create(c buffalo.Context) error {
    user := &models.User{}
    if err := c.Bind(user); err != nil {
        return c.Error(http.StatusBadRequest, err)
    }

    // Validate (REQUIRED)
    verrs, err := user.Validate(c)
    if err != nil {
        return err
    }
    if verrs.HasAny() {
        return c.Render(http.StatusUnprocessableEntity, r.JSON(verrs))
    }

    // Get transaction from context
    tx := c.Value("tx").(*pop.Connection)
    if err := tx.Create(user); err != nil {
        return err
    }

    return c.Render(http.StatusCreated, r.JSON(user))
}

// models/user.go
type User struct {
    ID        uuid.UUID `json:"id" db:"id"`
    Email     string    `json:"email" db:"email"`
    Password  string    `json:"-" db:"password"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}

func (u *User) Validate(tx *pop.Connection) (*validate.Errors, error) {
    return validate.Validate(
        &validators.StringIsPresent{Field: u.Email, Name: "Email"},
        &validators.EmailIsPresent{Field: u.Email, Name: "Email"},
        &validators.StringLengthInRange{Field: u.Password, Name: "Password", Min: 8},
    ), nil
}
```

## Version Gotchas
- **Buffalo 0.18.x**: Current stable; Go 1.21+ required
- **Pop**: Transaction middleware must be configured
- **Context**: `c.Value("tx")` for database transaction
- **Migrations**: `buffalo pop migrate` for schema changes

## What NOT to Do
- ❌ Skipping `Validate()` — Data integrity issues
- ❌ Missing PopTransaction middleware — No `tx` in context
- ❌ Manual schema changes — Use `buffalo pop migrate`
- ❌ Business logic in actions — Extract to services
- ❌ Ignoring validation errors — Check `verrs.HasAny()`

## Common Errors
| Error | Fix |
|-------|-----|
| `no transaction found` | Add PopTransaction middleware |
| `migration failed` | Check `database.yml` config |
| `bind error` | Check Content-Type matches handler |
| `validator nil pointer` | Initialize validator properly |
