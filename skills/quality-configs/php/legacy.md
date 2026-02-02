# PHP Legacy Quality Config

Gradual adoption for existing PHP projects.

## Mode: Legacy

- Coverage: 50% minimum
- PHPStan level 5
- Basic rules only

## PHPStan Config

```neon
parameters:
    level: 5
    paths:
        - src
    reportUnmatchedIgnoredErrors: false
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 20 |
| Cyclomatic | 15 |
