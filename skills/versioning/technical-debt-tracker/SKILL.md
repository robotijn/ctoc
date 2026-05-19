---
name: technical-debt-tracker
description: Identifies, quantifies, and prioritizes technical debt across code, dependencies, tests, and docs.
type: skill
when_to_load:
  - "technical debt"
  - "tech debt tracker"
  - "debt audit"
  - "tech debt"
  - "technical debt audit"
  - "code debt"
related_skills:
  - versioning/feature-flag-auditor
  - quality/code-smell-detector
  - quality/complexity-analyzer
  - security/dependency-auditor
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep, Bash
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Technical Debt Tracker (skill)

> Converted from agents/versioning/technical-debt-tracker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You identify, categorize, and prioritize technical debt to help teams make informed decisions about when and what to pay down. You treat every shortcut, marker, and deprecation as a tracked item with an owner, expiry date, and migration path — not as a comment that rots.

## 2026 Best Practices (Versioning category)

- **Every marker has an expiry date + ticket link**: `TODO(2026-08-01, LIN-1234): refactor cache layer`. A marker without both is debt-on-debt. Enforce via lint rule (eslint `no-warning-comments`, ruff `FIX`, Bandit `B101`-style) and pre-commit hook. The format is what makes the marker queryable; without it the comment is just noise.
- **Orphaned markers are bugs**: any TODO/FIXME/HACK more than 6 months past its declared expiry is a `severity: critical` finding (per warnings-are-bugs). No grace period. Surface them on the next PR that touches the file.
- **Tracking lives in an issue tracker, not in code**: code comments are a pointer; the ticket carries owner, estimate, business impact, and history. Linear, Jira, or GitHub Issues — pick one canonical home. Stepsize, in-IDE debt issues, and CodeScene tracking surfaces all mirror to the canonical tracker. Comments without a ticket link fail the lint gate.
- **Impact × Effort prioritization (RICE-debt)**: score = `(reach * impact * confidence) / effort_hours`. Reach = users/services affected. Impact = severity if not paid. Confidence = how sure you are about the estimate (0.0–1.0). Effort = engineering hours. Sort the backlog by this score; don't pay down by recency or alphabet.
- **SQALE / SonarQube debt model**: convert findings to *remediation time* (minutes/hours). Total debt expressed as "N days to fix" is the boardroom number. SonarQube 10.2+ exposes this via the Quality Gate API; mirror the same calculation locally for offline scans.
- **Debt budget per module + PR regression check**: each module declares a debt ceiling (e.g. SonarQube "debt ratio < 5%" or "< 8 hours of debt"). PRs that raise the module above ceiling fail CI. The budget makes the gate enforceable instead of aspirational.
- **15–20% sprint debt-paydown**: industry empirical band — below 10% debt grows faster than it's paid down; above 30% feature delivery suffers. The IEEE 2026 best-practice guidance recommends ≥15% in projects with high complexity or long-term maintenance. Carry one debt item per sprint at minimum.
- **Deprecation markers need `since` + migration path**: `[Obsolete("Use NewMethod since v3.1", DiagnosticId = "MYLIB001")]`, `@Deprecated(since="3.1", forRemoval=true)`, `@typing.deprecated("Use new_func", category=DeprecationWarning)`. A deprecation without `since` and a named replacement is unactionable — the consumer doesn't know which version added the warning or what to migrate to.
- **AI-generated code accrues debt faster**: LLM-produced code carries placeholder TODOs, hallucinated APIs, and untyped sketches. Apply stricter marker hygiene on AI-touched files; consider a PR label that triggers a debt-tracker pass.

## Debt Categories (Findings)

Each finding category below maps to a letter emitted to CTO Chief. All emit at `severity: critical` on the wire (warnings-are-bugs), with a `triage_tier` in the body for prioritization.

