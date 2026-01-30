# Warp CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
cargo new myapp && cd myapp
cargo add warp tokio serde serde_json
# Warp 0.3+ - requires Rust 1.70+
cargo run
```

## Claude's Common Mistakes
1. **Missing `recover()` handler** — Rejections return empty 500 without it
2. **Deeply nested filter chains** — Extract to helper functions
3. **Blocking in async filters** — Use `tokio::spawn_blocking`
4. **Missing custom rejection types** — Implement `Reject` trait
5. **Not using `with_*` helper filters** — Share state via filter composition

## Correct Patterns (2026)
```rust
use warp::{Filter, Rejection, Reply, reject};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
struct CreateUser { email: String, password: String }

#[derive(Serialize)]
struct User { id: i32, email: String }

// Custom rejection type
#[derive(Debug)]
struct NotFound;
impl reject::Reject for NotFound {}

// Helper filter for shared state
fn with_db(pool: Arc<PgPool>) -> impl Filter<Extract = (Arc<PgPool>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || pool.clone())
}

// Handler
async fn create_user(pool: Arc<PgPool>, body: CreateUser) -> Result<impl Reply, Rejection> {
    let user = sqlx::query_as!(User,
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
        body.email, body.password
    )
    .fetch_one(pool.as_ref())
    .await
    .map_err(|_| reject::custom(NotFound))?;

    Ok(warp::reply::with_status(
        warp::reply::json(&user),
        warp::http::StatusCode::CREATED
    ))
}

// Rejection handler (REQUIRED)
async fn handle_rejection(err: Rejection) -> Result<impl Reply, std::convert::Infallible> {
    let (code, message) = if err.is_not_found() || err.find::<NotFound>().is_some() {
        (warp::http::StatusCode::NOT_FOUND, "Not found")
    } else {
        (warp::http::StatusCode::INTERNAL_SERVER_ERROR, "Internal error")
    };

    Ok(warp::reply::with_status(
        warp::reply::json(&serde_json::json!({ "error": message })),
        code
    ))
}

// Compose filters
let pool = Arc::new(create_pool().await);

let users = warp::path("users")
    .and(warp::post())
    .and(warp::body::json())
    .and(with_db(pool.clone()))
    .and_then(|body, pool| create_user(pool, body))
    .recover(handle_rejection);  // REQUIRED
```

## Version Gotchas
- **Warp 0.3+**: Current stable; uses Filter composition
- **Tower compatible**: Can use Tower middleware
- **Rejections**: Must implement `Reject` trait for custom errors
- **recover()**: Required; unhandled rejections return empty 500

## What NOT to Do
- ❌ Missing `.recover()` — Errors return empty responses
- ❌ Deeply nested `and().and().and()` — Extract to functions
- ❌ Blocking in handlers — Use `tokio::spawn_blocking`
- ❌ Plain `Err()` in handlers — Use `reject::custom()`
- ❌ State without `with_*` filters — Compose with helper filters

## Filter Composition
```rust
// Extract complex filters to functions
fn user_routes(pool: Arc<PgPool>) -> impl Filter<Extract = impl Reply, Error = Rejection> + Clone {
    let create = warp::post()
        .and(warp::body::json())
        .and(with_db(pool.clone()))
        .and_then(create_user);

    let get = warp::get()
        .and(warp::path::param())
        .and(with_db(pool))
        .and_then(get_user);

    warp::path("users").and(create.or(get))
}
```
