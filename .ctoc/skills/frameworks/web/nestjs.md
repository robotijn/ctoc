# NestJS CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install -g @nestjs/cli
nest new myapp
# Select npm or yarn, strict TypeScript recommended
cd myapp && npm run start:dev
```

## Claude's Common Mistakes
1. **Circular dependencies** — Refactor modules or use `forwardRef()` sparingly
2. **Creating instances with `new` instead of DI** — Let NestJS inject dependencies
3. **CORS with wildcard origin** — 62% of apps expose data due to `origin: '*'`
4. **Missing ValidationPipe** — Always enable globally with `whitelist: true`
5. **Business logic in controllers** — Controllers orchestrate; services contain logic

## Correct Patterns (2026)
```typescript
// Global validation pipe (main.ts)
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // Strip unknown properties
  forbidNonWhitelisted: true,
  transform: true,        // Auto-transform to DTO types
}));

// Proper service injection (not `new`)
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.usersRepository.findByEmail(dto.email);
    if (exists) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersRepository.create(dto);
    this.eventEmitter.emit('user.created', new UserCreatedEvent(user));
    return user;
  }
}

// DTO with validation
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// Secure CORS configuration
app.enableCors({
  origin: ['https://myapp.com'],  // Not '*'
  credentials: true,
});
```

## Version Gotchas
- **NestJS 10+**: Node.js 18+ required
- **With TypeORM 0.3**: DataSource replaces Connection
- **Circular deps**: Common with poorly structured modules; use `forwardRef` carefully
- **Monorepo**: tsc cannot compile TS in dependencies; use Webpack or nx

## What NOT to Do
- ❌ `new UsersService()` — Use dependency injection
- ❌ `origin: '*'` in CORS — Specify allowed origins
- ❌ Missing `@Injectable()` on services — Required for DI
- ❌ `forwardRef` everywhere — Refactor circular dependencies
- ❌ Logic in controllers — Move to services

## Module Structure
```typescript
// Feature module pattern
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],  // Export for other modules
})
export class UsersModule {}
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Nest can't resolve dependencies` | Add `@Injectable()`, check imports |
| `Circular dependency` | Use `forwardRef()` or refactor |
| `Cannot determine GraphQL type` | Add `@Field(() => Type)` |
| `EntityMetadataNotFoundError` | Add entity to `forFeature()` |
