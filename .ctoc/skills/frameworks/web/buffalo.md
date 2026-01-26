# Buffalo CTO
> Rapid Go web development - Rails-like productivity for Go developers.

## Commands
```bash
# Setup | Dev | Test
buffalo new myapp --db-type postgres && cd myapp
buffalo dev
buffalo test
```

## Non-Negotiables
1. Pop ORM for database operations
2. Plush templates for views
3. Resource generators for scaffolding
4. Proper migrations - never manual schema changes
5. Background workers for async tasks

## Red Lines
- Skipping migrations for schema changes
- Business logic in templates
- Missing model validations
- No test coverage
- Ignoring Buffalo conventions

## Pattern: Resource with Validation
```go
// actions/users.go
type UsersResource struct {
    buffalo.Resource
}

func (v UsersResource) Create(c buffalo.Context) error {
    user := &models.User{}
    if err := c.Bind(user); err != nil {
        return err
    }

    // Validate
    verrs, err := user.Validate(c)
    if err != nil {
        return err
    }
    if verrs.HasAny() {
        return c.Render(http.StatusUnprocessableEntity, r.JSON(verrs))
    }

    // Create
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

## Integrates With
- **DB**: Pop with PostgreSQL/MySQL/SQLite
- **Auth**: `buffalo-pop` with sessions
- **Background**: Grift tasks, workers
- **Assets**: Webpack for frontend

## Common Errors
| Error | Fix |
|-------|-----|
| `no transaction found` | Check `--api` flag, add PopTransaction middleware |
| `migration failed` | Check `database.yml`, run `buffalo pop migrate` |
| `template not found` | Check `templates/` path matches |
| `bind error` | Check request Content-Type matches handler |

## Prod Ready
- [ ] Database migrations up to date
- [ ] Assets compiled with `buffalo build`
- [ ] Environment-specific configs
- [ ] Health check endpoint
- [ ] Error reporting configured
- [ ] Background workers deployed
