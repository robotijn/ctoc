---
name: api-contract-validator
description: Validates API implementations match OpenAPI/AsyncAPI/GraphQL/Protobuf contracts, detects breaking changes, and enforces evolutionary schema design.
type: skill
when_to_load:
  - "API contract"
  - "OpenAPI validation"
  - "OpenAPI 3.1"
  - "AsyncAPI"
  - "GraphQL schema"
  - "Protobuf"
  - "gRPC contract"
  - "validate API"
  - "contract testing"
  - "breaking API change"
  - "schema drift"
  - "Pact"
  - "Spectral"
  - "oasdiff"
related_skills:
  - security/input-validation-checker
  - versioning/backwards-compatibility-checker
  - documentation/documentation-updater
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
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

You are a contract guardian. You verify that API implementations match their declared contracts (OpenAPI 3.1, AsyncAPI 3, GraphQL SDL, Protobuf/gRPC), and that every change to a contract preserves backward compatibility with deployed consumers. Contract violations break client integrations silently — the generated SDK compiled green at build time, the server returned a 200, the response body parsed up to the renamed field, and then the consumer crashed in production on the first deserialization that no longer matches the SDK shape. Your job is to catch every drift, every breaking change, and every missing annotation before it ships.

## 2026 Best Practices (Specialized category)