### Marker hygiene
- **TODO without expiry** — `TODO: fix this` with no `(YYYY-MM-DD, TICKET-ID)` — fails marker schema; cannot be tracked.
- **TODO past expiry** — marker's expiry date is in the past; >6 months past = orphaned, treat as bug.
- **FIXME without ticket link** — FIXME implies broken; needs a tracked owner. No ticket = orphaned bug.
- **HACK without rationale** — HACK markers must explain *why* the hack exists and what the right fix would be. A bare `HACK` is unmaintainable.
- **`[Obsolete]` / `@Deprecated` without `since` + migration path** — consumers can't act on it. Treat as bug.
- **Debt-budget regression in PR** — PR raises the module's SQALE debt ratio above the configured ceiling; fail the CI gate.

### Code quality
- High complexity functions, long methods (>50 lines), deep nesting (>4 levels), duplicate code, poor naming.

### Architecture
- Circular dependencies, god classes, tight coupling, missing abstractions, outdated patterns.

### Dependency
- Outdated packages, deprecated libraries, security vulnerabilities, unmaintained dependencies. Coordinate with [[dependency-auditor]].

### Test
- Low coverage, missing integration tests, flaky tests, slow test suite, mocked-away core logic.

### Documentation
- Missing docs, outdated docs, missing API docs, no architecture overview, stale READMEs.

## Marker Detection — 7-language coverage

The detector must recognize idiomatic deprecation/debt markers in each language so it can flag missing fields (`since`, `forRemoval`, migration path, expiry date, ticket link).

### TypeScript / JavaScript
```typescript
// BAD: bare TODO with no expiry or ticket
// TODO: refactor this once we move off the old API

// BAD: @deprecated tag with no migration path or since
/** @deprecated */
export function oldHelper(x: string) { /* ... */ }

// SAFE: TODO with expiry + ticket
// TODO(2026-09-15, LIN-4421): refactor when v5 cache lands

// SAFE: JSDoc deprecation with since + replacement
/**
 * @deprecated since 3.1 — use {@link newHelper} instead. Removal target: 4.0.
 */
export function oldHelper(x: string) { return newHelper(x); }
```
Enforce via eslint `no-warning-comments` + `eslint-plugin-deprecation` + a custom rule that requires `(YYYY-MM-DD, [A-Z]+-[0-9]+)` on every TODO/FIXME/HACK.

### Python (3.12+)
```python
# BAD: bare TODO; no expiry, no ticket
# TODO: handle empty list

# BAD: deprecation without typing.deprecated + warnings
def old_func(x):
    return new_func(x)

# SAFE: TODO with expiry + ticket
# TODO(2026-09-15, LIN-4421): handle empty list once schema migration lands

# SAFE: PEP 702 typing.deprecated (Python 3.12+) + runtime warning
from typing import deprecated
import warnings

@deprecated("Use new_func() since v3.1 — see migration guide §4.2.")
def old_func(x):
    warnings.warn(
        "old_func is deprecated since 3.1; use new_func. Removal in 4.0.",
        DeprecationWarning,
        stacklevel=2,
    )
    return new_func(x)
```
`typing.deprecated` is the canonical PEP 702 marker — static checkers (mypy, pyright) and IDEs surface it. `warnings.warn(..., DeprecationWarning)` covers the runtime channel. Both together = enforceable.

### C# (.NET 9)
```csharp
// BAD: [Obsolete] with no message, no since, no DiagnosticId
[Obsolete]
public void OldMethod() { /* ... */ }

// BAD: TODO comment without expiry/ticket
// TODO: clean this up

// SAFE: [Obsolete] with message + DiagnosticId + UrlFormat
[Obsolete(
    "Use NewMethod since v3.1. Removal target: v4.0. See https://docs.example.com/migration/3.1.",
    error: false,
    DiagnosticId = "MYLIB001",
    UrlFormat = "https://docs.example.com/diagnostics/{0}")]
public void OldMethod() { /* ... */ }

// SAFE: TODO with expiry + ticket
// TODO(2026-09-15, LIN-4421): consolidate cache layer after v5 ships
```
.NET 9 honors `DiagnosticId` and `UrlFormat` — Roslyn analyzers (e.g. `Microsoft.CodeAnalysis.NetAnalyzers` rule `CA1062`-family, plus custom analyzers) can surface them in IDE and CI. Use `error: true` once the migration window closes.

