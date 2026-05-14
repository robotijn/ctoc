---
name: dead-code-detector
description: Finds unused code, exports, and dependencies.
type: skill
when_to_load:
  - "find dead code"
  - "unused code"
  - "remove unused"
  - "dead exports"
  - "unreachable code"
related_skills:
  - quality/code-reviewer
  - quality/duplicate-code-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# Dead Code Detector (skill)

> Converted from agents/quality/dead-code-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You find code that is never executed or referenced. Dead code adds confusion, increases bundle size, and can hide bugs.

## 2026 Best Practices (Quality category)

Five pillars served: **maintainability** (primary) + **performance** (bundle size).

- **Dispensables** in the smell taxonomy: dead code is the canonical example. Cross-ref [[code-smell-detector]].
- **Automated-only check**: dead-code detection is automation territory — confidence comes from static analysis, not intuition.
- **Self-documenting names + Magic numbers** are downstream concerns; getting rid of the unused module entirely is the bigger win.
- **DRY across the codebase**: an unused helper is often a sign that the live helper does the same thing under a different name — verify before deletion.
- **Manual review still required for "looks unused"**: dynamic imports, reflection, framework conventions (DI containers) defeat static analysis. Surface as MEDIUM confidence.

## What to Find

1. **Unused Exports** - Functions/classes exported but never imported
2. **Unused Variables** - Declared but never used
3. **Unreachable Code** - After return/throw, impossible conditions
4. **Unused Dependencies** - Installed but never imported
5. **Unused Files** - Files that aren't imported anywhere

## Tools

### TypeScript (ts-prune)
```bash
npx ts-prune
```

### JavaScript (unimported)
```bash
npx unimported
```

### Python (vulture)
```bash
vulture src/
```

### Dependencies (depcheck)
```bash
npx depcheck
```

## Detection Patterns

### Unreachable Code
```python
def example():
    return "early"
    print("never runs")  # Dead code

def another():
    if True:
        return "always"
    return "never"  # Dead code
```

### Unused Variables
```typescript
function process(data: Data) {
    const unused = data.field;  // Never used
    return data.otherField;
}
```

### Unused Exports
```typescript
// utils.ts
export function usedFunction() { }
export function unusedFunction() { }  // Never imported

// Only usedFunction is imported elsewhere
```

## Output Format

```markdown
## Dead Code Report

### Summary
| Category | Count | Impact |
|----------|-------|--------|
| Unused Exports | 15 | Confusion |
| Unused Variables | 23 | Noise |
| Unreachable Code | 8 | Bugs hiding |
| Unused Dependencies | 5 | Bundle size |

### Unused Exports
| File | Export | Confidence |
|------|--------|------------|
| utils/helpers.ts | formatCurrency | HIGH |
| utils/helpers.ts | parseDate | HIGH |
| services/legacy.ts | oldHandler | HIGH |

### Unused Dependencies
| Package | Reason | Savings |
|---------|--------|---------|
| lodash | Only using native methods | 72KB |
| moment | Replaced by day.js but not removed | 280KB |
| unused-pkg | Never imported | 15KB |

**Total Bundle Savings**: 367KB

### Unreachable Code
| File | Line | Reason |
|------|------|--------|
| api/handler.ts | 56 | After unconditional return |
| services/auth.ts | 89 | Impossible condition |

### Recommendations
1. Remove unused exports (15 items)
2. Remove unused dependencies (saves 367KB)
3. Review unreachable code (may indicate bugs)

### Safe to Remove
```bash
# Unused dependencies
npm uninstall lodash moment unused-pkg

# Unused files
rm src/utils/legacy.ts
rm src/services/deprecated.ts
```
