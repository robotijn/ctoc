# Rocket CTO
> Type-safe Rust web framework - macros for ergonomics, compile-time guarantees.

## Commands
```bash
# Setup | Dev | Test
cargo new myapp && cd myapp && cargo add rocket -F json
cargo run
cargo test
```

## Non-Negotiables
1. Request guards for typed parameter extraction
2. Fairings for middleware (logging, CORS, timing)
3. Managed state via `State<T>` - no global mutables
4. Responder implementations for custom responses
5. Error catchers for all error codes

## Red Lines
- `unwrap()` or `panic!` in handlers - return `Result`
- Missing request guards for validation
- Global mutable state - use managed state
- Blocking operations in async handlers
- Ignoring Rocket.toml for configuration

## Pattern: Guarded Handler
```rust
use rocket::{get, post, routes, State, serde::json::Json};
use rocket::http::Status;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct CreateUser {
    email: String,
    password: String,
}

#[derive(Debug, Serialize)]
struct User {
    id: i32,
    email: String,
}

struct DbPool(sqlx::PgPool);

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

#[catch(404)]
fn not_found() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "error": "Not found" }))
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(DbPool(create_pool().await))
        .mount("/api", routes![create_user])
        .register("/", catchers![not_found])
}
```

## Integrates With
- **DB**: SQLx with compile-time verified queries
- **Auth**: Custom request guards for JWT/sessions
- **Validation**: `validator` crate with guard
- **Config**: `Rocket.toml` and environment variables

## Common Errors
| Error | Fix |
|-------|-----|
| `Rocket failed to launch` | Check Rocket.toml, port availability |
| `State not managed` | Add `.manage(state)` to rocket builder |
| `Fairings not executing` | Check fairing attachment order |
| `422 Unprocessable Entity` | JSON doesn't match struct |

## Prod Ready
- [ ] Release profile optimized
- [ ] Error catchers for all codes
- [ ] Structured logging fairing
- [ ] Health check endpoint
- [ ] TLS configured
- [ ] Secrets via environment
