---
name: api-deprecation-checker
description: Detects usage of deprecated APIs, libraries, and language features so teams can plan migrations.
type: skill
when_to_load:
  - "API deprecation"
  - "deprecation check"
  - "breaking change schedule"
  - "deprecated api"
  - "deprecated library"
  - "deprecation audit"
  - "sunset header"
  - "RFC 8594"
  - "OpenAPI deprecated"
  - "version sunset"
related_skills:
  - devex/onboarding-validator
  - versioning/backwards-compatibility-checker
  - versioning/technical-debt-tracker
  - security/dependency-auditor
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# API Deprecation Checker (skill)

> Converted from agents/devex/api-deprecation-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You audit the **deprecation cycle hygiene** of an API surface: are deprecations announced via the standard wire-format headers, do they carry a concrete sunset date, is there a migration guide, and are consumers being tracked off the old version before it goes dark?

This skill is paired with — and explicitly distinct from — [[backwards-compatibility-checker]]. That skill catches **breaking changes** (the API contract changed in an incompatible way). This skill catches **deprecation cycle bugs** (the change is announced, but the announcement is malformed, the window is too short, the migration path is missing, or the sunset has passed and the endpoint is still live).

## 2026 Best Practices (DevEx category)

The 2026 deprecation playbook is built on two RFCs and one OpenAPI convention:

- **RFC 8594 — `Sunset` header is mandatory on every deprecated endpoint**. The value is an HTTP-date indicating when the URI will stop responding. Without it, "deprecated" is a vibe, not a contract. After the sunset date, return **`410 Gone`** — not `404` — so confused clients see the difference between "wrong URL" and "this URL is intentionally retired." RFC 8594 also defines a `sunset` link relation type — pair `Sunset:` with a `Link: <…>; rel="sunset"` pointing to the deprecation/sunset policy page.
- **RFC 9745 — the `Deprecation` HTTP response header field** (formerly an IETF draft, now an RFC) carries the deprecation timestamp itself as an HTTP-date. Use `Deprecation` to say *"this is deprecated as of X"* and `Sunset` to say *"it will stop working on Y"*. Pair both with `Link: <migration-guide-url>; rel="deprecation"` (per RFC 9745) and `Link: <successor-url>; rel="successor-version"`.
- **OpenAPI `deprecated: true` on every retiring operation**, plus the proposed-in-3.3 / widely-used-by-convention `x-sunset` extension carrying the same date as the `Sunset` header. Tools like `oasdiff` and `openapi-generator` read these to produce migration reports.

Operationally that gives:

