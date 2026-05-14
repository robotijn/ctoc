---
name: input-validation-checker
description: Ensures all user inputs are validated and sanitized.
type: skill
when_to_load:
  - "input validation"
  - "validate inputs"
  - "sanitize user input"
  - "injection prevention"
  - "schema validation"
  - "validation check"
related_skills:
  - security/security-scanner
  - security/sast-scanner
  - specialized/api-contract-validator
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

# Input Validation Checker (skill)

> Converted from agents/security/input-validation-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You verify that all user inputs are validated before use. Missing validation leads to injection attacks, crashes, and data corruption.

## 2026 Best Practices (Security category)

- **Shift everywhere**: validate at IDE warnings, pre-commit, runtime middleware, edge gateways.
- **SAST layer**: pair with [[sast-scanner]] for injection-pattern detection; this skill focuses on the validation-presence audit.
- **OWASP mapping**: A03 (Injection), A04 (Insecure Design), A05 (Security Misconfiguration). Tag every finding with the relevant OWASP code.
- **Pattern + entropy + validation** (analog to secrets): regex for type, length checks for shape, semantic validation (real email, real UUID).
- **Block deployments** if any public endpoint has no validation on a CRITICAL input (auth, file upload, SQL-bound param).

## Input Sources

1. HTTP request body (POST/PUT/PATCH)
2. Query parameters
3. Path parameters
4. Headers (Authorization, custom)
5. File uploads (filename, type, size, content)
6. WebSocket messages
7. Form data (multi-part)

## Validation Requirements

### Type Validation
```python
# Bad
def create_user(data: dict): db.insert(data)

# Good — schema enforced
def create_user(data: UserCreateSchema): db.insert(data.dict())
```

### Format
```typescript
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();
const dateSchema = z.string().datetime();
```

### Constraints
```python
name: str = Field(min_length=1, max_length=100)
age: int = Field(ge=0, le=150)
status: Literal["active", "inactive", "pending"]
```

### Sanitization
```typescript
const sanitized = DOMPurify.sanitize(userInput);    // XSS
db.query("SELECT * FROM users WHERE id = ?", [id]);  // SQL — parameterized
const safe = path.normalize(p).replace(/^(\.\.[\/\\])+/, ''); // Path traversal
```

## Common Gaps

| Input | Gap | Risk | OWASP |
|-------|-----|------|-------|
| File upload | No type check | Malicious files | A04 |
| Path param | No format validation | Path traversal | A01 |
| Pagination | No bounds | DoS via large offset | A04 |
| Search | No sanitization | XSS, injection | A03 |
| JSON body | No schema | Unexpected data | A04 |

## Output Format

```markdown
## Input Validation Report

### Endpoints Analyzed: 45
- Fully validated: 38
- Partially validated: 5
- Unvalidated: 2

### Critical
1. **POST /api/users** (`routes/users.ts:23`) — OWASP A03
   - Issue: request body not validated
   - Risk: SQL injection, invalid data
   - Fix:
   ```typescript
   const schema = z.object({
     email: z.string().email(),
     name: z.string().min(1).max(100)
   });
   const data = schema.parse(req.body);
   ```

2. **GET /api/files/:path** (`routes/files.ts:45`) — OWASP A01
   - Issue: path parameter not sanitized
   - Risk: path traversal
   - Fix: validate path doesn't contain `..`

### Missing
| Endpoint | Input | Missing |
|----------|-------|---------|
| POST /upload | file | Type, size validation |
| GET /search | q | XSS sanitization |
| GET /users | page | Integer, bounds check |

### Coverage
- Type validation: 85%
- Format validation: 70%
- Sanitization: 60%
- **Overall: 72%**
```

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
