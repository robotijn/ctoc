# Vert.x CTO
> Reactive JVM toolkit - event-driven, non-blocking, polyglot.

## Commands
```bash
# Setup | Dev | Test
# Maven: io.vertx:vertx-core, io.vertx:vertx-web
mvn compile exec:java
mvn test
```

## Non-Negotiables
1. Event loop awareness - never block
2. Verticle architecture for modularity
3. Event bus for inter-component messaging
4. Non-blocking patterns throughout
5. Proper Future/Promise composition

## Red Lines
- Blocking the event loop
- Ignoring Future composition
- Missing error handlers on handlers
- Sync JDBC calls - use async clients
- Global mutable state

## Pattern: Web Verticle
```java
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Future;
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
                System.out.println("Server started on port " + server.actualPort())
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

## Integrates With
- **DB**: Vert.x SQL clients (async Postgres, MySQL)
- **Auth**: Vert.x Auth with JWT
- **Messaging**: Event bus, Kafka, RabbitMQ
- **Clustering**: Hazelcast for distributed

## Common Errors
| Error | Fix |
|-------|-----|
| `Blocked event loop` | Move to worker verticle or executeBlocking |
| `Future not composed` | Chain with `.compose()` or `.flatMap()` |
| `NullPointerException` | Check body and path params |
| `Verticle not deployed` | Check deployment succeeded |

## Prod Ready
- [ ] Clustering configured
- [ ] Health check endpoint
- [ ] Metrics exported
- [ ] Circuit breakers for resilience
- [ ] Graceful shutdown
- [ ] Worker pool sized
