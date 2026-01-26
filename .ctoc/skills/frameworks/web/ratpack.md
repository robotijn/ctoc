# Ratpack CTO
> Lean JVM HTTP applications.

## Non-Negotiables
1. Promise-based async
2. Handler chains
3. Registry for DI
4. Blocking operations isolation
5. Testing support

## Red Lines
- Blocking in compute threads
- Missing error handlers
- Ignoring Promise composition
- No registry usage

## Pattern
```java
chain.post("users", ctx -> {
    ctx.parse(fromJson(CreateUserDto.class))
        .flatMap(dto -> userService.create(dto))
        .then(user -> ctx.render(json(user)));
});
```
