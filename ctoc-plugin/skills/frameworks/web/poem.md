# Poem CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
cargo new myapp && cd myapp
cargo add poem poem-openapi tokio --features tokio/full
cargo run
# Poem 3.x - async Rust web framework with OpenAPI
```

## Claude's Common Mistakes
1. **Using `unwrap()` in handlers** — Always use `Result`
2. **Missing `Data<T>` for shared state** — Add with `.data()`
3. **Forgetting OpenAPI annotations** — Use `poem-openapi` decorators
4. **Blocking in async** — Use `spawn_blocking` for sync code
5. **No error handling middleware** — Errors return 500 without context

## Correct Patterns (2026)
```rust
use poem::{listener::TcpListener, Route, Server, web::Data};
use poem_openapi::{payload::Json, Object, OpenApi, OpenApiService};
use sqlx::PgPool;

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
        .map_err(|_| poem::Error::from_status(StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(user))
    }

    #[oai(path = "/users/{id}", method = "get")]
    async fn get_user(
        &self,
        pool: Data<&PgPool>,
        id: Path<i32>,
    ) -> Result<Json<User>, poem::Error> {
        let user = sqlx::query_as!(User, "SELECT id, email FROM users WHERE id = $1", *id)
            .fetch_optional(pool.0)
            .await
            .map_err(|_| poem::Error::from_status(StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_status(StatusCode::NOT_FOUND))?;

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
        .await
        .unwrap();
}
```

## Version Gotchas
- **Poem 3.x**: Current stable; full async/await
- **poem-openapi**: Derive OpenAPI docs from code
- **Data<T>**: Extract shared state with `.data()` on routes
- **Object derive**: Required for request/response serialization

## What NOT to Do
- ❌ `unwrap()` in handlers — Use `Result` with `?`
- ❌ Missing `.data(pool)` — Data extractor fails
- ❌ No `#[oai(...)]` attributes — OpenAPI not generated
- ❌ Blocking I/O in async — Use `spawn_blocking`
- ❌ Panic on errors — Use proper error types

## Common Errors
| Error | Fix |
|-------|-----|
| `Data<T> not found` | Add `.data(value)` to Route |
| `OpenAPI schema error` | Check Object derive attributes |
| `Extractor failed` | Request doesn't match schema |
| `Connection refused` | Check TcpListener binding |