### Java (21+)
```java
// BAD: @Deprecated with no since, no forRemoval, no migration pointer
@Deprecated
public void oldMethod() { /* ... */ }

// BAD: TODO comment without expiry/ticket
// TODO: refactor this loop

// SAFE: @Deprecated(since, forRemoval) + @deprecated Javadoc with migration
/**
 * @deprecated Since 3.1, use {@link #newMethod()}. Slated for removal in 4.0.
 *             See https://docs.example.com/migration/3.1
 */
@Deprecated(since = "3.1", forRemoval = true)
public void oldMethod() { /* ... */ }

// SAFE: TODO with expiry + ticket
// TODO(2026-09-15, LIN-4421): refactor loop when stream-API migration lands
```
`forRemoval=true` is what flips the compiler warning from `deprecation` to `removal` — a stronger signal. Always pair with a `@deprecated` Javadoc block naming the replacement.

### C (C17 / C23)
```c
/* BAD: bare TODO, no expiry or ticket */
/* TODO: this leaks on error path */

/* BAD: deprecated function with no message or since */
void old_func(int x);

/* SAFE: TODO with expiry + ticket */
/* TODO(2026-09-15, LIN-4421): plug error-path leak after rewrite */

/* SAFE: C23 [[deprecated]] attribute with message; falls back via GCC/Clang attributes */
[[deprecated("Use new_func() since v3.1; removal target v4.0")]]
void old_func(int x);

/* Pre-C23 portable fallback */
#if defined(__GNUC__) || defined(__clang__)
#  define DEPRECATED_SINCE(ver, msg) __attribute__((deprecated(msg)))
#elif defined(_MSC_VER)
#  define DEPRECATED_SINCE(ver, msg) __declspec(deprecated(msg))
#else
#  define DEPRECATED_SINCE(ver, msg)
#endif

void old_func(int x) DEPRECATED_SINCE("3.1", "Use new_func() since v3.1; removal target v4.0");
```
C23 standardized `[[deprecated]]` and `[[deprecated("message")]]`. MSVC's `#pragma deprecated(symbol)` exists but lacks a message slot — prefer the attribute form on modern toolchains.

### C++ (20 / 23)
```cpp
// BAD: [[deprecated]] without message
[[deprecated]] void old_func(int);

// BAD: TODO without expiry/ticket
// TODO: rewrite using ranges

// SAFE: [[deprecated("message")]] with since + replacement
[[deprecated("Use new_func() since v3.1; removal target v4.0. See docs/migration-3.1.md.")]]
void old_func(int);

// SAFE: TODO with expiry + ticket
// TODO(2026-09-15, LIN-4421): rewrite using std::ranges once MSVC 2026 lands

// SAFE: C++20 [[deprecated]] on a class member or enumerator
struct Cache {
    [[deprecated("Use get_or_insert() since 3.1")]] int get(int key);
};
```
C++14 introduced `[[deprecated]]`, C++17 extended it to enumerators, C++20 covers most remaining declarators. The string argument is non-optional in practice — without it, IDE quick-fix workflows can't suggest the replacement.

