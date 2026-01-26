# Poem CTO
> Full-featured async Rust web framework.

## Non-Negotiables
1. OpenAPI integration
2. Extractor pattern
3. Middleware composition
4. Error handling with Results
5. WebSocket support

## Red Lines
- Panics in handlers
- Missing API documentation
- Blocking in async contexts
- Ignoring extractor errors

## Pattern
```rust
#[handler]
async fn create_user(
    pool: Data<&DbPool>,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<User>> {
    let user = User::create(&pool, req).await?;
    Ok(Json(user))
}
```