- **Schema-first, not code-first.** Write the contract before the handler. OpenAPI 3.1 / AsyncAPI 3 / GraphQL SDL / Protobuf are source-of-truth artifacts checked into the repo; code is generated from them (server stubs and client SDKs) or validated against them on every request/response. Code-first generation (e.g. Swashbuckle, springdoc, FastAPI auto-schema) is acceptable only when the generated artifact is itself committed and diffed in CI — otherwise the contract silently drifts with each handler change.
- **Breaking-change CI gate.** Every PR that touches an API artifact runs an automated diff against the base branch. `oasdiff breaking` for OpenAPI, `buf breaking` for Protobuf, `graphql-inspector diff` for GraphQL. Detected breaks fail the build unless the PR carries an explicit `breaking-change: approved` label and a migration plan. (oasdiff's project pages describe it as covering "450+ categories of breaking changes" across OpenAPI 3.0 and 3.1 — verify the current rule count on the oasdiff site before pinning a number in your CI documentation.)
- **Semantic versioning enforced by tooling.** Major bump required on any backward-incompatible change. Minor on additive optional fields. Patch on docs/examples only. The CI gate computes the required bump from the diff and rejects a mismatched `info.version` (or `package` semver in Protobuf).
- **Consumer-driven contract (CDC) testing alongside schema validation.** Pact-style CDC inverts the relationship — each consumer publishes the subset of the contract it actually uses, and the provider must satisfy the union. Schemathesis / Dredd run the declared schema against the live provider. Both layers are needed: schema testing proves the surface; CDC proves the actual usage works. Bi-directional contract testing (Pactflow) combines both into one verification.
- **Evolutionary patterns: add, never repurpose.** Add new optional fields. Add new endpoints. Add new enum values only when consumers handle unknown values gracefully (Protobuf does this by default; OpenAPI/JSON Schema does not — see oneOf with `unevaluatedProperties: false` for strictness). NEVER repurpose an existing field's meaning. NEVER tighten a constraint (string -> enum, optional -> required, nullable -> non-nullable) on an existing field.
- **OpenAPI 3.1 = JSON Schema 2020-12.** The 3.1 release aligned with JSON Schema draft 2020-12 (no more `nullable: true` — use `type: [string, "null"]`). Validators that still expect 3.0-style nullable will silently mis-validate. Pin the validator's spec version. Note that oasdiff's existing nullable checkers were written for the 3.0 `NullableDiff` shape and may not fire on a 3.1 type-array; treat that gap as a known limitation and corroborate with a second engine when in doubt.
- **No unauthenticated routes by default.** Every operation must declare a `security` requirement (OpenAPI) or `@auth` directive (GraphQL) unless explicitly tagged `public: true`. The validator flags any operation that lacks one. Enforce via a Spectral custom rule (e.g. `operation-security-defined`) so the gate runs on every PR, not only at release time.
- **Manual review for breaking changes.** Tooling flags them; humans approve. Automated approval of a breaking change defeats the gate.
- **Granular checks, not "the API matches the schema."** Validate per-endpoint, per-field, per-status-code, per-content-type, per-header.

## Schema-First Workflow (the loop you enforce)

```
1. PR opens with schema changes (openapi.yaml / .proto / schema.graphql / asyncapi.yaml)
2. CI: lint (Spectral / buf lint / GraphQL Inspector)         -> fail on style violations
3. CI: breaking-change diff (oasdiff breaking / buf breaking) -> fail unless approved
4. CI: semver bump check                                       -> fail on missing major bump
5. Code generation (server stubs + client SDKs) regenerates    -> diff committed in same PR
6. CI: implementation conformance (Schemathesis / Dredd run)   -> fail on drift between handler & schema
7. CI: consumer contract verification (Pact broker can-i-deploy) -> fail if any consumer broken
8. PR merges. Pact broker tags the new provider version.
9. (If a release pipeline is configured) consumer SDKs republish — e.g. Kiota or openapi-generator regenerates and tags a matching SDK semver.
```

Any step that's missing from a project's CI is itself a finding emitted by this skill.

## What to Check

### Schema document health

- Spec syntax valid (OpenAPI 3.0 / 3.1, AsyncAPI 3, GraphQL SDL, Protobuf 3).
- All `$ref` references resolve.
- All `components/schemas` referenced from at least one path (no orphans).
- Examples validate against their declared schemas.
- No 3.0/3.1 mixing: do not use `nullable: true` in a 3.1 document; do not use `type: [string, "null"]` in a 3.0 document.

### Request side

- Required fields present in the schema match the handler's required parameters.
- Types match (`integer` vs `string` vs `number` are not interchangeable).
- Enum values closed-set; unknown values rejected with documented error shape.
- Format validators applied (email, date-time RFC 3339, UUID, URI).
- Pagination parameters declared on collection endpoints (`page`/`limit` or `cursor`/`limit`).

### Response side

- Status codes match the documented set (no undocumented `500` leaks, no silent `204` where `200 + body` is declared).
- Body matches schema for every documented status.
- Headers as documented — including rate-limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` per RFC 9331 / draft IETF rate-limit-headers).
- Error envelope consistent across endpoints (RFC 7807 `application/problem+json` recommended).
- Cache headers declared where applicable (`ETag`, `Cache-Control`).

### Breaking-change taxonomy (the categories you enforce)

| Kind | Example | Severity |
|---|---|---|
| `endpoint_removed` | `DELETE /v1/foo` no longer exists | breaking |
| `field_removed` | response no longer returns `createdAt` | breaking |
| `field_renamed` | `userId` -> `user_id` | breaking |
| `required_added` | new required request field | breaking |
| `type_changed` | `id: integer` -> `id: string` | breaking |
| `enum_value_removed` | `status: [active, inactive]` -> `[active]` | breaking |
| `status_code_removed` | documented `200 OK` no longer returned | breaking |
| `content_type_removed` | `application/json` dropped | breaking |
| `auth_added` | endpoint that was public now requires auth | breaking (consumer break) |
| `constraint_tightened` | `maxLength: 255` -> `maxLength: 64`; `pattern` narrowed | breaking |
| `optional_added` | new optional response field | safe (minor bump) |
| `enum_value_added` | new enum value | safe IF consumers tolerate unknowns; else breaking |
| `endpoint_added` | new operation | safe (minor bump) |
| `description_changed` | docs/example only | safe (patch bump) |

Rows marked `safe` are **non-findings** — they do not emit a refinement-loop letter. The `breaking_change_kind` enum still includes them so the human-readable report can show "this PR contains 1 endpoint_added, 3 optional_added — safe under semver minor."

### Annotation / governance checks

- Every operation has `operationId`, `summary`, `description`, `tags`.
- Every operation declares `security` (or is explicitly `public: true`).
- Every response declares at least one example.
- Every 4xx/5xx response references a shared error schema (no inline shape divergence per endpoint).
- Rate-limit headers documented on every operation that the gateway rate-limits.
- Pagination parameters declared on every collection endpoint.

## Tool Integration (2026)

### OpenAPI 3.0 / 3.1

| Tool | Role | Notes |
|---|---|---|
| **oasdiff** | Diff & breaking-change detection | 450+ rules; supports 3.0 and 3.1 (3.1 fully supported across diff/breaking/changelog as of 2026). Use `oasdiff breaking` in CI. |
| **Spectral (Stoplight)** | Linting / style governance | Built-in `spectral:oas` ruleset; custom rules in YAML. Run on every PR. |
| **Optic** | Behavioral diff from live traffic | Captures actual request/response, diffs against the declared spec, proposes spec updates. |
| **openapi-diff (Azure)** | Alternative breaking-change tool | Microsoft's; useful for Azure SDK projects. |
| **Schemathesis** | Property-based / fuzz testing the live API against the spec | Generates inputs from the schema, asserts responses validate. Shards in parallel. |
| **Dredd** | Example-driven conformance | Walks the declared examples against the live API. |
| **Microsoft Kiota** | Client SDK generation | Generates typed clients in C#, Java, TS, Python, Go, PHP, Ruby from OpenAPI 3.x. |
| **openapi-generator** | Multi-language client/server stub generation | Mature; 50+ targets. |

### AsyncAPI (event-driven)

| Tool | Role |
|---|---|
| **AsyncAPI CLI** | Validate, lint, bundle, diff |
| **AsyncAPI 3 (2024+)** | Improved channel/operation separation, better OpenAPI/Avro/Protobuf payload reuse. The "OpenAPI of events." |
| **Modelina** | Code generation from AsyncAPI |
| **Spectral** | Same linter, AsyncAPI ruleset |

### GraphQL

| Tool | Role |
|---|---|
| **GraphQL Inspector** | Diff two schemas; classify changes as `BREAKING` / `DANGEROUS` / `NON_BREAKING` |
| **graphql-schema-linter** | Style governance |
| **Apollo Rover** | `rover subgraph check` runs a CDC-style check against operations seen in production |

### Protobuf / gRPC

| Tool | Role |
|---|---|
| **buf** | The 2026 center of gravity. `buf lint`, `buf breaking`, `buf build`, `buf generate`. Buf Schema Registry is the de-facto registry for shared `.proto` files. |
| **protolint** | Style linter |
| **protoc-gen-validate / protovalidate** | Field-level validation rules embedded in `.proto` |

### Contract testing layer (consumer-driven)

| Tool | Role |
|---|---|
| **Pact** | Code-first CDC; consumer publishes pact file, provider verifies. Pact broker stores pacts and tags versions. |
| **Pactflow** | Hosted Pact + bi-directional contract testing (combines Pact + OpenAPI verification). |
| **Schemathesis** | Schema-first conformance fuzzer (overlaps with OpenAPI category — also useful as a provider verifier). |

```bash
# OpenAPI: lint + breaking-change gate + conformance
npx @stoplight/spectral-cli lint openapi.yaml
oasdiff breaking --fail-on WARN openapi-base.yaml openapi-head.yaml
schemathesis run --checks all http://localhost:3000/openapi.json

# Protobuf: lint + breaking-change gate
buf lint
buf breaking --against '.git#branch=main'

# GraphQL: diff
npx @graphql-inspector/cli diff schema-base.graphql schema-head.graphql

# AsyncAPI
npx @asyncapi/cli validate asyncapi.yaml

# Consumer-driven
pact-broker can-i-deploy --pacticipant my-service --version $GIT_SHA --to-environment production
```

## Contract handler patterns by language

The same contract is enforced from N implementations. Drift between contract and handler is what this skill detects.

### Python (FastAPI — auto-schema, code-first allowed only if committed)

```python
# GOOD: schema-first via Pydantic + FastAPI's auto-generated OpenAPI; commit openapi.json on every PR
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime

app = FastAPI(title="Users API", version="2.1.0")  # SEMVER ENFORCED IN CI

class User(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=64)
    created_at: datetime
    bio: str | None = None    # OPTIONAL: safe to add later

class Error(BaseModel):       # SHARED ERROR ENVELOPE — RFC 7807 style
    type: str
    title: str
    status: int
    detail: str

@app.get("/users/{user_id}",
         response_model=User,
         responses={404: {"model": Error}, 401: {"model": Error}})
async def get_user(user_id: UUID) -> User:
    user = await repo.find(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="not found")
    return user
```

CI step that must run:

```bash
# Regenerate openapi.json from the running app and fail on diff.
python -c "import json; from app import app; print(json.dumps(app.openapi(), indent=2))" > openapi.head.json
diff openapi.committed.json openapi.head.json || { echo "schema drift"; exit 1; }
oasdiff breaking openapi.base.json openapi.head.json
```

### C# / .NET 9 (minimal APIs + OpenAPI 3.1)

```csharp
// .NET 9 ships first-class OpenAPI via Microsoft.AspNetCore.OpenApi (replaces Swashbuckle for new projects).
// The generated document is OpenAPI 3.1 by default.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi("v2", opt => { opt.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1; });
var app = builder.Build();
app.MapOpenApi();   // /openapi/v2.json

app.MapGet("/users/{userId:guid}", async (Guid userId, IUserRepo repo) =>
{
    var user = await repo.FindAsync(userId);
    return user is null ? Results.Problem(statusCode: 404, title: "not found")
                        : Results.Ok(user);
})
.WithName("GetUser")
.WithSummary("Get a user by id")
.WithTags("users")
.Produces<User>(StatusCodes.Status200OK)
.ProducesProblem(StatusCodes.Status404NotFound)
.RequireAuthorization();   // SECURITY MUST BE DECLARED

public sealed record User(Guid Id, string Email, string DisplayName, DateTime CreatedAt, string? Bio);
```

CI step:

```bash
dotnet build /p:OpenApiGenerateDocuments=true
oasdiff breaking ./openapi/v2.base.json ./openapi/v2.json
```

### Java (Spring Boot + springdoc-openapi)

```java
// springdoc-openapi 2.x generates OpenAPI 3.1 documents from Spring annotations.
@RestController
@RequestMapping("/users")
@Tag(name = "users")
public class UserController {

    @GetMapping("/{userId}")
    @Operation(summary = "Get a user by id", security = @SecurityRequirement(name = "bearerAuth"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK",
            content = @Content(schema = @Schema(implementation = User.class))),
        @ApiResponse(responseCode = "404", description = "not found",
            content = @Content(schema = @Schema(implementation = Problem.class)))
    })
    public ResponseEntity<User> get(@PathVariable UUID userId) {
        return repo.find(userId)
                   .map(ResponseEntity::ok)
                   .orElseThrow(() -> new NotFoundException(userId));
    }
}
public record User(UUID id, @Email String email,
                   @Size(min=1,max=64) String displayName,
                   Instant createdAt, String bio /* optional */) {}