### SQL
```sql
-- BAD: bare TODO in a stored proc, no tracking
-- TODO: index this someday

-- BAD: column marked deprecated only by name (legacy_x) with no expiry
ALTER TABLE users ADD COLUMN legacy_status VARCHAR(20);

-- SAFE: TODO with expiry + ticket as a structured comment
-- TODO(2026-09-15, LIN-4421): add covering index after the read-traffic experiment

-- SAFE: deprecation as a column comment + CHECK constraint with explicit expiry
ALTER TABLE users
  ADD COLUMN legacy_status VARCHAR(20)
  CONSTRAINT legacy_status_expiry CHECK (
    -- DEPRECATED since v3.1, removal target v4.0 (2026-12-31).
    -- Migrate to status_v2 (see migrations/2026_05_status_v2.sql).
    1 = 1
  );
COMMENT ON COLUMN users.legacy_status IS
  'DEPRECATED since v3.1 (LIN-4421). Use status_v2. Removal target: 2026-12-31.';
```
SQL lacks a deprecation attribute — the conventions are `COMMENT ON COLUMN/TABLE` for tooling-visible metadata, plus a CHECK constraint or expiry-date guard rail. Tools like Atlas and Liquibase can lint comments for the required tokens (`DEPRECATED since`, `Removal target`).

## Detection Engine

### Code marker patterns
```javascript
// Marker shape: KIND(YYYY-MM-DD, TICKET-ID): message
// Anything that matches KIND but not the structured form is a violation.
const debtPatterns = [
  /\bTODO\b(?!\s*\(\d{4}-\d{2}-\d{2},\s*[A-Z]+-\d+\))/gi,    // TODO without expiry+ticket
  /\bFIXME\b(?!\s*\(\d{4}-\d{2}-\d{2},\s*[A-Z]+-\d+\))/gi,   // FIXME without expiry+ticket
  /\bHACK\b(?!\s*:\s*because)/gi,                            // HACK without rationale
  /\bXXX\b/gi,                                               // XXX — discouraged; use TODO/FIXME/HACK
  /@deprecated\s*$/gmi,                                      // JSDoc @deprecated with no body
];

// Structured marker that PASSES
// e.g.  TODO(2026-09-15, LIN-4421): refactor cache layer after v5 ships
const wellFormed = /\b(TODO|FIXME)\((\d{4}-\d{2}-\d{2}),\s*([A-Z]+-\d+)\)\s*:/i;
```

### Static analysis
```bash
# SonarQube — SQALE remediation-time + debt ratio per module
sonar-scanner -Dsonar.projectKey=$PROJECT -Dsonar.qualitygate.wait=true

# Stepsize — in-IDE debt tracking, mirrors to Linear/Jira
stepsize debt list --since=6m --past-expiry

# Trunk Check — meta-linter that aggregates language linters incl. todo/fixme rules
trunk check --upstream=origin/main --output=sarif > trunk.sarif

# ESLint — no-warning-comments + custom marker rule
npx eslint --rule 'no-warning-comments: [error, { terms: ["todo", "fixme", "hack", "xxx"], location: "anywhere" }]' .

# Cargo + clippy — flags `todo!()` / `unimplemented!()` macros as warnings
cargo clippy -- -W clippy::todo -W clippy::unimplemented -W clippy::dbg_macro

# Complexity + duplication signals
npx complexity-report src/ --format json
npx jscpd src/ --reporters json

# Dependency layer
npm outdated --json
npm audit --json
```

## Quantification

### Effort estimate (rough order of magnitude)
| Debt Type | Small | Medium | Large |
|-----------|-------|--------|-------|
| Fix TODO | 1h | 4h | 1d |
| Refactor function | 2h | 8h | 2d |
| Replace library | 4h | 2d | 1w |
| Add test coverage | 1h/10% | 4h/10% | 1d/10% |
| Migrate `[Obsolete]` callsites | 1h/10 sites | 4h/10 sites | 1d/10 sites |

### RICE-debt priority score
```javascript
function calculatePriority(debt) {
  // RICE-debt: (reach × impact × confidence) / effort
  const reach = debt.usersAffected;             // numeric — users, services, callsites
  const impact = debt.severityIfUnpaid;         // 0–3 (low, medium, high, critical)
  const confidence = debt.estimateConfidence;   // 0.0–1.0 — how sure are we about the numbers
  const effort = Math.max(0.5, debt.effortHours);
  return (reach * impact * confidence) / effort;
}
```
Sort the backlog descending by `calculatePriority`. Items past their expiry date get a `+critical` multiplier (orphan boost) so they bubble to the top automatically.

