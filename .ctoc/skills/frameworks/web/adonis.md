# AdonisJS CTO
> Full-featured TypeScript MVC framework - batteries included, Laravel-inspired for Node.js.

## Commands
```bash
# Setup | Dev | Test
npm init adonisjs@latest myapp && cd myapp
node ace serve --watch
node ace test
```

## Non-Negotiables
1. Lucid ORM with proper relationships and eager loading
2. Validators for all request input - `@adonisjs/validator`
3. Authentication with guards and providers
4. Edge templating for server-rendered views
5. Service injection via IoC container

## Red Lines
- Raw SQL without Lucid query builder
- Missing request validation on any endpoint
- Business logic in controllers - use services
- Skipping migrations for schema changes
- Ignoring TypeScript strict mode

## Pattern: Controller with Validation
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
    const payload = await request.validateUsing(createUserValidator);
    const user = await this.userService.create(payload);
    return response.created(user);
  }

  async show({ params, response }: HttpContext) {
    const user = await User.query()
      .where('id', params.id)
      .preload('posts')
      .firstOrFail();
    return response.ok(user);
  }
}

// app/validators/user.ts
import vine from '@vinejs/vine';

export const createUserValidator = vine.compile(
  vine.object({
    email: vine.string().email().unique({ table: 'users', column: 'email' }),
    password: vine.string().minLength(8),
  })
);
```

## Integrates With
- **DB**: Lucid ORM with PostgreSQL/MySQL/SQLite
- **Auth**: `@adonisjs/auth` with sessions or API tokens
- **Queue**: `@adonisjs/redis` with Bull
- **Mail**: `@adonisjs/mail` with SMTP/Mailgun

## Common Errors
| Error | Fix |
|-------|-----|
| `E_VALIDATION_ERROR` | Check validator rules match request |
| `Model not found` | Use `firstOrFail()` or handle null |
| `Cannot inject` | Register provider in `adonisrc.ts` |
| `Migration failed` | Check database connection, run `node ace migration:status` |

## Prod Ready
- [ ] Environment variables validated on boot
- [ ] Database connection pooling configured
- [ ] Redis for sessions in production
- [ ] Health check endpoint
- [ ] Error reporting with Sentry
- [ ] Static assets served via CDN
