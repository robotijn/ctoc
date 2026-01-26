# Express CTO
> Minimalist Node.js HTTP - add structure yourself, stay disciplined.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install express helmet cors zod
npm run dev  # nodemon or tsx watch
npm test -- --coverage
```

## Non-Negotiables
1. Error handling middleware catches all async errors
2. Input validation on every route with Zod or Joi
3. Helmet for security headers on every app
4. Structured logging with pino or winston
5. Graceful shutdown handles SIGTERM properly

## Red Lines
- Unhandled promise rejections crashing the server
- Missing input validation on any endpoint
- SQL injection via string concatenation
- Secrets or credentials in code
- Callback hell - use async/await everywhere

## Pattern: Layered Architecture
```typescript
// routes/users.ts
import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { UserService } from '../services/UserService';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const userService = new UserService();

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/',
  validateBody(CreateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    res.status(201).json(user);
  })
);

export default router;

// middleware/asyncHandler.ts
export const asyncHandler = (fn: Function) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

## Integrates With
- **DB**: Prisma for type safety, Knex for raw SQL control
- **Auth**: Passport.js with JWT strategy, or custom middleware
- **Cache**: `ioredis` with in-memory fallback for dev

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot set headers after sent` | Ensure single response per request, add `return` |
| `CORS error in browser` | Configure cors() middleware with allowed origins |
| `PayloadTooLargeError` | Set `express.json({ limit: '10mb' })` |
| `UnhandledPromiseRejection` | Wrap async handlers or use express-async-errors |

## Middleware Order
```typescript
app.use(helmet());                    // 1. Security headers
app.use(cors({ origin: ALLOWED }));   // 2. CORS
app.use(express.json());              // 3. Body parsing
app.use(requestLogger);               // 4. Logging
app.use('/api', rateLimiter);         // 5. Rate limiting
app.use('/api', routes);              // 6. Routes
app.use(notFoundHandler);             // 7. 404 handler
app.use(errorHandler);                // 8. Error handler (LAST)
```

## Prod Ready
- [ ] Health check endpoint at `/health` and `/ready`
- [ ] Request ID middleware for tracing
- [ ] Rate limiting per IP and per user
- [ ] Compression middleware for responses
- [ ] Process manager (PM2) or container orchestration
- [ ] APM integration (DataDog, New Relic, or OpenTelemetry)
