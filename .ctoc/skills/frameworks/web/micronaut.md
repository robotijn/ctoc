# Micronaut CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
sdk install micronaut
mn create-app myapp --features=data-jdbc,postgres && cd myapp
./gradlew run
# Micronaut 4.x - compile-time JVM framework
```

## Claude's Common Mistakes
1. **Runtime reflection** — Breaks GraalVM native compilation
2. **Missing `@Serdeable`** — Required for JSON serialization
3. **Forgetting `@Validated`** — Validation won't work without it
4. **Blocking in reactive chains** — Use reactive patterns consistently
5. **Spring patterns** — Micronaut has different conventions

## Correct Patterns (2026)
```java
// src/main/java/com/example/controller/UserController.java
@Controller("/users")
@Validated
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @Post
    public HttpResponse<User> create(@Body @Valid CreateUserDto dto) {
        User user = userService.create(dto);
        return HttpResponse.created(user);
    }

    @Get("/{id}")
    public HttpResponse<User> get(Long id) {
        return userService.findById(id)
            .map(HttpResponse::ok)
            .orElse(HttpResponse.notFound());
    }
}

// src/main/java/com/example/dto/CreateUserDto.java
@Serdeable  // REQUIRED for JSON serialization
public record CreateUserDto(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8) String password
) {}

// src/main/java/com/example/client/ExternalApiClient.java
@Client("https://api.example.com")
public interface ExternalApiClient {
    @Get("/users/{id}")
    User getUser(Long id);
}
```

## Version Gotchas
- **Micronaut 4.x**: Java 17+ required; compile-time DI
- **@Serdeable**: Required on all DTOs for JSON serialization
- **@Validated**: Add to controller class, `@Valid` on parameters
- **GraalVM**: Avoid runtime reflection for native image support

## What NOT to Do
- ❌ Runtime reflection — Breaks native compilation
- ❌ Missing `@Serdeable` — Serialization fails
- ❌ Missing `@Validated` on controller — Validation ignored
- ❌ Spring `@Autowired` — Use constructor injection
- ❌ Blocking calls in reactive chains — Stay reactive

## Common Errors
| Error | Fix |
|-------|-----|
| `Bean not found` | Add `@Singleton` or `@Prototype` |
| `Validation not working` | Add `@Validated` on class |
| `Serialization error` | Add `@Serdeable` to DTO |
| `Native build fails` | Check reflection-config.json |
