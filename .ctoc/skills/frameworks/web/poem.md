# Poem CTO
> Full-featured async Rust web framework - OpenAPI-first, batteries included.

## Commands
```bash
# Setup | Dev | Test
cargo new myapp && cd myapp && cargo add poem poem-openapi tokio
cargo run
cargo test
```

## Non-Negotiables
1. OpenAPI integration with `poem-openapi` crate
2. Extractor pattern for typed request data
3. Middleware composition with `EndpointExt`
4. Result-based error handling
5. WebSocket support when needed

## Red Lines
- `panic!` or `unwrap()` in handlers - always use `Result`
- Missing OpenAPI documentation on endpoints
- Blocking operations in async contexts
- Ignoring extractor validation errors
- Not using `Data<T>` for shared state

## Pattern: OpenAPI Endpoint
```rust
use poem::{listener::TcpListener, Server, web::Data};
use poem_openapi::{payload::Json, Object, OpenApi, OpenApiService};

#[derive(Object)]
struct CreateUserRequest {
    #[oai(validator(min_length = 1))]
    email: String,
    #[oai(validator(min_length = 8))]
    password: String,
}

#[derive(Object)]
struct User {
    id: i32,
    email: String,
}

struct Api;

#[OpenApi]
impl Api {
    #[oai(path = "/users", method = "post")]
    async fn create_user(
        &self,
        pool: Data<&PgPool>,
        body: Json<CreateUserRequest>,
    ) -> Result<Json<User>, poem::Error> {
        let user = sqlx::query_as!(
            User,
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
            body.email, body.password
        )
        .fetch_one(pool.0)
        .await
        .map_err(|e| poem::Error::from_status(StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(user))
    }
}

#[tokio::main]
async fn main() {
    let pool = create_pool().await;
    let api_service = OpenApiService::new(Api, "Users API", "1.0")
        .server("http://localhost:3000/api");
    let ui = api_service.swagger_ui();

    Server::new(TcpListener::bind("0.0.0.0:3000"))
        .run(Route::new()
            .nest("/api", api_service)
            .nest("/docs", ui)
            .data(pool))
        .await;
}
```

## Integrates With
- **DB**: SQLx with async queries
- **Auth**: Custom middleware or extractors
- **Docs**: Built-in Swagger UI
- **WebSocket**: `poem::web::websocket`

## Common Errors
| Error | Fix |
|-------|-----|
| `Data<T> not found` | Add `.data(value)` to route |
| `OpenAPI schema error` | Check `Object` derive attributes |
| `Extractor failed` | Validate request matches schema |
| `Connection refused` | Check listener binding |

## Prod Ready
- [ ] OpenAPI documentation complete
- [ ] Error handling middleware
- [ ] Health check endpoint
- [ ] Tracing integration
- [ ] Graceful shutdown
- [ ] TLS configured
