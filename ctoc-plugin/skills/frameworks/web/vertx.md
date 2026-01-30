# Vert.x CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Maven: io.vertx:vertx-core, io.vertx:vertx-web
mvn compile exec:java
# Vert.x 4.x - reactive JVM toolkit
```

## Claude's Common Mistakes
1. **Blocking the event loop** — Never block; use `executeBlocking`
2. **Ignoring Future composition** — Chain with `.compose()` or `.flatMap()`
3. **Missing error handlers** — Add `.onFailure()` to all operations
4. **Sync JDBC calls** — Use Vert.x async SQL clients
5. **Global mutable state** — Use Verticle-scoped state

## Correct Patterns (2026)
```java
import io.vertx.core.AbstractVerticle;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;

public class MainVerticle extends AbstractVerticle {
    private UserService userService;

    @Override
    public void start() {
        userService = new UserService(vertx);

        Router router = Router.router(vertx);

        // Middleware
        router.route().handler(BodyHandler.create());
        router.route().handler(ctx -> {
            ctx.response().putHeader("content-type", "application/json");
            ctx.next();
        });

        // Routes
        router.post("/api/users").handler(this::createUser);
        router.get("/api/users/:id").handler(this::getUser);
        router.get("/health").handler(ctx ->
            ctx.response().end(new JsonObject().put("status", "ok").encode())
        );

        // Start server
        vertx.createHttpServer()
            .requestHandler(router)
            .listen(8080)
            .onSuccess(server ->
                System.out.println("Started on port " + server.actualPort())
            );
    }

    private void createUser(RoutingContext ctx) {
        JsonObject body = ctx.body().asJsonObject();
        if (body == null || !body.containsKey("email")) {
            ctx.response().setStatusCode(400)
                .end(new JsonObject().put("error", "Email required").encode());
            return;
        }

        userService.create(body)
            .onSuccess(user -> ctx.response()
                .setStatusCode(201)
                .end(user.encode()))
            .onFailure(err -> ctx.response()
                .setStatusCode(500)
                .end(new JsonObject().put("error", err.getMessage()).encode()));
    }

    private void getUser(RoutingContext ctx) {
        String id = ctx.pathParam("id");
        userService.get(id)
            .onSuccess(user -> {
                if (user == null) {
                    ctx.response().setStatusCode(404)
                        .end(new JsonObject().put("error", "Not found").encode());
                } else {
                    ctx.response().end(user.encode());
                }
            })
            .onFailure(ctx::fail);
    }
}
```

## Version Gotchas
- **Vert.x 4.x**: Future-based API; Java 11+ required
- **Event loop**: Never block; use `vertx.executeBlocking()`
- **Futures**: Chain with `.compose()`, handle errors with `.onFailure()`
- **Async clients**: Use Vert.x SQL clients, not JDBC

## What NOT to Do
- ❌ Blocking operations on event loop — Use `executeBlocking()`
- ❌ Sync JDBC — Use Vert.x async SQL clients
- ❌ Missing `.onFailure()` — Errors silently dropped
- ❌ Unhandled Futures — Chain or subscribe
- ❌ Global mutable state — Use Verticle scope

## Common Errors
| Error | Fix |
|-------|-----|
| `Blocked event loop` | Use worker verticle or `executeBlocking` |
| `Future not composed` | Chain with `.compose()` |
| `NullPointerException` | Check body and path params |
| `Verticle not deployed` | Check deployment result |
