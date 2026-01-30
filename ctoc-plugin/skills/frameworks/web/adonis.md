# AdonisJS CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init adonisjs@latest myapp && cd myapp
node ace serve --watch
# AdonisJS 6.x - TypeScript MVC framework
```

## Claude's Common Mistakes
1. **Using deprecated `@adonisjs/validator`** — Use VineJS in v6
2. **Missing IoC container injection** — Use `@inject()` decorator
3. **Business logic in controllers** — Extract to services
4. **Missing preload for relationships** — N+1 query issues
5. **Using old path aliases** — Use `#` aliases (`#models`, `#services`)

## Correct Patterns (2026)
```typescript
// app/controllers/users_controller.ts
import type { HttpContext } from '@adonisjs/core/http';
import User from '#models/user';
import { createUserValidator } from '#validators/user';
import UserService from '#services/user_service';
import { inject } from '@adonisjs/core';

@inject()
export default class UsersController {
  constructor(private userService: UserService) {}

  async store({ request, response }: HttpContext) {
    // VineJS validation (NOT @adonisjs/validator)
    const payload = await request.validateUsing(createUserValidator);
    const user = await this.userService.create(payload);
    return response.created(user);
  }

  async show({ params }: HttpContext) {
    // Preload relationships to avoid N+1
    return User.query()
      .where('id', params.id)
      .preload('posts')
      .firstOrFail();
  }
}

// validators/user.ts - VineJS (v6 standard)
import vine from '@vinejs/vine';

export const createUserValidator = vine.compile(
  vine.object({
    email: vine.string().email().unique({ table: 'users', column: 'email' }),
    password: vine.string().minLength(8),
  })
);
```

## Version Gotchas
- **AdonisJS 6.x**: VineJS replaces `@adonisjs/validator`
- **Path aliases**: Use `#models/user` not `App/Models/User`
- **IoC**: Use `@inject()` decorator for constructor injection
- **Lucid**: Always `preload()` relationships

## What NOT to Do
- ❌ `import { schema } from '@adonisjs/validator'` — Use VineJS
- ❌ `import User from 'App/Models/User'` — Use `#models/user`
- ❌ Logic in controllers — Extract to services
- ❌ Missing `preload()` — Causes N+1 queries
- ❌ Raw SQL — Use Lucid query builder

## Common Errors
| Error | Fix |
|-------|-----|
| `E_VALIDATION_ERROR` | Check VineJS rules match request |
| `Cannot inject` | Register provider in `adonisrc.ts` |
| `Model not found` | Use `firstOrFail()` or handle null |
| `N+1 queries` | Add `.preload('relation')` |
