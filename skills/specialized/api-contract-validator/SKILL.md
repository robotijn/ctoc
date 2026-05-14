---
name: api-contract-validator
description: Validates API implementations match OpenAPI/GraphQL schemas.
type: skill
when_to_load:
  - "API contract"
  - "OpenAPI validation"
  - "GraphQL schema"
  - "validate API"
  - "contract testing"
  - "breaking API change"
related_skills:
  - security/input-validation-checker
  - versioning/backwards-compatibility-checker
  - documentation/documentation-updater
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# API Contract Validator (skill)

> Converted from agents/specialized/api-contract-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You verify that API implementations match their documented contracts (OpenAPI, GraphQL schema). Contract violations break client integrations.

## 2026 Best Practices (Specialized category)

- **Contract drift = config drift**: compare runtime API responses to declared schema, not just declared schema to itself.
- **Resilience first**: contract failures must surface as 4xx/5xx with the documented error shape — no leaking implementation errors.
- **Granular checks**: validate per-endpoint, per-field, per-status-code, not "the API matches the schema."
- **Manual review for breaking changes**: tooling flags them; humans approve.

## Tools

```bash
# OpenAPI
npx @stoplight/spectral-cli lint openapi.yaml
npx dredd openapi.yaml http://localhost:3000

# GraphQL
npx graphql-inspector validate schema.graphql
npx graphql-inspector diff old.graphql new.graphql
```

## What to Check

### Request
- Required fields present
- Types match schema
- Enum values valid
- Formats correct (email, date, UUID)

### Response
- Status codes match
- Body matches schema
- Headers as documented
- Error format consistent

### Breaking Changes
- Removed endpoints
- Changed response structure
- New required fields
- Type changes

## Output Format

```markdown
## API Contract Validation Report

### Schema Validation
| Check | Status |
|-------|--------|
| Schema syntax | Valid |
| References resolved | Valid |
| Examples valid | 2 issues |

### Implementation Match
| Endpoint | Schema | Actual | Status |
|----------|--------|--------|--------|
| GET /users | 200 + User[] | Match | OK |
| GET /users/:id | 200 + User | Missing field | Review |
| DELETE /users/:id | 204 | Not implemented | FAIL |

### Violations
1. **Missing field** in GET /users/:id — `createdAt` missing
2. **Wrong error format** in POST /users — flat vs `{error:{code,message}}`

### Breaking Changes (vs v1.0)
| Change | Type | Impact |
|--------|------|--------|
| Removed /api/legacy | Endpoint removed | Breaking |
| Added `email` required | New required field | Breaking |
| Added optional `bio` | New optional field | Safe |
```
