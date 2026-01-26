# Rust CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `unwrap()` liberally — use `?` operator in production
- Claude forgets Rust 2024 edition requires `unsafe extern` blocks
- Claude suggests `static mut` — now requires unsafe for references
- Claude uses `env::set_var` without noting it's unsafe in 2024 edition

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `rust 2024 edition` | Latest stable | 2021 edition |
| `clippy::pedantic` | Strict linting | Default clippy |
| `cargo-audit` | Security scanning | Manual checks |
| `cargo-auditable` | Embed dep info in binary | Unknown binaries |
| `miri` | Undefined behavior detection | Just tests |

## Patterns Claude Should Use
```rust
// Rust 2024 edition patterns
// extern blocks must be unsafe
unsafe extern "C" {
    fn external_function();
}

// Use thiserror for library errors
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
}

// Proper async with tokio
async fn process() -> Result<(), AppError> {
    let data = tokio::fs::read("file.txt").await?;
    // spawn_blocking for CPU-bound work
    tokio::task::spawn_blocking(|| heavy_compute()).await?;
    Ok(())
}
```

## Anti-Patterns Claude Generates
- `unwrap()` or `expect()` in production paths — use `?`
- `static mut` with direct references — use Mutex or atomics
- `.clone()` to satisfy borrow checker — refactor ownership
- `#[allow(clippy::...)]` without justification — fix the warning
- Unbounded `tokio::spawn` loops — use semaphores

## Version Gotchas
- **2024 edition**: `extern` blocks require `unsafe` keyword
- **2024 edition**: `env::set_var`/`remove_var` are `unsafe`
- **2024 edition**: References to `static mut` are errors (not warnings)
- **With async**: Never hold locks across `.await` — causes deadlocks
- **With tokio**: Use `spawn_blocking` for CPU work, not `spawn`
