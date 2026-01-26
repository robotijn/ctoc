# Buffalo CTO
> Rapid Go web development.

## Non-Negotiables
1. Pop ORM for database
2. Plush templates
3. Resource generators
4. Proper migrations
5. Background workers

## Red Lines
- Skipping migrations
- Logic in templates
- Missing validations
- No test coverage

## Pattern
```go
type UsersResource struct {
    buffalo.Resource
}

func (v UsersResource) Create(c buffalo.Context) error {
    user := &models.User{}
    if err := c.Bind(user); err != nil {
        return err
    }
    return c.Render(201, r.JSON(user))
}
```
