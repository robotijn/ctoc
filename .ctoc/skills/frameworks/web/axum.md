# Axum CTO
> Ergonomic Rust web framework - Tower ecosystem, type-safe extractors, async-first.

## Commands
```bash
# Setup | Dev | Test
cargo new myapp && cd myapp && cargo add axum tokio serde
cargo watch -x run
cargo test
```

## Non-Negotiables
1. Extractors for type-safe request data (`Json`, `Path`, `Query`, `State`)
2. Shared state via `State<Arc<AppState>>` or Extension
3. Tower middleware for logging, auth, CORS
4. Error handling with `IntoResponse` implementations
5. Graceful shutdown with signal handling

## Red Lines
- `unwrap()` or `panic!` in handlers - use `Result` and `?`
- Missing error types - implement `IntoResponse`
- Type inference failures - add explicit types
- Blocking async runtime - use `spawn_blocking`
- Unvalidated request data

## Pattern: Layered Handler
```rust
use axum::{extract::{Path, State, Json}, http::StatusCode, response::IntoResponse, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

struct AppState { db: PgPool }

#[derive(Deserialize)]
struct CreateUser { email: String, password: String }

#[derive(Serialize)]
struct UserResponse { id: i32, email: String }

async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateUser>,
) -> Result<impl IntoResponse, AppError> {
    let user = sqlx::query_as!(
        UserResponse,
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
        payload.email, payload.password
    )
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(user)))
}

// Error handling
enum AppError { Database(sqlx::Error), NotFound }

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        match self {
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found").into_response(),
        }
    }
}
```

## Integrates With
- **DB**: `sqlx` with compile-time verified queries
- **Auth**: `axum-extra` TypedHeader for JWT extraction
- **Middleware**: Tower layers for tracing, compression
- **Validation**: `validator` crate with custom extractor

## Common Errors
| Error | Fix |
|-------|-----|
| `State<T> not found` | Add `.with_state(state)` to router |
| `Missing IntoResponse impl` | Implement `IntoResponse` for error type |
| `Future is not Send` | Check for non-Send types across await |
| `Cannot move out of borrowed content` | Clone or use Arc for shared state |

## Prod Ready
- [ ] Tracing with `tower-http::trace`
- [ ] Graceful shutdown configured
- [ ] Health check endpoint
- [ ] Request ID middleware
- [ ] Compression enabled
- [ ] Rate limiting with tower middleware