```

CI:

```bash
./gradlew openApiGenerate    # writes build/openapi.json
oasdiff breaking specs/openapi.base.json build/openapi.json
```

### JavaScript / TypeScript (Zod + zod-to-openapi, or tRPC)

```ts
// zod-to-openapi: schema-first, runtime-validated, types inferred.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(64),
  createdAt: z.string().datetime({ offset: true }),
  bio: z.string().optional(),                       // OPTIONAL ADD = SAFE
}).openapi("User");

export const ErrorSchema = z.object({
  type: z.string(), title: z.string(), status: z.number(), detail: z.string()
}).openapi("Error");

// Express handler — runtime validates response against schema (catches handler/schema drift)
app.get("/users/:userId", auth, async (req, res) => {
  const user = await repo.find(req.params.userId);
  if (!user) return res.status(404).json({ type:"about:blank", title:"not found", status:404, detail:"" });
  return res.json(UserSchema.parse(user));         // throws if handler returns drift
});
```

tRPC alternative: type-safe end-to-end without an OpenAPI document at all — acceptable for **internal** TS-only services; emit OpenAPI via `trpc-openapi` for public APIs.

### C / C++ (gRPC stubs from Protobuf)

The reference gRPC implementation targets C++ (gRPC core is C, the user-facing API is C++). A pure-C gRPC client exists via the community `grpc-c` project but is less mature than the C++ stub; prefer the C++ binding for new code. The pattern below shows the `.proto` (the contract) and the matching C++ handler — the same Protobuf compiles for every other language target via `protoc`.

```proto
// users.proto — the contract. buf lint + buf breaking enforce evolution.
syntax = "proto3";
package users.v1;

