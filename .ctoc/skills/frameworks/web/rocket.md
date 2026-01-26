# Rocket CTO
> Type-safe Rust web framework.

## Non-Negotiables
1. Request guards for validation
2. Fairings for middleware
3. Managed state
4. Responder implementations
5. Proper error catchers

## Red Lines
- Unwrap in handlers
- Missing request guards
- Global mutable state
- Blocking in async handlers

## Pattern
```rust
#[post("/users", data = "<user>")]
async fn create_user(
    db: &State<DbPool>,
    user: Json<CreateUser>,
) -> Result<Json<User>, Status> {
    User::create(db, user.into_inner())
        .await
        .map(Json)
        .map_err(|_| Status::InternalServerError)
}
```
