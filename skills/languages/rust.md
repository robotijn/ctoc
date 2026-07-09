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

## Ownership / Borrow Footguns
The borrow checker is not the enemy — reaching for `.clone()` to silence it is. Most
"fights" are a design smell.

```rust
// FOOTGUN: cloning to escape the borrow checker (hidden allocation on a hot path).
fn total(items: &Vec<String>) -> usize {
    let owned = items.clone();          // WRONG: deep-copies every String
    owned.iter().map(|s| s.len()).sum()
}
// SAFE: borrow; take &[T] not &Vec<T> so callers can pass slices/arrays too.
fn total_ok(items: &[String]) -> usize {
    items.iter().map(|s| s.len()).sum()
}
```
- **API surface**: accept `&str` not `&String`, `&[T]` not `&Vec<T>` — more general,
  zero-cost. Return owned types; borrow in parameters.
- **Lifetime elision breaks** when a function returns a reference tied to more than
  one input — you must name the lifetime (`fn f<'a>(x: &'a X, y: &Y) -> &'a T`) so the
  compiler knows which input the output borrows from.
- **`Rc`/`RefCell` cycles leak**: `Rc<RefCell<Node>>` graphs with back-pointers never
  drop. Use `Weak<T>` for the back-edge. `RefCell` moves borrow checking to RUNTIME —
  a double `borrow_mut()` panics instead of failing to compile.

## Error Handling Idioms
`Result<T, E>` + the `?` operator is the contract; `unwrap()`/`expect()` in a
production path is a latent panic (an uncaught `Err` becomes a process abort).

```rust
// Propagate with ?; ? applies From, so it converts the error into your error type.
fn load(path: &str) -> Result<Config, AppError> {
    let raw = std::fs::read_to_string(path)?;   // io::Error -> AppError via From
    let cfg: Config = toml::from_str(&raw)?;     // toml::de::Error -> AppError
    Ok(cfg)
}
```
- **Library crates**: define a typed error with `thiserror` (`#[derive(Error)]`,
  `#[from]` for conversions) so callers can match on variants. **Application/binary
  crates**: `anyhow::Result<T>` with `.context("...")` is fine — you never need to
  match, only report.
- **`unwrap()`/`expect()`** are acceptable only where a panic is genuinely the right
  outcome (tests, invariants that cannot fail, `main` prototyping). Everywhere else:
  `?`. Prefer `expect("reason")` over `unwrap()` so a panic message names the invariant.
- **Never swallow**: `let _ = fallible();` discards an error silently — handle or
  propagate it. `#[must_use]` on `Result` makes the compiler warn if you drop it.
- Source: doc.rust-lang.org/book (error handling), docs.rs/thiserror. See References.

## Async Footguns (tokio)
The single most common async deadlock: **holding a `std::sync::Mutex` guard across an
`.await`**. The guard is not `Send`, and even with a tokio `Mutex` you serialize the
whole runtime while suspended.

```rust
// FOOTGUN: std Mutex guard held across .await — the future is now !Send and cannot
// be scheduled on tokio's multi-thread runtime; worse, it blocks the worker thread.
async fn bad(data: &std::sync::Mutex<Vec<u8>>) {
    let mut guard = data.lock().unwrap();
    write_to_disk(&guard).await;         // WRONG: guard alive across await point
}                                        // → compile error (!Send) or deadlock

// SAFE A: drop the guard BEFORE awaiting (do the sync work, then release, then await).
async fn ok_a(data: &std::sync::Mutex<Vec<u8>>) {
    let snapshot = { let g = data.lock().unwrap(); g.clone() };  // guard dropped here
    write_to_disk(&snapshot).await;
}
// SAFE B: if you genuinely must hold a lock across .await, use tokio's async Mutex.
async fn ok_b(data: &tokio::sync::Mutex<Vec<u8>>) {
    let guard = data.lock().await;       // async-aware; guard is Send
    write_to_disk(&guard).await;
}
```
- **Send bound on spawned futures**: `tokio::spawn` requires `Future: Send + 'static`.
  A non-`Send` local (like the std guard above) held across `.await` breaks it.
- **`async fn` in traits**: native since Rust 1.75, but the returned future is not
  `dyn`-compatible without boxing — use `#[trait_variant]` or `async-trait` for object
  safety.
- **CPU-bound work starves the runtime**: never do heavy compute inside an async task;
  `tokio::task::spawn_blocking` moves it to the blocking pool.
- **tokio version verified at edit time: 1.52.3** (current stable).
  [crates.io/crates/tokio + docs.rs/tokio, retrieved 2026-07-09]
- Source: docs.rs/tokio (sync::Mutex), tokio.rs/tokio/tutorial/shared-state. See References.

## Unsafe Invariants
`unsafe` does not turn off the borrow checker — it grants five extra powers
(deref raw pointers, call unsafe fns, access `union`/`static mut`, impl unsafe traits,
mutate through raw pointers). Every `unsafe` block MUST document the invariant it upholds.

```rust
// Every unsafe block carries a // SAFETY: comment stating WHY it is sound.
let ptr = slice.as_ptr();
// SAFETY: `i` is checked < slice.len() above, so ptr.add(i) is in-bounds and the
// slice outlives this read; no other reference mutates it during the read.
let val = unsafe { *ptr.add(i) };
```
- **Undefined behavior is silent**: an aliasing violation or out-of-bounds read may
  "work" until an optimizer or a new compiler miscompiles it. Run **`miri`**
  (`cargo +nightly miri test`) to detect UB in unsafe code.
