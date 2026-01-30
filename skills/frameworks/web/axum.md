# Axum CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
cargo new myapp && cd myapp
cargo add axum tokio serde serde_json tower-http
# Requires Rust 1.72+
cargo run
```

## Claude's Common Mistakes
1. **Using `unwrap()` or `panic!` in handlers** — Use `Result` with `IntoResponse`
2. **Missing `IntoResponse` implementation** — All errors need HTTP response conversion
3. **Non-Send futures across await** — Check for non-Send types in async handlers
4. **Forgetting `.with_state()`** — State extractor fails without registration
5. **Blocking the runtime** — Use `tokio::task::spawn_blocking` for CPU work

## Correct Patterns (2026)
```rust
use axum::{
    extract::{Path, State, Json},
    http::StatusCode,
    response::IntoResponse,
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

struct AppState { db: PgPool }

#[derive(Deserialize)]
struct CreateUser { email: String, password: String }

#[derive(Serialize)]
struct UserResponse { id: i32, email: String }

// Error type with IntoResponse
enum AppError {
    Database(sqlx::Error),
    NotFound,
    Validation(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        match self {
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found").into_response(),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg).into_response(),
        }
    }
}

// Handler with proper error handling
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
    .await
    .map_err(AppError::Database)?;

    Ok((StatusCode::CREATED, Json(user)))
}

// Register state with router
let app = Router::new()
    .route("/users", post(create_user))
    .with_state(Arc::new(AppState { db: pool }));
```

## Version Gotchas
- **Axum 0.7+**: Uses Tower ecosystem; middleware as layers
- **State<T>**: Requires `.with_state()` on router
- **IntoResponse**: All return types must implement this
- **Send bounds**: Futures must be Send for concurrent handling

## What NOT to Do
- ❌ `.unwrap()` in handlers — Use `Result<impl IntoResponse, AppError>`
- ❌ Missing `IntoResponse` for errors — Compiler will reject
- ❌ `State<T>` without `.with_state()` — Runtime extraction failure
- ❌ Non-Send types across `.await` — Check async boundaries
- ❌ Sync blocking in handlers — Use `spawn_blocking`

## Axum vs Actix
| Feature | Axum | Actix |
|---------|------|-------|
| Ecosystem | Tower | Custom |
| Learning curve | Gentler | Steeper |
| Performance | Excellent | Excellent |
| Macros | Minimal | Heavy |
