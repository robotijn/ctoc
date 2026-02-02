# Rust Strictest Quality Config

Maximum strictness for Rust projects.

## Mode: Strictest

- Coverage: 90% minimum
- Clippy pedantic enabled
- No unsafe code

## Cargo Config (`Cargo.toml`)

```toml
[lints.rust]
unsafe_code = "forbid"
missing_docs = "deny"
unused = "deny"

[lints.clippy]
# Enable all categories as deny
correctness = { level = "deny", priority = -1 }
suspicious = { level = "deny", priority = -1 }
style = { level = "deny", priority = -1 }
perf = { level = "deny", priority = -1 }
complexity = { level = "deny", priority = -1 }
pedantic = { level = "deny", priority = -1 }

# Strictest rules
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "forbid"
unimplemented = "forbid"
dbg_macro = "forbid"
print_stdout = "forbid"
print_stderr = "forbid"

# Complexity (tighter limits)
cognitive_complexity = "deny"
too_many_arguments = "deny"
too_many_lines = "deny"
```

## Clippy Config (`clippy.toml`)

```toml
cognitive-complexity-threshold = 10
too-many-arguments-threshold = 3
too-many-lines-threshold = 30
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 10 |
| Arguments | 3 |
| Lines per function | 30 |

## Commands

```bash
cargo clippy -- -D warnings -D clippy::pedantic && cargo tarpaulin --fail-under 90
```
