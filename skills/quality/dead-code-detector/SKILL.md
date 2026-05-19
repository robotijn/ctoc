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
  - "unused imports"
  - "orphan files"
  - "unused dependencies"
related_skills:
  - quality/code-reviewer
  - quality/duplicate-code-detector
  - quality/technical-debt-tracker
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

# Dead Code Detector (skill)

> Converted from `agents/quality/dead-code-detector.md` as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.

## Role

You find code that is never executed or referenced — unreachable branches, unused imports, dead exports, dead parameters, dead fields, orphan files, and dead database objects. Dead code adds confusion, increases bundle size, slows the build, and hides bugs.

## 2026 Best Practices

The single most important distinction in this skill — get it wrong and the loop emits false positives that erode trust.

- **Unreachable code is always dead.** Code after an unconditional `return` / `throw` / `process.exit` / `panic!`, branches gated on a literal `false`, statements after an infinite loop with no `break`. Compilers and type checkers prove unreachability — confidence is **HIGH**.
- **Unused code is _potentially_ dead — verify before deletion.** A symbol with no static reference may still be live via:
  - reflection / `getattr` / `Type.GetMethod` / Java reflection
  - dynamic dispatch / virtual interfaces with external implementors
  - plugin APIs and host-loaded callbacks (entry points, exports the host imports)
  - deserialization targets (Jackson, System.Text.Json, pickle, Pydantic)
  - ORM callbacks (`__init_subclass__`, EF Core conventions, Hibernate lifecycle)
  - public library API (consumers live outside this repo)
  - test discovery (`pytest` collection, JUnit `@Test`, xUnit `[Fact]`)
  - feature flags gating call sites — the call exists but is never taken in the current config

  Unverified single-tool "unused" hits are **MEDIUM** confidence at best.

- **Library vs application reachability is the key call.** In an _application_ with a known entry-point set (HTTP handlers, CLI commands, jobs), reachability analysis is sound — anything not reachable from an entry point is a candidate. In a _library_ with no closed entry-point set, every public export is reachable-by-assumption; only `internal` / `private` / `__all__`-excluded symbols are candidates. Misclassifying a library as an application produces catastrophic false positives. Emit `target_kind: app | library | mixed` on every letter.

- **Tree-shaking ≠ dead-code elimination.** Tree-shaking removes unused _exports_ at the module level using ES-module static structure (the bundler's job). Dead-code elimination removes unreachable _logic_ at the expression level (the compiler's job). A symbol can be tree-shaken from a bundle yet still need to exist in source. We surface both — and we never confuse them.

- **Feature flags are the largest blind spot.** A branch gated on `if (flags.legacyExport)` is _reachable_ in code but _unreached_ in production. Tag these as `kind: feature-flagged`, `suggested_action: needs_human_review`, and coordinate with the feature-flag inventory before deletion.

- **Mark-and-sweep is the canonical algorithm.** Build the symbol graph from entry points, mark reachable symbols, sweep the rest. `knip`, `ts-prune`, `tsr`, `vulture`, and CodeQL all use a variant. Single-pass regex grep is _not_ sufficient for export-level dead code — it can't tell `import { foo as bar }` from `import { baz }`.

- **Test code is a first-class entry point.** A function only used by tests is still "used" if the tests are part of the shipped contract. A function only used by a deleted test is dead. Tools like `knip` understand this; `ts-prune` historically did not.

- **Dispensables in the smell taxonomy.** Dead code is the canonical "dispensable" smell. Cross-ref [[code-smell-detector]] and [[technical-debt-tracker]].

## Categories

| Category | Detection | Confidence ceiling |
|----------|-----------|--------------------|
| Unreachable code | Compiler / type-checker reports it | HIGH |
| Unused imports / usings | First-party tool (`ruff F401`, `--noUnusedLocals`, `dotnet IDE0005`) | HIGH |
| Unused local variables / parameters | `--noUnusedLocals` / `--noUnusedParameters`, `IDE0060`, `unused-variable` | HIGH for locals, MEDIUM for params (interface contracts) |
| Unused private fields / methods | `IDE0051`, PMD `UnusedPrivateMethod`, clang-tidy | HIGH (private) — internal-only |
| Unused public exports (app) | Mark-and-sweep from entry points (knip / tsr / vulture) | MEDIUM (verify dynamic) |
| Unused public exports (library) | NOT a finding by default — public is the API surface | LOW |
| Unused classes / types | Mark-and-sweep + reflection-aware whitelist | MEDIUM |
| Orphan files | No `import` / `require` / `using` / `#include` references anywhere | MEDIUM — check for plugin loading |
| Unused dependencies | `knip` / `depcheck` / `cargo udeps` / `dotnet list package --vulnerable --include-transitive` cross-ref | HIGH (lockfile is ground truth) |
| Dead database columns | No DML / DDL / ORM property references; cross-ref `information_schema` | MEDIUM — check for ETL / BI / external consumers |
| Dead database tables / views / procs | Same as columns; plus `sys.dm_db_index_usage_stats` (SQL Server), `pg_stat_user_tables` (Postgres) | MEDIUM |
| Feature-flagged branches | Branch gated by flag never-taken in production | needs_human_review |

