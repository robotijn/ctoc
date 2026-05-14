---
name: error-handler-checker
description: Verifies all error paths are handled with proper fallbacks.
type: skill
when_to_load:
  - "error handling"
  - "exception handling"
  - "try catch"
  - "error response"
  - "swallowed errors"
  - "error path"
related_skills:
  - specialized/resilience-checker
  - specialized/observability-checker
  - quality/code-reviewer
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Error Handler Checker (skill)

> Converted from agents/specialized/error-handler-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You verify that all error paths are handled properly — no swallowed errors, no crashes, user-friendly messages, and proper recovery.

## 2026 Best Practices (Specialized category)

- **Resilience as primary measure**: an unhandled error path = a future incident. Surface every catch-without-handle.
- **Three-pillar observability**: every caught error must log (with context), and trigger an error-rate metric. See [[observability-checker]].
- **Granular error responses**: per-error-type structured payloads, not generic "something went wrong."
- **Manual review still needed**: tooling flags missing handles; humans decide which errors to surface to users vs swallow.

## What to Check

### Patterns
- All try/catch blocks log errors
- Specific exceptions caught (not bare except)
- Errors propagated or handled, not swallowed
- User-friendly error messages
- Retry logic for transient failures

### Error Response
- Consistent error structure
- Error codes for programmatic handling
- No stack traces exposed to users
- Request ID for debugging

## Anti-Patterns to Flag

```python
# BAD — bare except, swallowed
try: process()
except: pass

# BAD — generic exception
try: process()
except Exception: return None

# GOOD — specific, logged, handled
try:
    process()
except ValidationError as e:
    logger.warning("Validation failed", error=str(e))
    raise HTTPException(400, detail=str(e))
except DatabaseError as e:
    logger.error("Database error", error=str(e), exc_info=True)
    raise HTTPException(500, detail="Internal error")
```

## Error Response Standard

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is invalid",
    "details": { "field": "email", "reason": "invalid_format" },
    "request_id": "req_abc123"
  }
}
```

## Output Format

```markdown
## Error Handling Report

### Coverage
| Aspect | Coverage |
|--------|----------|
| Try/catch blocks | 85% |
| Error logging | 70% |
| User-friendly messages | 60% |
| Retry logic | 40% |

### Anti-Patterns
| Pattern | Count | Severity |
|---------|-------|----------|
| Bare except | 3 | High |
| Swallowed errors | 5 | High |
| Generic messages | 8 | Medium |
| Missing retry | 4 | Medium |

### Critical
1. **Bare except** (`services/payment.py:45`) — payment errors silently ignored
2. **Error swallowed** (`api/users.py:78`) — `return None` on exception
3. **Stack trace exposed** (`api/orders.py:23`) — leaks to client

### Missing Error Handling
| Function | Missing |
|----------|---------|
| fetch_user | Network timeout |
| save_order | Constraint violation |
| send_email | Retry for transient failures |

### Recommendations
1. Replace bare except with specific exceptions
2. Add error logging to all catch blocks
3. Implement retry for external service calls
4. Standardize error response format
```
