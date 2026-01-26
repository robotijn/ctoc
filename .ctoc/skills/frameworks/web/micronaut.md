# Micronaut CTO
> Compile-time JVM framework.

## Non-Negotiables
1. AOT compilation benefits
2. Declarative HTTP clients
3. Micronaut Data
4. GraalVM native image
5. Reactive patterns

## Red Lines
- Runtime reflection
- Blocking in reactive chains
- Missing health endpoints
- Ignoring compile-time DI

## Pattern
```java
@Controller("/users")
public class UserController {
    @Post
    public HttpResponse<User> create(@Body @Valid CreateUserDto dto) {
        User user = userService.create(dto);
        return HttpResponse.created(user);
    }
}
```
