# Micronaut CTO
> Compile-time JVM framework - fast startup, low memory, GraalVM native ready.

## Commands
```bash
# Setup | Dev | Test
mn create-app myapp --features=data-jdbc,postgres && cd myapp
./gradlew run  # or ./mvnw mn:run
./gradlew test
```

## Non-Negotiables
1. Compile-time DI - no runtime reflection
2. Declarative HTTP clients with `@Client`
3. Micronaut Data for repositories
4. GraalVM native image support
5. Reactive patterns where appropriate

## Red Lines
- Runtime reflection - breaks native compilation
- Blocking in reactive chains
- Missing health/metrics endpoints
- Ignoring compile-time processing benefits
- Heavy classpath scanning

## Pattern: Controller with Validation
```java
// src/main/java/com/example/controller/UserController.java
package com.example.controller;

import com.example.dto.CreateUserDto;
import com.example.model.User;
import com.example.service.UserService;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.*;
import io.micronaut.validation.Validated;
import jakarta.validation.Valid;

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
package com.example.dto;

import io.micronaut.serde.annotation.Serdeable;
import jakarta.validation.constraints.*;

@Serdeable
public record CreateUserDto(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8) String password
) {}
```

## Integrates With
- **DB**: Micronaut Data JDBC or JPA
- **Auth**: Micronaut Security with JWT
- **HTTP Client**: Declarative `@Client` interfaces
- **Messaging**: Micronaut Kafka or RabbitMQ

## Common Errors
| Error | Fix |
|-------|-----|
| `Bean not found` | Check `@Singleton` or `@Prototype` annotation |
| `Validation not working` | Add `@Validated` on class, `@Valid` on param |
| `Native build fails` | Check reflection config, avoid runtime proxies |
| `Serialization error` | Add `@Serdeable` to DTOs |

## Prod Ready
- [ ] Health endpoint enabled: `/health`
- [ ] Metrics exported: `/metrics`
- [ ] Native image tested
- [ ] Database connection pool configured
- [ ] Logback configured for JSON output
- [ ] Graceful shutdown enabled