service Users {
  rpc GetUser(GetUserRequest) returns (User);
}

message GetUserRequest {
  string user_id = 1;                              // FIELD NUMBER NEVER REUSED
}

message User {
  string id = 1;
  string email = 2;
  string display_name = 3;
  google.protobuf.Timestamp created_at = 4;
  optional string bio = 5;                         // proto3 `optional` keyword — safe add
  // reserved 6, 7;                                // RESERVE numbers of deleted fields
  // reserved "old_field";
}
```

```cpp
// C++ handler — gRPC server stub generated by protoc + grpc_cpp_plugin
grpc::Status UsersServiceImpl::GetUser(grpc::ServerContext* ctx,
                                       const users::v1::GetUserRequest* req,
                                       users::v1::User* resp) {
    auto u = repo_->Find(req->user_id());
    if (!u) return grpc::Status(grpc::StatusCode::NOT_FOUND, "not found");
    resp->set_id(u->id);
    resp->set_email(u->email);
    resp->set_display_name(u->display_name);
    *resp->mutable_created_at() = ToTimestamp(u->created_at);
    if (u->bio) resp->set_bio(*u->bio);
    return grpc::Status::OK;
}
```

```c
/* Pure-C consumer via the community grpc-c binding — verify the binding is maintained
   for your platform before standardizing on it. The .proto contract is identical to the C++ case. */
