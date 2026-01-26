# Actix Web CTO
> Powerful Rust web framework - type safety, fearless concurrency, blazing performance.

## Commands
```bash
# Setup | Dev | Test
cargo new myapp && cd myapp && cargo add actix-web tokio serde
cargo watch -x run
cargo test
```

## Non-Negotiables
1. Extractors for typed request data (`Json`, `Path`, `Query`)
2. Error handling with `thiserror` and custom `ResponseError`
3. Middleware for auth, logging, CORS
4. Async properly - never block the Tokio runtime
5. App state with `Data<T>` for shared resources

## Red Lines
- `unwrap()` or `expect()` in handlers - use `?` with proper errors
- Missing error types - define domain errors with `thiserror`
- Blocking async runtime with sync code - use `web::block`
- `Clone` on large data in hot paths
- Unvalidated user input

## Pattern: Type-Safe Handler
```rust
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use validator::Validate;

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
            UserError::NotFound => HttpResponse::NotFound().json(json!({"error": self.to_string()})),
            UserError::EmailExists => HttpResponse::Conflict().json(json!({"error": self.to_string()})),
            UserError::Validation(msg) => HttpResponse::BadRequest().json(json!({"error": msg})),
            UserError::Database(_) => HttpResponse::InternalServerError().json(json!({"error": "Internal error"})),
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

## Integrates With
- **DB**: `sqlx` with compile-time checked queries
- **Auth**: `actix-web-httpauth` with JWT
- **Cache**: `actix-web-lab` cache middleware or Redis
- **Validation**: `validator` crate with derive macros

## Common Errors
| Error | Fix |
|-------|-----|
| `Data<T> is not configured` | Add `.app_data(web::Data::new(t))` in configure |
| `BlockingError` | Use `web::block` for CPU-intensive sync code |
| `connection pool timed out` | Increase pool size or check for leaks |
| `missing field in struct` | Add `#[serde(default)]` or make field `Option<T>` |

## Prod Ready
- [ ] Custom error types with `ResponseError`
- [ ] Structured logging with `tracing`
- [ ] Health check endpoint
- [ ] Graceful shutdown configured
- [ ] Connection pooling with proper limits
- [ ] Rate limiting middleware
