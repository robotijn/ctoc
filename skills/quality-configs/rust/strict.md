# Rust Strict Quality Config

Strict mode configuration for Rust projects with Clippy.

## Mode: Strict

- Coverage: 80% minimum
- Clippy warnings as errors
- All standard lints enabled

## Clippy Config (`clippy.toml`)

```toml
# Clippy configuration for strict mode
cognitive-complexity-threshold = 15
too-many-arguments-threshold = 4
too-many-lines-threshold = 50
```

## Cargo Config (`Cargo.toml`)

```toml
[lints.rust]
unsafe_code = "forbid"
missing_docs = "warn"
unused = "deny"

[lints.clippy]
# Correctness
correctness = { level = "deny", priority = -1 }
# Suspicious patterns
suspicious = { level = "warn", priority = -1 }
# Style
style = { level = "warn", priority = -1 }
# Performance
perf = { level = "warn", priority = -1 }
# Complexity
complexity = { level = "warn", priority = -1 }
# Pedantic (enable individually)
pedantic = { level = "allow", priority = -1 }

# Specific strict rules
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
unimplemented = "warn"
dbg_macro = "warn"
print_stdout = "warn"
print_stderr = "warn"

# Complexity
cognitive_complexity = "warn"
too_many_arguments = "warn"
too_many_lines = "warn"
```

## Rustfmt Config (`rustfmt.toml`)

```toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Auto"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
remove_nested_parens = true
edition = "2021"
merge_derives = true
use_try_shorthand = true
use_field_init_shorthand = true
force_explicit_abi = true
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 15 |
| Arguments | 4 |
| Lines per function | 50 |

## Commands

```bash
# Run clippy
cargo clippy -- -D warnings

# Run tests with coverage
cargo tarpaulin --out Html --fail-under 80

# Format check
cargo fmt -- --check

# All quality checks
cargo clippy -- -D warnings && cargo fmt -- --check && cargo tarpaulin --fail-under 80
```

## Install

```bash
rustup component add clippy rustfmt
cargo install cargo-tarpaulin
```