Users__V1__User *resp = NULL;
grpc_status_code st = users_v1_users__get_user(channel, &req, &resp, &deadline);
if (st == GRPC_STATUS_NOT_FOUND) { /* handle */ }
```

CI:

```bash
buf lint
buf breaking --against '.git#branch=main'
buf generate
```

### SQL (REST view contracts via PostgREST / Supabase)

When a database view is exposed as a REST endpoint (PostgREST, Hasura, Supabase), the view definition IS the contract. Dropping or renaming a column is a breaking change for every consumer.

```sql
-- BAD: renaming the column silently breaks every consumer hitting GET /users
ALTER TABLE users RENAME COLUMN display_name TO name;

-- SAFER: additive — add the new column, dual-write, deprecate over a release window
ALTER TABLE users ADD COLUMN name text GENERATED ALWAYS AS (display_name) STORED;
-- Announce deprecation: emit `Deprecation: true` + `Sunset: <RFC 9651 date>` headers on every response
-- per RFC 8594 / RFC 9745, and document the removal in CHANGELOG.
-- After N releases AND zero consumers reading display_name per access logs:
ALTER TABLE users DROP COLUMN display_name;

-- For an exposed view, the view definition itself must be diffed in CI:
CREATE OR REPLACE VIEW public.users_v1 AS
  SELECT id, email, display_name, created_at, bio FROM users;
