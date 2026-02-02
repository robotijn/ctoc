# Rust Legacy Quality Config

Gradual adoption for existing Rust projects.

## Mode: Legacy

- Coverage: 50% minimum
- Clippy with warnings
- Relaxed limits

## Cargo Config (`Cargo.toml`)

```toml
[lints.rust]
unsafe_code = "warn"
unused = "warn"

[lints.clippy]
correctness = { level = "deny", priority = -1 }
suspicious = { level = "warn", priority = -1 }
style = { level = "allow", priority = -1 }
```

## Clippy Config (`clippy.toml`)

```toml
cognitive-complexity-threshold = 25
too-many-arguments-threshold = 8
too-many-lines-threshold = 100
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 25 |
| Arguments | 8 |
| Lines per function | 100 |
