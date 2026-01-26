# Warp CTO
> Composable Rust web filters.

## Non-Negotiables
1. Filter composition
2. Rejection handling
3. Proper async boundaries
4. Type-safe extractors
5. Tower integration

## Red Lines
- Nested filter chains
- Ignoring rejections
- Blocking in filters
- Missing recover handlers

## Pattern
```rust
let api = warp::path("users")
    .and(warp::post())
    .and(warp::body::json())
    .and(with_db(pool.clone()))
    .and_then(create_user)
    .recover(handle_rejection);
```
