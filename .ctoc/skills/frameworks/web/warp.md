# Warp CTO
> Composable Rust web filters - functional, type-safe, Tower-compatible.

## Commands
```bash
# Setup | Dev | Test
cargo new myapp && cd myapp && cargo add warp tokio serde serde_json
cargo run
cargo test
```

## Non-Negotiables
1. Filter composition with `and()`, `or()`
2. Proper rejection handling with `recover()`
3. Async handlers without blocking
4. Type-safe extractors via filters
5. Tower service compatibility

## Red Lines
- Deeply nested filter chains - use helper functions
- Ignoring rejections - always add `recover()`
- Blocking in async filters - use `spawn_blocking`
- Missing error types for rejections
- Not using `with_db` style helper filters

## Pattern: Filter Composition
```rust
use warp::{Filter, Rejection, Reply, reject};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
struct CreateUser { email: String, password: String }

#[derive(Serialize)]
struct User { id: i32, email: String }

#[derive(Debug)]
struct NotFound;
impl reject::Reject for NotFound {}

fn with_db(pool: Arc<PgPool>) -> impl Filter<Extract = (Arc<PgPool>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || pool.clone())
}

async fn create_user(pool: Arc<PgPool>, body: CreateUser) -> Result<impl Reply, Rejection> {
    let user = sqlx::query_as!(User, "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email", body.email, body.password)
        .fetch_one(pool.as_ref())
        .await
        .map_err(|_| reject::custom(NotFound))?;

    Ok(warp::reply::with_status(warp::reply::json(&user), warp::http::StatusCode::CREATED))
}

async fn handle_rejection(err: Rejection) -> Result<impl Reply, std::convert::Infallible> {
    let code;
    let message;

    if err.is_not_found() || err.find::<NotFound>().is_some() {
        code = warp::http::StatusCode::NOT_FOUND;
        message = "Not found";
    } else {
        code = warp::http::StatusCode::INTERNAL_SERVER_ERROR;
        message = "Internal server error";
    }

    Ok(warp::reply::with_status(warp::reply::json(&serde_json::json!({ "error": message })), code))
}

let pool = Arc::new(create_pool().await);

let users = warp::path("users")
    .and(warp::post())
    .and(warp::body::json())
    .and(with_db(pool.clone()))
    .and_then(|body, pool| create_user(pool, body))
    .recover(handle_rejection);
```

## Integrates With
- **DB**: SQLx with Arc-wrapped pools
- **Auth**: Custom filter for JWT extraction
- **Tracing**: `tracing` crate with warp trace filter
- **Tower**: Compatible with Tower services

## Common Errors
| Error | Fix |
|-------|-----|
| `Rejection unhandled` | Add `.recover()` to filter chain |
| `Type mismatch in and()` | Check filter extract types align |
| `Future not Send` | Check for non-Send across await |
| `Cannot infer type` | Add explicit type annotations |

## Prod Ready
- [ ] Rejection handler for all errors
- [ ] Tracing filter for requests
- [ ] Graceful shutdown
- [ ] Health check route
- [ ] CORS filter configured
- [ ] TLS with `warp::serve().tls()`