## 7-language coverage

Each example shows one canonical dead-code pattern and the tool that detects it.

### C# (.NET 9)

```csharp
public class OrderService
{
    private readonly ILogger _log;
    private readonly ILegacyMailer _mailer;   // IDE0052: assigned but never read
    private int _retries;                     // IDE0044: never assigned outside ctor

    public OrderService(ILogger log, ILegacyMailer mailer) { _log = log; _mailer = mailer; }

    public void Process(Order o)
    {
        if (o is null) throw new ArgumentNullException(nameof(o));
        return;                               // CS0162: unreachable code below
        _log.LogInformation("processed");     // unreachable
    }

    private void RetryWithBackoff() { }       // IDE0051: unused private method
}
```

Detection: `dotnet build /p:TreatWarningsAsErrors=true` plus `<AnalysisMode>All</AnalysisMode>` in the csproj. Roslyn analyzers `IDE0005` (unused usings), `IDE0044` (make field readonly), `IDE0051` (unused private member), `IDE0052` (private field assigned-only), `IDE0060` (unused parameter), `CS0162` (unreachable code). CodeQL `csharp/useless-assignment-to-local` and `csharp/unreachable-statement` add cross-procedural reach.

### Java (21+)

```java
public class Cache {
    private final Map<String,String> store = new HashMap<>();
    private int hits;                                  // PMD: UnusedPrivateField
    public String get(String k) { return store.get(k); }
    private void warmUp() { }                          // PMD: UnusedPrivateMethod
    public void put(String k, String v, int ttl) {     // PMD: UnusedFormalParameter (ttl)
        store.put(k, v);
        return;
        store.size();                                  // javac: unreachable statement
    }
}
```

Detection: `javac -Xlint:all` for unreachable; PMD `UnusedPrivateField`, `UnusedPrivateMethod`, `UnusedFormalParameter`, `UnusedLocalVariable`; SpotBugs `URF_UNREAD_FIELD`; IntelliJ Inspect Code (`idea inspect`) for whole-program export reachability; Error Prone `DeadException`, `UnusedMethod`. CodeQL pack `java-security-and-quality.qls` covers cross-file reachability.

### Python (3.12+)

```python
# F401 — unused import
import os                                # ruff F401
from typing import Optional              # F401 if no annotation uses it

class UserRepo:
    def find(self, user_id: int) -> Optional[dict]:
        return self._fetch(user_id)
        print("never runs")              # vulture: unreachable code

    def _fetch(self, user_id: int):     # vulture confidence 60 — looks unused
        ...                              # but may be called via getattr

    def _legacy_export(self):           # vulture confidence 100 — truly unused private
        pass
```

Detection: `ruff check --select F,E,W` for `F401` (unused import), `F811` (redefinition), `F841` (unused local). `vulture src/ --min-confidence 80` for dead functions/classes/attributes — note vulture's confidence reflects how dynamic the symbol is, not how dead it is. Reflection-heavy projects: use `--ignore-decorators` (`@app.route`, `@receiver`, `@click.command`, `@pytest.fixture`) and a whitelist generated with `--make-whitelist`. Pyright/mypy `reportUnusedExpression` flags expression statements with no effect.

### C (C17/C23)

```c
static int unused_counter = 0;          /* -Wunused-variable */

int process(int x, int y) {              /* -Wunused-parameter on y */
    if (x < 0) return -1;
    return 0;
    x = x + 1;                           /* -Wunreachable-code-aggressive (clang) */
}

static void helper(void) { }             /* -Wunused-function */
```

Detection: `gcc -Wall -Wextra -Wunused -Wunused-parameter -Wunreachable-code -Werror`. Clang adds `-Wunreachable-code-aggressive` and `-Wunused-but-set-variable`. clang-tidy: `misc-unused-parameters`, `bugprone-unused-return-value`, `readability-redundant-declaration`. Cross-TU dead code requires link-time analysis (`-flto` + `--gc-sections`) or whole-program tools like `cppcheck --enable=unusedFunction`.

### C++ (20 / 23)

