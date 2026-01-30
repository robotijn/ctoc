# Rocket CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
cargo new myapp && cd myapp
cargo add rocket -F json
# Requires Rust nightly or stable 1.74+
cargo run
```

## Claude's Common Mistakes
1. **Using `unwrap()` in handlers** — Return `Result` with proper status codes
2. **Missing managed state registration** — Add `.manage(state)` to builder
3. **Forgetting error catchers** — Register catchers for all error codes
4. **Blocking in async handlers** — Use `rocket::tokio::task::spawn_blocking`
5. **Hardcoding configuration** — Use `Rocket.toml` and environment variables

## Correct Patterns (2026)
```rust
use rocket::{get, post, routes, catch, catchers, State, serde::json::Json};
use rocket::http::Status;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct CreateUser {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct User { id: i32, email: String }

struct DbPool(sqlx::PgPool);

// Handler with Result (not unwrap!)
#[post("/users", data = "<user>")]
async fn create_user(
    db: &State<DbPool>,
    user: Json<CreateUser>,
) -> Result<(Status, Json<User>), Status> {
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
        user.email,
        user.password
    )
    .fetch_one(&db.0)
    .await
    .map_err(|_| Status::InternalServerError)?;

    Ok((Status::Created, Json(user)))
}

// Error catchers (required)
#[catch(404)]
fn not_found() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "error": "Not found" }))
}

#[catch(500)]
fn internal_error() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "error": "Internal server error" }))
}

#[launch]
async fn rocket() -> _ {
    let pool = create_pool().await;
    rocket::build()
        .manage(DbPool(pool))           // Register state
        .mount("/api", routes![create_user])
        .register("/", catchers![not_found, internal_error])
}
```

## Version Gotchas
- **Rocket 0.5**: Async support, requires Rust 1.74+ stable
- **State<T>**: Must call `.manage(state)` before routes
- **Fairings**: Execute in registration order
- **Rocket.toml**: Use for environment-specific config

## What NOT to Do
- ❌ `.unwrap()` in handlers — Return `Result<T, Status>`
- ❌ Missing `.manage(state)` — State extraction fails at runtime
- ❌ No error catchers — Unhandled errors return generic HTML
- ❌ Blocking sync code — Use `spawn_blocking` for CPU work
- ❌ Secrets in code — Use `Rocket.toml` or env vars

## Rocket.toml Configuration
```toml
[default]
address = "0.0.0.0"
port = 8000

[release]
secret_key = "<generate-with-openssl>"
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Rocket failed to launch` | Check port availability, Rocket.toml |
| `State not managed` | Add `.manage(state)` to builder |
| `422 Unprocessable Entity` | JSON doesn't match expected struct |
| `Fairings not executing` | Check attachment order |