- Prefer safe abstractions (`slice::get`, `bytemuck`, `zerocopy`) over hand-rolled
  raw-pointer code; keep `unsafe` blocks minimal and locally auditable.

## Send / Sync Pitfalls
- `Rc<T>` is `!Send` and `!Sync` — never share across threads; use `Arc<T>`.
- `Cell`/`RefCell` are `!Sync` — for shared mutable state across threads use
  `Mutex`/`RwLock` (or atomics for primitives).
- Implementing `Send`/`Sync` **manually** (`unsafe impl Send for ...`) is an unsafe
  promise the compiler cannot check — get the invariant wrong and you get data races
  in "safe" Rust. Almost always the auto-derived bounds are what you want.

## Edition Migration (2021 → 2024)
The **2024 edition stabilized in Rust 1.85.0, released 2025-02-20**
[blog.rust-lang.org/2025/02/20/Rust-1.85.0, retrieved 2026-07-09]. Migrate with
`cargo fix --edition`, then bump `edition = "2024"` in `Cargo.toml`. Breaking changes
Claude reliably misses:
- **`unsafe extern`**: `extern "C" { ... }` blocks now require the `unsafe` keyword.
- **`env::set_var` / `remove_var` are `unsafe`**: they are unsound in the presence of
  other threads reading the environment.
- **`static mut` references** (`&mut STATIC`, `&STATIC`) are now hard errors — use
  `OnceLock`, atomics, or a `Mutex`.
- **RPIT lifetime capture** and `gen`/`async gen` reserved keywords also changed.
- Editions are per-crate and interoperable — a 2024 crate can depend on a 2021 crate.
  [doc.rust-lang.org/edition-guide/rust-2024, retrieved 2026-07-09]

## Dependency Security (cargo audit + RUSTSEC)
- **`cargo audit`** checks `Cargo.lock` against the **RUSTSEC advisory database**
  (rustsec.org). Run it in CI; `cargo-auditable` embeds the dep list in the binary so
  deployed artifacts can be scanned later.
- **Real advisories to know**: **RUSTSEC-2025-0009** — `ring` AES functions may panic
  with overflow checks enabled, **published 2025-03-06** [rustsec.org/advisories/RUSTSEC-2025-0009,
  retrieved 2026-07-09]. **RUSTSEC-2024-0003** — resource-exhaustion DoS in `h2`
  (HTTP/2), **published 2024-01-17** [rustsec.org/advisories/RUSTSEC-2024-0003,
  retrieved 2026-07-09]. Transitive deps (via `hyper`/`reqwest`) mean you can be
  exposed to `h2`/`ring` advisories without depending on them directly.
- A RUSTSEC advisory may be an "unmaintained" or "unsound" flag, not just a CVE —
  `cargo audit` surfaces all three classes.

## Testing Conventions
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn squares() {
        assert_eq!(square(3), 9);
    }

    #[test]
    #[should_panic(expected = "empty")]     // assert the error path, not just happy
    fn rejects_empty() {
        parse("");
    }
}
```
- Run with `cargo test`; `cargo test -- --nocapture` to see stdout. Use
  `#[tokio::test]` for async tests. Integration tests live in `tests/`; doc-tests in
  `///` examples run under `cargo test` too.

## Performance Traps
- **Needless heap allocation**: `Box<T>` / `Vec` / `String` where a stack value or
  `&str`/`&[T]` slice would do. `String::from` / `.to_owned()` in a hot loop is a
  common accidental alloc.
- **`.clone()` as a borrow-checker crutch** (see Ownership above) — refactor the
  ownership instead; each clone is a real copy.
- **Iterator adapters are zero-cost** and usually beat manual index loops; but
  `.collect::<Vec<_>>()` in the middle of a chain materializes needlessly — keep it lazy.
- Build with `--release` for any measurement; `cargo bench` / `criterion` for
  micro-benchmarks. `opt-level`, `lto = true`, and `codegen-units = 1` trade compile
  time for runtime speed.

## References (retrieved 2026-07-09)
- Rust release status (current stable 1.96.1): https://endoflife.date/rust
- Rust 1.85.0 blog (2024 edition stabilized): https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/
- Rust 2024 edition guide: https://doc.rust-lang.org/edition-guide/rust-2024/index.html
- Error handling (The Book): https://doc.rust-lang.org/book/ch09-00-error-handling.html
- thiserror: https://docs.rs/thiserror
- tokio (crates.io, 1.52.3): https://crates.io/crates/tokio
- tokio Mutex (async lock across await): https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html
- tokio shared-state tutorial: https://tokio.rs/tokio/tutorial/shared-state
- RUSTSEC advisory DB: https://rustsec.org/
- RUSTSEC-2025-0009 (ring AES panic): https://rustsec.org/advisories/RUSTSEC-2025-0009.html
- RUSTSEC-2024-0003 (h2 DoS): https://rustsec.org/advisories/RUSTSEC-2024-0003.html
- cargo-audit: https://crates.io/crates/cargo-audit
- miri (UB detection): https://github.com/rust-lang/miri