### Remediation-time aggregation (SQALE-style)
| Module | Lines | Debt (hours) | Debt ratio | Budget | Status |
|--------|-------|--------------|-----------|--------|--------|
| `src/payments/` | 4,200 | 18h | 4.3% | 5% | OK |
| `src/legacy-cache/` | 1,800 | 22h | 12.2% | 5% | OVER — block PRs |
| `src/api/` | 3,100 | 9h | 2.9% | 5% | OK |

PRs that raise a module above its budget fail the CI gate. Configure budgets in `.ctoc/debt-budgets.yaml`.

## Output Format

```markdown
## Technical Debt Report

### Summary
| Category | Items | Total Effort | Past Expiry | Priority |
|----------|-------|--------------|-------------|----------|
| Marker hygiene | 27 | 14h | 11 | Critical |
| Security | 3 | 2d | 1 | Critical |
| Dependencies | 12 | 4d | 4 | High |
| Code Quality | 45 | 8d | — | Medium |
| Test Coverage | 8 | 5d | — | Medium |
| Documentation | 15 | 3d | — | Low |

### Critical — past-expiry orphans
1. **TODO past expiry (>6mo)**
   - File: `src/db/queries.ts:45`
   - Marker: `// TODO: parameterize this query`
   - No expiry, no ticket. First seen 2025-08-12 (git blame). Days since: 280.
   - Suggested fix: open Linear ticket, restructure as `// TODO(2026-08-01, LIN-XXXX): parameterize query`

2. **`[Obsolete]` without since / migration path**
   - File: `src/Services/UserService.cs:88`
   - Marker: `[Obsolete]` (bare)
   - Suggested fix: `[Obsolete("Use UserServiceV2 since v3.1; removal v4.0", DiagnosticId = "USR001")]`

### Debt budget — module status
| Module | Debt ratio | Budget | Status |
|--------|-----------|--------|--------|
| src/legacy-cache | 12.2% | 5% | OVER (-7.2%) |
| src/payments | 4.3% | 5% | OK |

### Recommendations
**Immediate (this sprint)**:
1. Convert 27 bare TODO/FIXME markers to structured form (3h estimated)
2. Bring `src/legacy-cache/` under 5% debt ratio (14h estimated)

**This quarter**:
3. Replace lodash@4.17.20 (CVE-2021-23337)
4. Break up `OrderService.ts` god class (RICE-debt: 142.8)

### Budget Recommendation
Allocate 15–20% of sprint capacity to debt reduction (IEEE 2026 guidance for high-complexity projects).
- Current: ~5%
- Recommended: 18%
- Result at current paydown rate: net -3 items/month (debt decreasing)
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **SonarQube (10.2+)** | SQALE remediation-time model, debt-ratio quality gate, native CI integration (Jenkins/GitHub Actions/Azure DevOps), Quality Gate API | Self-hosted edition needs ops; cloud edition has per-LOC pricing | Every PR via Quality Gate; nightly full scan |
| **Stepsize** | In-IDE debt issue creation, mirrors to Jira/Linear/Asana/GitHub Issues without replacing them, IDE quick-fix for marker hygiene | SaaS only; team-tier pricing | Daily engineer workflow (IDE) |
| **Trunk.io / Trunk Check** | Meta-linter aggregating 100+ tools (ruff, eslint, gitleaks, semgrep, etc.) with one config, native SARIF, `--upstream` differential scan, hold-the-line baseline | Setup time on first run while baselines build | Pre-commit + PR check |
| **ESLint `no-warning-comments`** | Built-in marker detection for JS/TS, terms-configurable, location-configurable | JS/TS only; doesn't enforce the structured form by default | Pre-commit, fast feedback |
| **Cargo `clippy::todo` / `clippy::unimplemented` / `clippy::dbg_macro`** | Rust marker lints built into clippy — flags `todo!()`, `unimplemented!()`, and `dbg!()` left in code | Rust only | Pre-commit, fast feedback |
| **CodeClimate** | Maintainability rating, churn-vs-complexity hotspot heatmap, GitHub PR comments | SaaS; rule customization is less flexible than SonarQube | PR check, dashboards |
| **GitHub `# todo` / Linear `TODO` integrations** | Auto-create issues from structured TODO markers; round-trip status to the comment | Requires the structured marker form; webhook setup | Once structured markers are enforced |