```cpp
namespace detail {
[[maybe_unused]] static int kFudgeFactor = 7;   // suppressed deliberately

class Cache {
    int hits_;                                  // clang-tidy bugprone-unused-private-field
    [[nodiscard]] int get(int) const;
    void warmUp() { }                           // clang-tidy misc-unused-using-decls / unused-method
};
}  // namespace detail
```

Detection: clang-tidy with `bugprone-unused-raii`, `bugprone-unused-return-value`, `bugprone-unused-private-field`, `misc-unused-parameters`, `misc-unused-using-decls`, `readability-redundant-*`. GCC/Clang `-Wunused-*` family. `[[nodiscard]]` enforces _call-site_ liveness (caller must use the return). For inter-TU export reachability use IWYU (`include-what-you-use`) and link-time `--gc-sections`.

### JavaScript / TypeScript

```typescript
// utils/helpers.ts
import { format } from 'date-fns';           // ts-unused-exports / ruff-style F401: never used
export function formatCurrency(n: number) { return n.toFixed(2); }
export function parseDate(s: string) {        // ts-prune / knip: never imported
  return new Date(s);
}

// api/handler.ts
export async function handle(req: Request) {
  if (!req.headers.get('auth')) return new Response('401', { status: 401 });
  return new Response('ok');
  console.log('unreachable');                 // tsc / eslint no-unreachable
}
```

