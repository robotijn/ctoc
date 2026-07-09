# Rust Legacy Quality Config

Lenient / migration tier for **existing** Rust codebases adopting quality gates gradually.
Only `correctness` clippy lints deny; `style` is allowed, `unsafe_code` merely warns, and the
coverage floor is a reachable **50%**. Model this on `rust/strict.md` but with every threshold
relaxed so a legacy crate can go green today and tighten over time.

> Verified versions (retrieved 2026-07-09):
> - Rust **1.97.0** (current stable) — https://github.com/rust-lang/rust/releases/tag/1.97.0 (2026-07-09)
> - clippy & rustfmt ship with the toolchain via `rustup component add` — https://doc.rust-lang.org/clippy/installation.html (retrieved 2026-07-09)
> - cargo-llvm-cov **v0.8.7** — https://github.com/taiki-e/cargo-llvm-cov/releases/tag/v0.8.7 (2026-05-13)
> - Rust **2024 edition** is stable since Rust 1.85 — https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/ (2025-02-20)

## Mode: Legacy

- Coverage: **50%** line minimum (a floor a legacy crate can actually hit)
- Clippy: `correctness` denies; `suspicious` warns; `style`/`pedantic` allowed
- `unsafe_code = "warn"` (not `deny`/`forbid`) — flag, don't block, during migration
- Relaxed complexity: cognitive 25 / args 8 / lines 100
- Edition migration is opt-in (`cargo fix --edition`), not forced

## Clippy Config (`clippy.toml`)

Relaxed thresholds so pre-existing large functions don't fail the gate on day one.
Threshold keys: https://doc.rust-lang.org/clippy/lint_configuration.html (retrieved 2026-07-09).

```toml
# clippy.toml — legacy / migration thresholds (loosest correct tier)
cognitive-complexity-threshold = 25
too-many-arguments-threshold   = 8
too-many-lines-threshold       = 100
```

## Cargo Config (`Cargo.toml`)

The `[lints]` tables let a legacy crate deny only the lints that catch real bugs while merely
warning on style and unsafe usage. `[lints]` table reference:
https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section (retrieved 2026-07-09).

```toml
[package]
name    = "legacy-crate"
edition = "2021"        # start on 2021; migrate to "2024" when ready (see Edition Migration)

[lints.rust]
unsafe_code = "warn"    # migration: flag, do not forbid
unused      = "warn"

[lints.clippy]
correctness = { level = "deny",  priority = -1 }   # real bugs still block
suspicious  = { level = "warn",  priority = -1 }
style       = { level = "allow", priority = -1 }   # legacy style tolerated
complexity  = { level = "warn",  priority = -1 }
perf        = { level = "warn",  priority = -1 }
pedantic    = { level = "allow", priority = -1 }
```

## Rustfmt Config (`rustfmt.toml`)

Only stable-channel formatting options so `cargo fmt` runs on the legacy toolchain without
`--nightly`. Options reference: https://rust-lang.github.io/rustfmt/ (retrieved 2026-07-09).

```toml
# rustfmt.toml — legacy-safe, stable-only options
edition        = "2021"
max_width      = 100
hard_tabs      = false
tab_spaces     = 4
newline_style  = "Auto"
use_small_heuristics = "Default"
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines  | 50%       |

Measured with **cargo-llvm-cov** (source-based coverage via LLVM instrumentation). The
`--fail-under-lines` flag gates the build. Flag reference:
https://github.com/taiki-e/cargo-llvm-cov#readme (retrieved 2026-07-09).

```bash
cargo llvm-cov --fail-under-lines 50
```

## Complexity Limits

| Metric               | Limit     |
|----------------------|-----------|
| Cognitive complexity | 25        |
| Arguments            | 8         |
| Lines per function   | 100       |

## Commands

```bash
# Clippy — warn broadly, but only `correctness` denies (per Cargo.toml [lints])
cargo clippy -- -W clippy::all

# Format check (does not rewrite in CI)
cargo fmt --check

# Coverage with the legacy 50% floor
cargo llvm-cov --fail-under-lines 50

# Full legacy gate
cargo clippy -- -W clippy::all && cargo fmt --check && cargo llvm-cov --fail-under-lines 50
```

## Edition Migration

Legacy crates start on `edition = "2021"` and migrate to the stable `2024` edition when
ready. `cargo fix` automates most of the rewrite; bump the manifest afterward.
Edition guide: https://doc.rust-lang.org/edition-guide/editions/transitioning-an-existing-project-to-a-new-edition.html (retrieved 2026-07-09).

```bash
# 1. Apply automated edition fixes on the current edition
cargo fix --edition --allow-dirty
# 2. Then set edition = "2024" in Cargo.toml and rebuild
cargo build
```

## Install

clippy and rustfmt ship with the toolchain; cargo-llvm-cov is a separate cargo install and
needs the `llvm-tools-preview` rustup component.

```bash
# Toolchain components (clippy + rustfmt)
rustup component add clippy rustfmt

# Coverage tool — pinned for reproducibility (v0.8.7 verified 2026-07-09)
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.8.7
```

Install reference: https://doc.rust-lang.org/clippy/installation.html (retrieved 2026-07-09).

## CI Integration (GitHub Actions)

```yaml
name: quality
on: [push, pull_request]

jobs:
  rust-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install toolchain (stable 1.97.0, verified 2026-07-09)
        run: |
          rustup toolchain install stable --profile minimal
          rustup component add clippy rustfmt llvm-tools-preview

      - name: Install cargo-llvm-cov
        run: cargo install cargo-llvm-cov --version 0.8.7

      - name: Clippy (legacy — correctness denies, style allowed)
        run: cargo clippy -- -W clippy::all

      - name: Format check
        run: cargo fmt --check

      - name: Coverage (50% legacy floor)
        run: cargo llvm-cov --fail-under-lines 50
```