- **Parallel `/v1` + `/v2` during the entire deprecation window**: never break callers without at least one major version of overlap. Route by URL path (`/v1/...`, `/v2/...`) or `Accept-Version` header — pick one strategy and stick to it.
- **Minimum 6-month deprecation window for endpoints serving major customers / public APIs**. Shorter windows are acceptable only for internal services, pre-1.0 APIs, or security-driven removals (and even then, document the exception in the plan's `## Decisions Taken Under Ambiguity` section).
- **Consumer-migration tracking via usage telemetry**: count requests per deprecated endpoint over a rolling 30-day window, broken down by client (API key, user-agent, OAuth client_id). Don't sunset until top-N consumers have migrated to zero traffic for two consecutive 30-day windows, or have been individually contacted with an extension. "We sent an email three months ago" is not tracking.
- **Codemods where the migration is mechanical**: jscodeshift, lib2to3, `pyupgrade`, Roslyn analyzers with code-fix providers, Spring Boot `OpenRewrite` recipes. A skill that ships codemods migrates 10× faster than one that ships a doc.
- **Cross-link with [[backwards-compatibility-checker]]**: removed-this-version + still-used = build break; that's their territory. Missing `Sunset` header on a deprecated endpoint = our territory.

## Deprecation Cycle Categories (what this skill flags)

These are the five non-negotiable cycle defects. Every finding maps to one.

| # | Category | Why it bites |
|---|---|---|
| 1 | **Deprecated without `Sunset` header** | Clients have no deadline; they procrastinate forever. |
| 2 | **Removed without a deprecation period** | Build break for every existing caller — backwards-compat failure with no on-ramp. |
| 3 | **Deprecated but no migration guide link** | `Deprecation: true` and nothing else. Consumer reads the header, asks "now what?", and ignores it. |
| 4 | **Sunset date past, endpoint still live** | Worst of both worlds: header lied, callers who trusted the deadline are now confused, and the dead-code path is still a security surface. |
| 5 | **Missing version-in-URL (or `Accept-Version`) strategy** | No way to ship `/v2` next to `/v1`. Every breaking change becomes a flag day. |

## Per-language detection (BAD / SAFE)

### C# / .NET 9 — `[Obsolete]` + ASP.NET `Sunset` header

```csharp
// BAD: no deprecation metadata, no Sunset header, no migration path
[HttpGet("/api/v1/users")]
public IActionResult ListUsersV1() => Ok(_db.Users.ToList());

// BAD: marked obsolete but emits nothing on the wire
[Obsolete]
[HttpGet("/api/v1/users")]
public IActionResult ListUsersV1Obsolete() => Ok(_db.Users.ToList());

// SAFE: typed deprecation + wire-format headers + parallel v2
[Obsolete("Use /api/v2/users. Sunset 2026-12-31.", error: false, DiagnosticId = "API0001", UrlFormat = "https://docs.example.com/migrations/users-v2")]
[HttpGet("/api/v1/users")]
public IActionResult ListUsersV1(HttpResponse resp)
{
    resp.Headers.Append("Deprecation", "Wed, 15 Jan 2026 00:00:00 GMT");           // RFC 9745
    resp.Headers.Append("Sunset",      "Thu, 31 Dec 2026 00:00:00 GMT");           // RFC 8594
    resp.Headers.Append("Link",        "<https://docs.example.com/migrations/users-v2>; rel=\"deprecation\"");
    resp.Headers.Append("Link",        "<https://api.example.com/v2/users>; rel=\"successor-version\"");
    resp.Headers.Append("Link",        "<https://docs.example.com/sunset-policy>; rel=\"sunset\"");   // RFC 8594 link relation
    return Ok(_db.Users.ToList());
}

[HttpGet("/api/v2/users")]
public IActionResult ListUsersV2() => Ok(_db.Users.Select(UserDtoV2.From).ToList());
```

ASP.NET Core 8+ middleware can hoist the headers project-wide so individual handlers don't drift; pair with `Asp.Versioning` (formerly `Microsoft.AspNetCore.Mvc.Versioning`) which already exposes `ApiVersion("1.0", Deprecated = true)`.

### Java 21+ — `@Deprecated(since, forRemoval)` + Spring Boot `Sunset`

```java
// BAD: bare @Deprecated, no since, no forRemoval, no wire signal
@Deprecated
@GetMapping("/api/v1/orders")
public List<Order> listOrdersV1() { return repo.findAll(); }

// SAFE: typed deprecation + Spring filter adds Sunset/Deprecation/Link
@Deprecated(since = "1.8", forRemoval = true)
@GetMapping("/api/v1/orders")
public ResponseEntity<List<Order>> listOrdersV1() {
    return ResponseEntity.ok()
        .header("Deprecation", "Wed, 15 Jan 2026 00:00:00 GMT")
        .header("Sunset",      "Thu, 31 Dec 2026 00:00:00 GMT")
        .header("Link",        "<https://docs.example.com/migrations/orders-v2>; rel=\"deprecation\"")
        .header("Link",        "</api/v2/orders>; rel=\"successor-version\"")
        .body(repo.findAll());
}

@GetMapping("/api/v2/orders")
public List<OrderV2> listOrdersV2() { return repo.findAll().stream().map(OrderV2::from).toList(); }
```

For a project-wide implementation use a `OncePerRequestFilter` keyed on the `@Deprecated` annotation, or use the Zalando `problem-spring-web` deprecation helpers.

### Python 3.12+ — PEP 702 `typing.deprecated` + FastAPI `deprecated=True`

```python
# BAD: bare warnings, route not flagged in the OpenAPI doc
import warnings
@app.get("/v1/items")
def list_items_v1():
    warnings.warn("use /v2/items", DeprecationWarning)
    return db.items.all()

# SAFE: PEP 702 deprecation marker + FastAPI deprecated=True + wire headers
from typing import deprecated  # Python 3.13+; use typing_extensions.deprecated on 3.12

@deprecated("Use /v2/items. Sunset 2026-12-31.", category=DeprecationWarning)
@app.get("/v1/items", deprecated=True,                                # surfaces in OpenAPI as deprecated: true
         openapi_extra={"x-sunset": "2026-12-31"})                    # x-sunset extension
def list_items_v1(response: Response):
    response.headers["Deprecation"] = "Wed, 15 Jan 2026 00:00:00 GMT" # RFC 9745
    response.headers["Sunset"]      = "Thu, 31 Dec 2026 00:00:00 GMT" # RFC 8594
    response.headers["Link"]        = (
        '<https://docs.example.com/migrations/items-v2>; rel="deprecation", '
        '</v2/items>; rel="successor-version"'
    )
    return db.items.all()

@app.get("/v2/items")
def list_items_v2(): return [ItemV2.from_orm(i) for i in db.items.all()]
```

PEP 702's `@deprecated` (added to `typing` in Python 3.13, available via `typing_extensions` for 3.12) is the canonical static-checker-visible marker — Pyright/Pylance and mypy both honor it. Pair it with FastAPI's per-route `deprecated=True` so the OpenAPI schema reflects the same fact.

### C (C17 / C23) — `[[deprecated]]` attribute in headers

```c
/* BAD: header exposes a soon-to-be-removed API with no warning */
/* libfoo.h */
int foo_legacy_open(const char *path);

/* SAFE: C23 [[deprecated]] attribute (or __attribute__((deprecated)) on older toolchains).
   Compilers emit -Wdeprecated-declarations at every call site. */
[[deprecated("Use foo_open_v2(); will be removed in libfoo 4.0 (2026-12-31)")]]
int foo_legacy_open(const char *path);

int foo_open_v2(const char *path, foo_options_t *opts);
```

C23 standardizes `[[deprecated]]` and `[[deprecated("reason")]]` as attribute syntax. On older toolchains (gcc/clang pre-C23), fall back to `__attribute__((deprecated("reason")))`; MSVC uses `__declspec(deprecated("reason"))`. Per the warnings-are-bugs rule, `-Wdeprecated-declarations` must be treated as an error in CI.

### C++ (20 / 23) — `[[deprecated]]` attribute

```cpp
// BAD: silent removal-in-progress
namespace api { Result fetchLegacy(std::string_view url); }

// SAFE: C++14+ [[deprecated]] with reason; concise and tool-visible
namespace api {
    [[deprecated("Use fetch(); removed in 4.0 (2026-12-31). See https://docs.example.com/migrations/fetch-v2")]]
    Result fetchLegacy(std::string_view url);

    Result fetch(std::string_view url, const FetchOptions& opts = {});
}
```

`[[deprecated]]` is C++14, the string-reason form is C++17, and they compose with `[[nodiscard]]` and module exports cleanly in C++20/23. All major compilers (gcc, clang, MSVC) surface them through `-Wdeprecated-declarations` (clang/gcc) or C4996 (MSVC).

### TypeScript — OpenAPI `deprecated: true` + JSDoc `@deprecated`

```typescript
// BAD: ad-hoc comment, invisible to tools and to the OpenAPI doc
/** old, don't use */
export function fetchUserV1(id: string): Promise<UserV1> { /* ... */ }

// SAFE: JSDoc @deprecated tag (TS surfaces this in tsserver / editor) + OpenAPI metadata
/**
 * @deprecated Use {@link fetchUserV2}. Sunset 2026-12-31.
 *   Migration: https://docs.example.com/migrations/users-v2
 */
export function fetchUserV1(id: string): Promise<UserV1> { /* ... */ }
```

OpenAPI spec excerpt (TS server emits both `deprecated: true` and the `x-sunset` extension):

```yaml
paths:
  /v1/users/{id}:
    get:
      deprecated: true
      x-sunset: "2026-12-31"
      x-deprecation: "2026-01-15"
      responses:
        "200": { $ref: "#/components/responses/UserV1" }
        "410": { description: "Gone — sunset reached; use /v2/users/{id}" }
```

Express/Fastify/Nest middleware should attach `Deprecation`, `Sunset`, and `Link` headers from the OpenAPI doc — single source of truth.

### SQL — deprecated columns with view facade

```sql
-- BAD: drop the column → every reader breaks at deploy
ALTER TABLE users DROP COLUMN legacy_phone;

-- SAFE: deprecate the column, keep it readable via a view facade, write to the new column
ALTER TABLE users RENAME COLUMN legacy_phone TO legacy_phone_deprecated_2026q4;
ALTER TABLE users ADD COLUMN phone_e164 TEXT;
COMMENT ON COLUMN users.legacy_phone_deprecated_2026q4 IS
    'DEPRECATED 2026-01-15; sunset 2026-12-31. Read phone_e164 instead. See docs/migrations/phone-v2.';

-- Facade view preserves the old name so dashboards / reports keep working during the window
CREATE OR REPLACE VIEW users_v1 AS
SELECT id, email,
       COALESCE(legacy_phone_deprecated_2026q4, phone_e164) AS legacy_phone
  FROM users;

-- After sunset (and after telemetry confirms no readers), drop the column AND the view
-- in a single migration so the boundary is clean.
```

Same pattern in MySQL (`CHANGE COLUMN`, `CREATE VIEW`), Snowflake (`COMMENT` + facade view), and BigQuery (column description + authorized view).

## Detection methods (still applicable)

### Static analysis
```bash
tsc --noEmit 2>&1 | grep -iE 'deprecated|@deprecated'
npx eslint . --rule 'deprecation/deprecation: error'
python -W error::DeprecationWarning -c "import mymodule"   # promote to error in CI
javac -Xlint:deprecation -Werror Foo.java                  # Java: error on deprecation
dotnet build /warnaserror /p:TreatWarningsAsErrors=true    # .NET: treat [Obsolete] use as error
clang -Wdeprecated-declarations -Werror foo.c              # C/C++
```

### OpenAPI / contract analysis
```bash
# oasdiff: surfaces deprecated operations + missing sunset
oasdiff diff openapi.v1.yaml openapi.v2.yaml --check-breaking --deprecated-from openapi.v1.yaml

# Validate Sunset header presence
curl -sI https://api.example.com/v1/users | grep -iE '^(Sunset|Deprecation|Link):'
```

### Package analysis
```bash
npm outdated --json | jq 'to_entries[] | select(.value.wanted != .value.latest)'
npm info <pkg> deprecated
pip list --outdated --format=json
```

### Code pattern matching (raise-the-alarm regexes)
Flag any operation tagged `@deprecated` / `[[deprecated]]` / `@Deprecated` / `[Obsolete]` that lacks:
1. a since / `forRemoval` / sunset date in the message, and
2. (for HTTP handlers) a `Sunset` and `Link` header write, and
3. (for OpenAPI specs) the `deprecated: true` flag.

## Urgency levels (internal triage)

| Status | Action Required |
|--------|-----------------|
| Deprecated (sunset > 6 months out) | Plan migration |
| Removal Pending (sunset ≤ 6 months) | Migrate before next major |
| EOL Announced (sunset ≤ 30 days) | Migrate immediately |
| Sunset past, endpoint live | Block release — this is a contract lie |
| Removed (no replacement) | Breaking in current version → kick to backwards-compatibility-checker |

## Tool Integration (2026)

| Tool | Strengths | When |
|---|---|---|
| **oasdiff** | Diffs two OpenAPI specs; flags newly-deprecated operations, missing sunset, breaking changes | Every PR that touches `openapi.yaml` |
| **Spring `@Deprecated(since, forRemoval)`** | Java's typed deprecation; surfaces in IDE + javac `-Xlint:deprecation` | All Spring projects |
| **openapi-generator with `--enable-post-process-file`** | Emits deprecation banners in generated client SDKs; can be configured to fail generation on undocumented deprecations | SDK release pipelines |
| **Postman API Monitoring / Runscope** | Tracks request volume per deprecated endpoint; alerts on top consumers still calling | Consumer migration tracking |
| **`.NET Asp.Versioning` + `Microsoft.AspNetCore.OpenApi`** | Auto-emits `Sunset` / `Deprecation` headers from `[ApiVersion(Deprecated = true)]` declarations | ASP.NET Core projects |
| **`pyupgrade` / `ruff --select UP`** | Codemods that rewrite deprecated Python idioms automatically | Python upgrade PRs |
| **`jscodeshift` codemods** | Mechanical TS/JS rewrites for deprecated JS API calls | JS/TS upgrades |

Aggregate findings into the same SARIF lane the security skills use, so the GitHub code-scanning dashboard shows deprecation-cycle defects alongside SAST findings.

## Output Format

```markdown
## API Deprecation Cycle Report

### Summary
| Category | Count |
|---------|-------|
| Deprecated without Sunset header | 4 |
| Removed without deprecation period | 1 |
| Deprecated but no migration guide link | 7 |
| Sunset date past, endpoint still live | 1 |
| Missing version-in-URL strategy | 1 |

### Finding 1 — Sunset date past, endpoint still live
- **File**: `src/controllers/UsersV1Controller.cs:24`
- **Endpoint**: `GET /api/v1/users`
- **Sunset declared**: `2026-04-30` (passed 19 days ago)
- **Status**: still returning `200 OK` instead of `410 Gone`
- **Fix**: replace handler body with `return Results.Gone()` and emit `Link: <…/v2/users>; rel="successor-version"`.

### Finding 2 — Deprecated without Sunset header
- **File**: `app/routes/items.py:11`
- **Endpoint**: `GET /v1/items`
- **Marker**: `@app.get(..., deprecated=True)` present; **no `Sunset` header set**, **no `x-sunset` in OpenAPI**.
- **Fix**: see the SAFE Python snippet above; add `Deprecation`, `Sunset`, and two `Link` headers, plus `openapi_extra={"x-sunset": "..."}`.

(... etc.)
```

## Severity reconciliation (internal triage vs. refinement-loop output)

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL (triage) | Sunset date past with endpoint still live · removed without deprecation period · security-relevant deprecated API (e.g. `Buffer()` constructor, `BinaryFormatter`) still in use | BLOCK release |
| HIGH (triage) | Deprecated without `Sunset` header on a public API · missing version-in-URL strategy on a public API | Fix before release |
| MEDIUM (triage) | Deprecated but no migration guide link · `@Deprecated` without `since` / `forRemoval` | Fix this sprint |
| LOW (triage) | Internal-only API missing `Sunset` (still recommended) · advisory deprecation in a pre-1.0 library | Backlog |

When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md). The triage tiers above stay in the human-readable report body for prioritization; the letter's `severity` field is always `critical`. A deprecation warning today is a customer-visible 410 (or worse, a silent 200 from a contract you've already declared dead) tomorrow.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>          # fingerprint for dedup
severity: critical                                         # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                            # high = corroborated by 2+ of {live-header-probe, OpenAPI spec, source annotation}; medium = 1 strong signal; low = single weak signal
engine: oasdiff | tsc | eslint | javac | dotnet | clang | manual
kind: missing_sunset_header
      | removed_without_deprecation
      | missing_migration_link
      | sunset_past_endpoint_live
      | missing_version_strategy
