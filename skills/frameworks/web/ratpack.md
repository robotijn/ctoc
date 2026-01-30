# Ratpack CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# build.gradle
plugins { id 'io.ratpack.ratpack-java' version '2.0.0' }
./gradlew run
# Ratpack 2.x - lean JVM HTTP framework
```

## Claude's Common Mistakes
1. **Blocking in compute threads** — Use `Blocking.get()` for I/O
2. **Missing Promise subscription** — Call `.then()` or `.operation()`
3. **No registry for services** — Add to registry in server config
4. **Ignoring handler chain order** — Last handler wins
5. **Sync operations in async paths** — Wrap with `Blocking.get()`

## Correct Patterns (2026)
```java
import ratpack.server.RatpackServer;
import ratpack.exec.Promise;
import ratpack.exec.Blocking;
import ratpack.jackson.Jackson;

public class App {
    public static void main(String[] args) throws Exception {
        RatpackServer.start(server -> server
            .registryOf(r -> r
                .add(UserService.class, new UserServiceImpl())
            )
            .handlers(chain -> chain
                .path("health", ctx -> ctx.render("ok"))

                .prefix("api", api -> api
                    .post("users", ctx -> {
                        ctx.parse(Jackson.fromJson(CreateUserDto.class))
                            .flatMap(dto -> createUser(ctx, dto))
                            .then(user -> ctx.render(Jackson.json(user)));
                    })

                    .get("users/:id", ctx -> {
                        String id = ctx.getPathTokens().get("id");
                        getUser(ctx, id)
                            .onNull(() -> ctx.clientError(404))
                            .then(user -> ctx.render(Jackson.json(user)));
                    })
                )

                .all(ctx -> ctx.clientError(404))  // Fallback
            )
        );
    }

    // Wrap blocking operations with Blocking.get()
    private static Promise<User> createUser(Context ctx, CreateUserDto dto) {
        UserService service = ctx.get(UserService.class);
        return Blocking.get(() -> service.create(dto));
    }

    private static Promise<User> getUser(Context ctx, String id) {
        UserService service = ctx.get(UserService.class);
        return Blocking.get(() -> service.find(id));
    }
}
```

## Version Gotchas
- **Ratpack 2.x**: Java 17+ required; Netty underneath
- **Blocking.get()**: Required for all blocking I/O operations
- **Registry**: Dependency injection via server registry
- **Promise**: Must subscribe with `.then()` or `.operation()`

## What NOT to Do
- ❌ Blocking calls in compute threads — Use `Blocking.get()`
- ❌ Unsubscribed Promises — Call `.then()` or `.operation()`
- ❌ Missing registry entries — Register services in server config
- ❌ Sync JDBC calls — Wrap with `Blocking.get()`
- ❌ No fallback handler — Add `.all()` at end of chain

## Common Errors
| Error | Fix |
|-------|-----|
| `Blocking call in compute` | Wrap with `Blocking.get()` |
| `Promise not subscribed` | Call `.then()` or `.operation()` |
| `Registry entry not found` | Add to registry in server config |
| `Handler not reached` | Check chain order, add `.all()` fallback |