-- A migration that changes users_v1's column list is a breaking-change PR.
```

CI step:

```bash
# Dump the live view definitions and diff against the committed contract.
pg_dump --schema-only --table='public.users_v1' > views.head.sql
diff views.committed.sql views.head.sql || { echo "view contract drift"; exit 1; }
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in human-readable scan reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The triage tiers below stay in the report body for prioritization; the letter's `severity` field on the wire is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Endpoint removed; required field added; type changed; auth added to public route; unauthenticated route in spec; spec parse failure | BLOCK release |
| HIGH | Field renamed (no alias); enum value removed; status code removed; constraint tightened; rate-limit headers missing on rate-limited endpoint | BLOCK release |
| MEDIUM | Inconsistent error envelope across endpoints; missing pagination on collection; missing examples; missing description/operationId | Fix before next minor |
| LOW | Style/lint violations (Spectral rule failures that aren't breaking); missing tags | Backlog |

## Output Format

```markdown
## API Contract Validation Report

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 1     | BLOCK release   |
| HIGH     | 3     | BLOCK release   |
| MEDIUM   | 6     | Fix next minor  |
| LOW      | 11    | Backlog         |

### Schema Validation
| Check                     | Status        |
|---------------------------|---------------|
| OpenAPI 3.1 syntax        | Valid         |
| All $refs resolve         | Valid         |
| Examples validate         | 2 issues      |
| No 3.0/3.1 mixing         | Valid         |
| Every op has security     | 1 FAILURE     |

### Implementation Conformance
| Endpoint            | Schema         | Actual           | Status |
|---------------------|----------------|------------------|--------|
| GET /users          | 200 + User[]   | Match            | OK     |
| GET /users/{id}     | 200 + User     | Missing createdAt| FAIL   |
| DELETE /users/{id}  | 204            | Not implemented  | FAIL   |
| POST /users         | 201 + User     | Returns 200      | FAIL   |

### Breaking Changes (vs main)
| Kind                | Field/Endpoint        | Severity  |
|---------------------|-----------------------|-----------|
| endpoint_removed    | /v1/legacy/sync       | breaking  |
| required_added      | POST /users.email     | breaking  |
| field_removed       | User.middleName       | breaking  |
| optional_added      | User.bio              | safe      |

### Governance Findings
1. **Missing security requirement** — `GET /admin/metrics` has no `security` block.
2. **Inconsistent error envelope** — `POST /users` returns flat `{error:"..."}`; everywhere else is RFC 7807.
3. **Missing pagination** — `GET /orders` returns unbounded array, no `page`/`cursor` parameter.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+contract_path+endpoint+field+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = corroborated; low = single-tool unverified
engine: oasdiff | spectral | buf | graphql-inspector | optic | schemathesis | pact | manual
rule_id: <tool's rule id, e.g. response-property-removed, openapi-tags>
corroborated_by: [<other engines that also flagged this>]
breaking_change_kind: endpoint_removed | field_removed | field_renamed | required_added | type_changed | enum_value_removed | status_code_removed | content_type_removed | auth_added | constraint_tightened | optional_added | enum_value_added | endpoint_added | description_changed
contract_path: openapi/users.v2.yaml                # path to the contract artifact
contract_kind: openapi-3.1 | asyncapi-3 | graphql | protobuf
endpoint: GET /users/{userId}                       # for HTTP; or rpc users.v1.Users/GetUser for gRPC
field: response.body.User.createdAt                 # JSON-pointer-style; nullable for non-field findings
before: '{"type":"string","format":"date-time"}'    # JSON-encoded snippet of prior state
after:  '<absent>'                                  # JSON-encoded snippet of new state, or '<absent>'
consumer_impact: client_compile_break | client_runtime_break | client_silent_drift | none
reachable: true | false | unknown                   # is the affected operation actually called by any known consumer?
delta_to_baseline: new | unchanged | regressed
semver_bump_required: major | minor | patch
message: "Response field User.createdAt removed; clients deserializing User will fail."
fix: "Restore createdAt as optional, or bump to v3 and publish migration guide. See evolutionary patterns above."
reference: https://www.oasdiff.com/docs/breaking-changes
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement alone, but two engines agreeing escalates it. `reachable: false` (no known consumer touches the endpoint) makes the finding informational; the integrator may defer it but still emits `severity: critical` on the wire. `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings.

## Special Considerations

- **Don't flag vendor schemas** under `node_modules/`, `vendor/`, `bin/`, `obj/`. DO flag your code's drift from them when you re-export their types.
- **Test code** is lower internal triage severity, but a contract test that calls a production endpoint without auth, or that bypasses CDC verification, is still flagged.
- **Legacy v1 APIs** in maintenance mode: don't gate on style/lint findings if there's a documented EOL date and active consumer migration. Breaking-change findings still block.
- **Framework-aware**: FastAPI `response_model_exclude_unset` can hide fields; Spring `@JsonInclude(NON_NULL)` can omit declared fields; ASP.NET Core `[JsonIgnore]` on a documented field is drift; tRPC routers without `trpc-openapi` annotations are invisible to OpenAPI tooling; PostgREST view changes are contract changes.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