target_file: src/controllers/UsersV1Controller.cs
line: 24
endpoint: "GET /api/v1/users"                              # if HTTP; omit for library/SDK findings
sunset_date: 2026-12-31                                    # ISO-8601; null if missing entirely (that IS the finding)
deprecated_since: 2026-01-15                               # ISO-8601; null if missing
successor: "GET /api/v2/users"                             # null if no replacement exists yet
migration_guide_url: "https://docs.example.com/migrations/users-v2"   # null if missing (that IS the finding)
consumer_traffic_last_30d: <int> | null                    # rolling 30-day request count; if telemetry available
suggested_fix: |
  Add headers:
    Deprecation: Wed, 15 Jan 2026 00:00:00 GMT
    Sunset:      Thu, 31 Dec 2026 00:00:00 GMT
    Link:        <https://docs.example.com/migrations/users-v2>; rel="deprecation"
    Link:        </api/v2/users>; rel="successor-version"
  Add to OpenAPI: deprecated: true, x-sunset: "2026-12-31".
reference: https://www.rfc-editor.org/rfc/rfc8594.html
```

The integrator uses `confidence`, `kind`, and `sunset_date` to prioritize: a `sunset_past_endpoint_live` finding with `confidence: high` blocks release immediately; a `missing_migration_link` with `confidence: medium` can be deferred to the next sprint but still ships on the wire as `critical`.

## Red Lines

- NEVER ship a `deprecated: true` operation without a corresponding `Sunset` header / `x-sunset` value.
- NEVER let a sunset date pass without flipping the handler to `410 Gone` and updating the OpenAPI doc.
- NEVER remove an endpoint without a documented deprecation period; that's a contract break, not a deprecation — kick to [[backwards-compatibility-checker]].
- NEVER add a new use of a `[Obsolete]` / `@Deprecated` / `[[deprecated]]` / `@deprecated` API without a documented reason in the plan's `## Decisions Taken Under Ambiguity` section.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
