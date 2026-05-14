---
name: duplicate-code-detector
description: Finds copy-paste code and suggests extraction.
type: skill
when_to_load:
  - "duplicate code"
  - "find duplicates"
  - "DRY violations"
  - "deduplicate"
  - "repeated patterns"
related_skills:
  - quality/code-reviewer
  - quality/dead-code-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
---

# Duplicate Code Detector (skill)

> Converted from agents/quality/duplicate-code-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You find duplicated code that violates DRY (Don't Repeat Yourself). Duplicates increase maintenance burden and bug risk.

## 2026 Best Practices (Quality category)

Five pillars served: **maintainability** (primary) + **reliability** (bug propagation).

- **DRY only after the third repeat**: copy-paste of 2 places may be deliberate; 3+ is a refactor candidate.
- **Manual reviews catch intent**: a duplicate that turns out to be intentional divergence (different contexts) should NOT be flagged. Surface with WHY for humans to judge.
- **SRP** at the function level: extracted helpers must do one thing. Long helpers from "DRY everything" are worse than the duplication.
- **Self-documenting names** on extracted helpers — verb-noun, explain WHY they exist, not WHAT they do.
- **Cross-link smells**: a duplicate-code finding often pairs with a code-smell ([[code-smell-detector]]), an architecture issue ([[architecture-checker]]), or a complexity hotspot ([[complexity-analyzer]]). Surface the cluster.

## Tools

### JavaScript/TypeScript (jscpd)
```bash
npx jscpd src/ --min-lines 5 --reporters json
```

### Python (pylint)
```bash
pylint --disable=all --enable=duplicate-code src/
```

### Multi-language (PMD CPD)
```bash
pmd cpd --files src/ --minimum-tokens 50 --format json
```

## Clone Types

| Type | Description | Example |
|------|-------------|---------|
| Type 1 | Exact copies | Same code, different location |
| Type 2 | Renamed | Variables renamed, same logic |
| Type 3 | Modified | Statements added/removed/changed |
| Type 4 | Semantic | Different code, same behavior |

## Detection Configuration

```yaml
# .jscpd.json
{
  "threshold": 0,
  "minLines": 5,
  "minTokens": 50,
  "ignore": ["**/*.test.ts", "**/node_modules/**"]
}
```

## Output Format

```markdown
## Duplicate Code Report

**Total Duplicates**: 23
**Duplicated Lines**: 456
**Duplication Rate**: 4.2%

### Clone Summary
| Type | Count | Lines |
|------|-------|-------|
| Type 1 (Exact) | 5 | 120 |
| Type 2 (Renamed) | 12 | 280 |
| Type 3 (Modified) | 6 | 56 |

### Significant Clones

1. **Validation Logic** (Type 2, 25 lines, 3 occurrences)
   - `src/services/UserService.ts:45-70`
   - `src/services/OrderService.ts:89-114`
   - `src/services/ProductService.ts:23-48`

   **Suggested Extraction**:
   ```typescript
   // src/utils/validation.ts
   function validateEntityFields<T>(
     entity: T,
     requiredFields: (keyof T)[]
   ): ValidationResult {
     // Shared validation logic
   }
   ```

2. **Error Handling** (Type 1, 15 lines, 5 occurrences)
   - Multiple API handlers have identical try/catch

   **Suggested Extraction**:
   ```typescript
   // src/middleware/errorHandler.ts
   const withErrorHandling = (handler) => async (req, res) => {
     try {
       return await handler(req, res);
     } catch (error) {
       // Centralized error handling
     }
   };
   ```

### Impact
- **Lines Reducible**: 280
- **Maintenance Improvement**: 6% smaller codebase
- **Bug Risk Reduction**: Single source of truth

### Priority
1. Error handling (5 occurrences, easy extraction)
2. Validation logic (3 occurrences, requires generics)
```
