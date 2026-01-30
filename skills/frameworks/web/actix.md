# Actix Web CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
cargo new myapp && cd myapp
cargo add actix-web tokio serde serde_json thiserror validator
# Requires Rust 1.72+
cargo run
```

## Claude's Common Mistakes
1. **Using `unwrap()` in handlers** — Use `?` operator with proper error types
2. **Blocking the async runtime** — Use `web::block()` for CPU-intensive sync code
3. **Missing custom error types** — Implement `ResponseError` for domain errors
4. **Cloning large data in hot paths** — Use `Arc` or `Data<T>` for shared state
5. **Unvalidated user input** — Always validate with `validator` crate

## Correct Patterns (2026)
```rust
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use validator::Validate;

// Define error types (NOT unwrap)
#[derive(Error, Debug)]
pub enum UserError {
    #[error("User not found")]
    NotFound,
    #[error("Email already exists")]
    EmailExists,
    #[error("Validation failed: {0}")]
    Validation(String),
    #[error("Database error")]
    Database(#[from] sqlx::Error),
}

impl actix_web::ResponseError for UserError {
    fn error_response(&self) -> HttpResponse {
        match self {
            UserError::NotFound => HttpResponse::NotFound().json(serde_json::json!({"error": self.to_string()})),
            UserError::EmailExists => HttpResponse::Conflict().json(serde_json::json!({"error": self.to_string()})),
            UserError::Validation(msg) => HttpResponse::BadRequest().json(serde_json::json!({"error": msg})),
            UserError::Database(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Internal error"})),
        }
    }
}

#[derive(Deserialize, Validate)]
pub struct CreateUser {
    #[validate(email)]
    email: String,
    #[validate(length(min = 8))]
    password: String,
}

// Handler with proper error handling (no unwrap!)
pub async fn create_user(
    pool: web::Data<PgPool>,
    body: web::Json<CreateUser>,
) -> Result<HttpResponse, UserError> {
    body.validate().map_err(|e| UserError::Validation(e.to_string()))?;
    let user = sqlx::query_as!(User, "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *", body.email, body.password)
        .fetch_one(pool.get_ref())
        .await?;
    Ok(HttpResponse::Created().json(user))
}
```

## Version Gotchas
- **Actix Web 4.x**: Current stable; requires Rust 1.72+
- **Tokio runtime**: Don't block with sync code; use `web::block()`
- **Data<T>**: Must be registered with `.app_data()` before use
- **SQLx**: Use compile-time checked queries with `query_as!`

## What NOT to Do
- ❌ `.unwrap()` or `.expect()` in handlers — Use `?` with error types
- ❌ Sync blocking code in async handlers — Use `web::block()`
- ❌ `pool.clone()` in hot paths — Use `web::Data<T>` (Arc internally)
- ❌ Missing `ResponseError` impl — Errors need proper HTTP responses
- ❌ Ignoring validation — Use `validator` crate with derive

## Common Errors
| Error | Fix |
|-------|-----|
| `Data<T> is not configured` | Add `.app_data(web::Data::new(t))` |
| `BlockingError` | Wrap sync code in `web::block()` |
| `connection pool timed out` | Increase pool size or check leaks |
| `missing field in struct` | Add `#[serde(default)]` or `Option<T>` |
