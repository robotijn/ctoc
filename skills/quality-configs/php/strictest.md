# PHP Strictest Quality Config

Maximum strictness for PHP projects.

## Mode: Strictest

- Coverage: 90% minimum
- PHPStan level 9 (max)
- All rules enabled

## PHPStan Config

```neon
parameters:
    level: 9  # Maximum
    paths:
        - src
    treatPhpDocTypesAsCertain: false
    checkMissingIterableValueType: true
    checkGenericClassInNonGenericObjectType: true
    checkInternalClassCaseSensitivity: true
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 10 |
| Cyclomatic | 7 |
