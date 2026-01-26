# NestJS CTO
> Enterprise Node.js architecture - Angular-inspired, TypeScript-first, testable.

## Commands
```bash
# Setup | Dev | Test
npx @nestjs/cli new myapp
npm run start:dev
npm run test:cov
```

## Non-Negotiables
1. Modules organize features - one module per bounded context
2. DTOs with `class-validator` for all input validation
3. Dependency injection for all services
4. Guards for authentication, interceptors for cross-cutting concerns
5. Custom exceptions extend `HttpException`

## Red Lines
- Circular dependencies between modules - refactor or use `forwardRef`
- Business logic in controllers - controllers only orchestrate
- Missing `ValidationPipe` globally or on endpoints
- `any` type anywhere - strict TypeScript always
- Database calls in controllers - use repository pattern

## Pattern: Clean Module Structure
```typescript
// users/users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}

// users/users.service.ts
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

// users/dto/create-user.dto.ts
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

## Integrates With
- **DB**: TypeORM or Prisma with repository pattern
- **Auth**: Passport.js with JWT and Guard composition
- **Cache**: `@nestjs/cache-manager` with Redis
- **Queue**: BullMQ with `@nestjs/bullmq` for background jobs

## Common Errors
| Error | Fix |
|-------|-----|
| `Nest can't resolve dependencies` | Check imports, add `@Injectable()`, check circular deps |
| `Cannot determine GraphQL output type` | Add explicit type decorator `@Field(() => Type)` |
| `Validation failed` | Check DTO decorators match request shape |
| `EntityMetadataNotFoundError` | Add entity to TypeOrmModule.forFeature() |

## Prod Ready
- [ ] Global validation pipe with `whitelist: true`
- [ ] Swagger documentation with `@nestjs/swagger`
- [ ] Health checks with `@nestjs/terminus`
- [ ] Rate limiting with `@nestjs/throttler`
- [ ] Helmet middleware for security headers
- [ ] Structured logging with Pino or Winston
