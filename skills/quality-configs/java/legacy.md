# Java Legacy Quality Config

Gradual adoption for existing Java projects.

## Mode: Legacy

- Coverage: 50% minimum
- Warnings allowed
- Relaxed limits

## Checkstyle Severity

```xml
<property name="severity" value="warning"/>
```

## Relaxed Limits

```xml
<module name="CyclomaticComplexity">
    <property name="max" value="15"/>
</module>
<module name="MethodLength">
    <property name="max" value="100"/>
</module>
<module name="ParameterNumber">
    <property name="max" value="6"/>
</module>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Method length | 100 lines |
| File length | 600 lines |
| Parameters | 6 |
