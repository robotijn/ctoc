# Spring Boot CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Spring Boot 3.5.x - requires Java 17+
# Use Spring Initializr: https://start.spring.io
# Or with CLI:
curl https://start.spring.io/starter.tgz \
  -d dependencies=web,data-jpa,postgresql \
  -d type=maven-project -d language=java | tar -xzf -
./mvnw spring-boot:run
```

## Claude's Common Mistakes
1. **Field injection with `@Autowired`** — Use constructor injection; more testable
2. **Missing `@Transactional`** — Required on service methods that write to DB
3. **Catching generic `Exception`** — Handle specific exceptions properly
4. **Using Hibernate 5 patterns** — Spring Boot 3 uses Hibernate 6 with breaking changes
5. **Jakarta EE namespace** — Spring Boot 3 uses `jakarta.*`, not `javax.*`

## Correct Patterns (2026)
```java
// Constructor injection (not @Autowired field injection)
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public UserResponse createUser(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered");
        }

        User user = User.builder()
            .email(request.email())
            .password(passwordEncoder.encode(request.password()))
            .build();

        return UserResponse.from(userRepository.save(user));
    }
}

// Jakarta EE (not javax)
import jakarta.persistence.Entity;
import jakarta.validation.constraints.Email;

// Spring Boot 3 records for DTOs
public record CreateUserRequest(
    @Email String email,
    @NotBlank String password
) {}
```

## Version Gotchas
- **Spring Boot 2→3**: Java 17 required, `javax.*` → `jakarta.*`
- **Spring Boot 3**: Hibernate 6 (stricter HQL parsing, type changes)
- **Spring Boot 3.2 EOL**: June 2025
- **Spring Boot 3.4 EOL**: End of 2025
- **Observability**: Use Micrometer Tracing (not Spring Cloud Sleuth)

## What NOT to Do
- ❌ `@Autowired private UserRepository repo;` — Use constructor injection
- ❌ `import javax.persistence.*;` — Use `jakarta.persistence.*`
- ❌ `catch (Exception e) { log.error(...) }` — Handle specific exceptions
- ❌ Hibernate 5 query patterns — Update for Hibernate 6 stricter parsing
- ❌ `@Transactional` on wrong place — Goes on service layer, not repository

## Spring Boot 3 Migration
```java
// javax → jakarta migration
// Old: import javax.persistence.Entity;
// New:
import jakarta.persistence.Entity;

// Hibernate 6 stricter queries
// May need to fix HQL/JPQL that worked in Hibernate 5
```

## Production Configuration
```yaml
# application.yml
spring:
  jpa:
    open-in-view: false  # Prevent lazy loading issues
  datasource:
    hikari:
      maximum-pool-size: 10
server:
  shutdown: graceful
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
```
