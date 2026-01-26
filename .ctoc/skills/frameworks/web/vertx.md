# Vert.x CTO
> Reactive JVM toolkit.

## Non-Negotiables
1. Event loop awareness
2. Verticle architecture
3. Event bus messaging
4. Non-blocking patterns
5. Proper error handling

## Red Lines
- Blocking event loop
- Ignoring Future composition
- Missing error handlers
- Sync JDBC calls

## Pattern
```java
router.post("/users").handler(ctx -> {
    JsonObject body = ctx.body().asJsonObject();
    userService.create(body)
        .onSuccess(user -> ctx.response()
            .setStatusCode(201)
            .putHeader("content-type", "application/json")
            .end(user.encode()))
        .onFailure(ctx::fail);
});
```