Detection: `tsc --noUnusedLocals --noUnusedParameters --allowUnreachableCode=false`. Then **knip** (preferred 2026 default — supersedes ts-prune which is in maintenance mode) for unused files, exports, dependencies, and dev dependencies in one pass. `ts-unused-exports` for export-only checks. `tsr` (Line's TypeScript Remove) for actual removal. `eslint`: `no-unused-vars`, `no-unreachable`, `@typescript-eslint/no-unused-vars`. `depcheck` as a fallback for `package.json` audits — knip subsumes it.

### SQL (Postgres / SQL Server / MySQL)

```sql
-- Orphan column: no SELECT, INSERT, UPDATE, or ORM property references it anywhere
ALTER TABLE users ADD COLUMN legacy_referral_code varchar(32);   -- dead since 2024

-- Dead view: never selected from
CREATE VIEW v_users_legacy AS SELECT id, name FROM users;

-- Dead stored procedure: not called from app, jobs, or other procs
CREATE PROCEDURE sp_archive_2019() ...;

-- Dead index: large, never used by the planner
CREATE INDEX ix_users_legacy_referral ON users(legacy_referral_code);
```

Detection: Postgres — `pg_stat_user_tables`, `pg_stat_user_indexes` (`idx_scan = 0`), `pg_stat_statements` for query reference traces. SQL Server — `sys.dm_db_index_usage_stats` (`user_seeks + user_scans + user_lookups = 0`), `sys.dm_exec_procedure_stats`. MySQL — `performance_schema.table_io_waits_summary_by_index_usage`. Cross-reference: grep ORM definitions (`@Column`, `[Column]`, `models.CharField`), migration history, BI / ETL configs (Looker, dbt, Airflow DAGs), and external read replicas before flagging. Production-traffic-derived liveness is the gold standard; static cross-ref is a candidate signal only.

## False-positive sources

Every one of these defeats static analysis. If any apply, downgrade `confidence` and set `possible_dynamic_usage: true`.

| Source | Why it defeats analysis | Mitigation |
|--------|-------------------------|------------|
| Reflection (`getattr`, `Type.GetMethod`, `Method.invoke`, `eval`) | Symbol referenced by string at runtime | Whitelist patterns; require `confidence: medium` max |
| Dynamic dispatch | Interface implementations discovered at runtime (DI container, plugin scan) | Treat all public interface implementors as reachable |
| Plugin APIs | Host imports your exports by convention (entry points, manifests) | Read manifest (`package.json` `exports`, `pyproject.toml` `[project.entry-points]`, `MANIFEST.MF`); treat declared exports as roots |
| Deserialization targets | Class constructed by JSON/YAML/XML/pickle deserializer | Whitelist deserialization decorators (`@JsonProperty`, `[JsonInclude]`, `BaseModel`) |
| ORM-generated callbacks | Hibernate `@PrePersist`, EF `OnModelCreating`, Django signals | Whitelist ORM decorators / attributes |
| Public library exports | Consumers outside the repo | `target_kind: library` → never flag public exports |
| Test code | Test discovery uses introspection (pytest collection, JUnit annotations) | Mark test entry-point patterns as roots |
| Feature flags | Branch reachable in code, never taken in current config | `kind: feature-flagged`, `needs_human_review` |
| Conditional compilation | `#if`, `[Conditional("DEBUG")]`, `__debug__` blocks | Analyze under each build flavor |
| FFI / native interop | C export consumed by another language | Treat `extern "C"`, `[DllImport]`, `[UnmanagedCallersOnly]` as roots |
| String-built SQL | ORM column referenced only in dynamic SQL | Grep migration files and ORM metadata before flagging columns |
| Database read replicas / BI tools | Column read by Looker, dbt, Airflow, BI dashboards outside the repo | Require team confirmation before dropping columns |

## Severity reconciliation

Dead-code skills have two competing pressures: most findings _feel_ like style nits (unused imports), but a few are genuine latent bugs (unreachable auth check, unused exception handler). The reconciliation: triage tiers below drive the human-readable report; the wire format is uniform.

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization. The footer block at the bottom of this file restates the same rule for critic-mode dispatch.

| Triage tier | Examples | Internal action |
|-------------|----------|-----------------|
| CRITICAL | Unreachable security-relevant code (e.g. unreachable auth check), dead branch that masks a real bug, dead column holding PII (privacy debt) | Fix this PR |
| HIGH | Unreachable code in business logic, unused private members in hot paths, orphan files in production source tree | Fix this sprint |
| MEDIUM | Unused exports in app code (verified non-public), unused imports, dead test helpers, unused dependencies | Backlog |
| LOW | Unused parameters in interface contracts, `[[maybe_unused]]`-style intentional, public-export-no-internal-consumer in library mode | Annotate or accept |

On the wire (refinement loop) every emitted finding is `severity: critical`. Confidence carries the real signal: `confidence: high` means delete; `confidence: medium` means `needs_human_review`; `confidence: low` means single-tool unverified — informational only.

## Tool Integration (2026 landscape)

| Language | Default tool | Notes |
|----------|--------------|-------|
| TypeScript / JavaScript | **knip** | Supersedes `ts-prune` (maintenance mode 2025) and `depcheck`. Single pass for unused files, exports, deps, dev-deps; framework-aware (Jest, Vitest, Storybook, Webpack, Next.js, etc.). Pair with `tsc --noUnusedLocals --noUnusedParameters`. `tsr` for the actual removal step. `ts-unused-exports` for export-only checks. |
| Python | **ruff + vulture** | `ruff check --select F` handles F401 (unused imports), F811, F841 in milliseconds. `vulture src/ --min-confidence 80` for dead functions/classes/attributes; tune with `--ignore-decorators` and a whitelist. Pyright `reportUnusedExpression`. |
| C# / .NET 9 | **Roslyn analyzers + dotnet format** | `<AnalysisMode>All</AnalysisMode>` + `TreatWarningsAsErrors`. `dotnet format analyzers --severity info` surfaces IDE0005/0044/0051/0052/0060. CodeQL `csharp-security-and-quality.qls` adds cross-procedural reach. JetBrains Rider/ReSharper `Inspect Code` (`jb inspectcode`). |
| Java 21+ | **PMD + Error Prone + IntelliJ Inspect Code** | PMD rules: `UnusedPrivateField`, `UnusedPrivateMethod`, `UnusedFormalParameter`, `UnusedLocalVariable`. Error Prone `DeadException`, `UnusedMethod`. SpotBugs `URF_*`. `idea inspect` for whole-program. CodeQL `java-security-and-quality.qls`. |
| C (C17/C23) | **gcc/clang `-Wall -Wextra` + cppcheck + clang-tidy** | `-Wunused-*`, `-Wunreachable-code-aggressive` (clang). `cppcheck --enable=unusedFunction --inline-suppr`. clang-tidy `misc-unused-parameters`, `bugprone-unused-return-value`. |
| C++ 20/23 | **clang-tidy + IWYU + `[[nodiscard]]`** | clang-tidy `bugprone-unused-*`, `misc-unused-*`, `readability-redundant-*`. IWYU for include hygiene. `[[nodiscard]]` for call-site liveness enforcement. |
| SQL | **`pg_stat_*` / `sys.dm_db_*` + cross-ref scan** | Production liveness via planner stats. Static cross-ref via grep on ORM metadata, migrations, BI configs. SQLFluff for lint. Never drop a column on static signal alone. |

Aggregate where possible: knip and many of the C#/Java tools emit SARIF or can be wrapped to do so — feed into the GitHub code-scanning dashboard alongside SAST findings so duplicates collapse.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+symbol)[:12]>   # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = unreachable / private-and-orphaned;
                                                      # medium = unused but dynamic-possible;
                                                      # low = single-tool unverified
kind: unreachable | unused-import | unused-local | unused-parameter | unused-private-field |
      unused-private-method | unused-export | unused-class | orphan-file | unused-dependency |
      dead-db-column | dead-db-table | dead-db-view | dead-db-proc | dead-db-index |
      feature-flagged
target_kind: app | library | mixed                    # library mode forbids unused-export findings
target_file: src/services/legacy_mailer.cs
target_line: 42
symbol_name: LegacyMailer.SendInvoice
engine: knip | ts-prune | tsr | vulture | ruff | dotnet-analyzers | pmd | error-prone |
        clang-tidy | cppcheck | gcc | codeql | manual
rule_id: IDE0051 | F401 | bugprone-unused-private-field | knip/unused-export | ...
possible_dynamic_usage: true | false                  # reflection / DI / plugin / deserialization / ORM
suggested_action: delete | keep-with-annotation | needs_human_review
message: "Private method LegacyMailer.SendInvoice has no callers in the app entry-point graph"
fix: "Delete src/services/legacy_mailer.cs:42–58 and the dependent test in tests/legacy_mailer_test.cs"
reference: "https://learn.microsoft.com/dotnet/fundamentals/code-analysis/style-rules/ide0051"
```

The integrator uses `confidence` and `possible_dynamic_usage` to weight findings. A `confidence: low` single-tool unverified hit does not block phase advancement on its own. A `confidence: high` finding with `possible_dynamic_usage: false` is delete-on-sight (after human approval at Gate 2/3, per the human-gate rule). Anything `feature-flagged` is always `needs_human_review`.

## Scan methodology

1. **Classify the target.** Application, library, or mixed (monorepo with both). Emit `target_kind` on every letter.
2. **Build the entry-point set.** HTTP routes, CLI commands, scheduled jobs, plugin manifests, public exports (library mode), test entry points, FFI exports.
3. **Run the language-default tool.** knip / vulture+ruff / Roslyn / PMD / clang-tidy / cppcheck / SQL stats.
4. **Cross-reference dynamic patterns.** Reflection, DI container scans, deserialization, ORM callbacks, feature flags.
5. **Downgrade confidence where dynamic usage is possible.** Set `possible_dynamic_usage: true`; `suggested_action: needs_human_review`.
6. **Emit one letter per finding.** Severity `critical` on the wire; confidence carries the signal.

## Output format (human-readable report)

```markdown
## Dead Code Report

### Summary
| Category | Count | Confidence | Action |
|----------|-------|------------|--------|
| Unreachable code | 8  | HIGH    | Delete |
| Unused imports / usings | 47 | HIGH | Auto-fix |
| Unused private members | 12 | HIGH | Delete |
| Unused exports (app) | 15 | MEDIUM | Verify + delete |
| Orphan files | 3 | MEDIUM | Verify + delete |
| Unused dependencies | 5 | HIGH | Uninstall |
| Dead DB columns | 4 | MEDIUM | Verify BI + drop in migration |
| Feature-flagged branches | 2 | n/a | Human review |

### Unreachable code (HIGH, delete)
| File | Line | Symbol | Reason |
|------|------|--------|--------|
| api/handler.ts | 56 | handle | Statement after unconditional return |
| services/auth.ts | 89 | check | Branch gated on literal `false` |

### Unused dependencies (HIGH, uninstall)
| Package | Reason | Confidence |
|---------|--------|------------|
| moment | Replaced by date-fns; no remaining imports | HIGH |
| lodash | Only `.get`/`.set` used; replaceable with optional chaining | MEDIUM |

### Needs human review
| File | Symbol | Why |
|------|--------|-----|
| services/billing.ts | computeLegacyTax | Gated by feature flag `legacyTax` |
| repos/users.py | UserRepo._fetch | Possible getattr usage in api/admin.py |
```

## Special considerations

- **Library mode forbids `unused-export` findings.** Public API is reachable-by-assumption. Only `internal` / `private` / `__all__`-excluded symbols are candidates.
- **Generated code is whitelisted.** `*.g.cs`, `*.pb.go`, `*_pb2.py`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`, `.next`, `target`.
- **Test code is an entry point** — symbols only referenced by tests are NOT dead unless the tests themselves are dead.
- **Cross-pillar coordination.** Coordinate with [[code-smell-detector]] (dispensables category), [[duplicate-code-detector]] (a "dead" helper that duplicates a live one), [[technical-debt-tracker]] (migration-path debt), and [[dependency-auditor]] (unused-dep findings overlap).
- **Never delete on static signal alone for SQL / public library / dynamic-language reflection-heavy code.** Require a second signal — either production telemetry, human review, or a corroborating tool — before the letter is `suggested_action: delete`.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
