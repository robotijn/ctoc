# AdonisJS CTO
> Full-featured TypeScript MVC framework.

## Non-Negotiables
1. Lucid ORM patterns
2. Validator for input
3. Authentication with guards
4. Edge templating
5. Proper service injection

## Red Lines
- Raw SQL without Lucid
- Missing request validation
- Controllers doing business logic
- Skipping migrations

## Pattern
```typescript
export default class UsersController {
  async store({ request }: HttpContext) {
    const payload = await request.validateUsing(createUserValidator)
    return User.create(payload)
  }
}
```
