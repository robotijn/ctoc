# Ratpack CTO
> Lean JVM HTTP applications - non-blocking, promise-based, Netty underneath.

## Commands
```bash
# Setup | Dev | Test
# Gradle: id 'io.ratpack.ratpack-java' version '2.0.0-rc-1'
./gradlew run
./gradlew test
```

## Non-Negotiables
1. Promise-based async operations
2. Handler chains for request flow
3. Registry for dependency injection
4. Blocking operations in separate executor
5. Comprehensive testing support

## Red Lines
- Blocking in compute threads - use `Blocking.get()`
- Missing error handlers in chains
- Ignoring Promise composition
- No registry usage for services
- Sync operations in async paths

## Pattern: Handler Chain
```java
import ratpack.server.RatpackServer;
import ratpack.handling.Context;
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

                .all(ctx -> ctx.clientError(404))
            )
        );
    }

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

## Integrates With
- **DB**: JOOQ, Hibernate via Blocking.get()
- **Async**: RxJava integration
- **Testing**: ratpack-test with TestHttpClient
- **Metrics**: Dropwizard Metrics

## Common Errors
| Error | Fix |
|-------|-----|
| `Blocking call in compute` | Wrap with `Blocking.get()` |
| `Promise not subscribed` | Call `.then()` or `.operation()` |
| `Registry entry not found` | Add to registry in server config |
| `Handler not reached` | Check chain order, add `all()` fallback |

## Prod Ready
- [ ] Error handler registered
- [ ] Blocking pool sized
- [ ] Health check endpoint
- [ ] Metrics exported
- [ ] Graceful shutdown
- [ ] Response compression