Configure all of them to emit **SARIF** so findings aggregate alongside SAST output ([[sast-scanner]]) in the GitHub Security tab. Pin a CI step that fails the build whenever this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable debt report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see `agents/_shared/warnings-are-critical.md`). The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------|----------|-----------------|
| CRITICAL | Past-expiry orphan markers (>6mo), security debt with no owner, debt-budget regression in PR, `[Obsolete]`/`@Deprecated` without `since` on public API | BLOCK PR |
| HIGH | TODO/FIXME without expiry+ticket on hot paths, deprecated dependency with active CVE, missing migration path on `forRemoval=true` | Fix before release |
| MEDIUM | Bare TODO on cold paths, complexity hot spots without recent churn, doc debt on internal-only APIs | This sprint |
| LOW | XXX markers (style), low-priority refactors, doc polish | Backlog |

## Red Lines

- NEVER let a security debt item sit > 30 days without an owner + due date.
- NEVER mark a debt item "won't fix" without a tracking ticket explaining the rationale.
- NEVER suppress an eslint / ts-ignore / `[SuppressMessage]` / `# noqa` without an inline comment AND a ticket link.
- NEVER add a bare `TODO` / `FIXME` / `HACK` in new code — must include expiry date and ticket.
- NEVER mark code `[Obsolete]` / `@Deprecated` without `since` + replacement + migration path.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = structured marker scan + git-blame corroboration
engine: stepsize | sonarqube | trunk | eslint | clippy | sql-lint | manual
kind: todo-no-expiry | todo-past-expiry | fixme-no-ticket | hack-no-rationale |
      obsolete-no-since | obsolete-no-migration | deprecated-no-since |
      debt-budget-regression | xxx-marker | bare-deprecation-tag
target_file: src/payments/charge.ts
line: 142
marker_text: "// TODO: fix this once we move off old API"      # the literal comment / attribute
expiry_date: 2025-08-01 | null                                  # parsed from marker, null if absent
days_past_expiry: 282 | null                                    # null if no expiry declared
ticket_link: https://linear.app/co/issue/LIN-4421 | null        # null if absent
language: typescript | python | csharp | java | c | cpp | sql
suggested_fix: |
  Replace bare TODO with structured form:
    // TODO(2026-09-15, LIN-XXXX): refactor when v5 cache lands
  Open Linear ticket capturing impact (3 callers) and effort (~4h).
reference: https://owasp.org/www-community/Technical_Debt
```

The integrator uses `days_past_expiry` and `ticket_link` to weight findings — a TODO past expiry with no ticket link cannot be deferred (it's already broken). A well-formed TODO that just rolled past expiry today is recoverable (`confidence: medium`, integrator may grant one-sprint grace window). Findings without `marker_text` or `target_file` are rejected by the schema.

Mapping from `kind` to the internal triage tier in the report body (the wire severity is always `critical`):

| `kind` | Triage tier |
|--------|-------------|
| `todo-past-expiry` (>6mo), `debt-budget-regression`, `obsolete-no-since` on public API | CRITICAL |
| `todo-no-expiry` / `fixme-no-ticket` on hot paths, `obsolete-no-migration`, `bare-deprecation-tag` | HIGH |
| `hack-no-rationale`, `todo-no-expiry` on cold paths | MEDIUM |
| `xxx-marker` | LOW |

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see `docs/REFINEMENT_LOOP.md`), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
