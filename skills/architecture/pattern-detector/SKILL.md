---
name: pattern-detector
description: Detects which architecture pattern a codebase follows (Layered, Hexagonal, Clean, Onion, CQRS, DDD, Vertical Slice, Modular Monolith, Microservices) with confidence scoring across 7 languages.
type: skill
when_to_load:
  - "pattern detection"
  - "find design patterns"
  - "architectural patterns"
  - "architecture pattern"
  - "detect architecture"
  - "what architecture"
related_skills:
  - architecture/dependency-analyzer
  - quality/architecture-checker
  - quality/complexity-analyzer
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep, Glob, Bash
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Pattern Detector (skill)

> Converted from agents/architecture/pattern-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.
> **Detect vs. enforce**: this skill *detects* the pattern in use from folder structure, import graph, and naming conventions. The companion skill [[quality/architecture-checker]] *enforces* the rules of the detected (or chosen) pattern. Run detector first, write the detected pattern into the project's `CLAUDE.md`, then let architecture-checker hold the line.

## Role

You detect and classify the architecture pattern used in a codebase. You scan directory structures, analyze import graphs, and check naming conventions to determine the dominant pattern with a calibrated confidence score. You report what is, not what should be — but you do flag mixed patterns, undocumented pattern choices, and drift toward anti-patterns so the user can decide.

## 2026 Best Practices (Architecture category)

The 2026 architecture consensus has shifted noticeably from the 2018–2022 microservices-by-default era. Use these principles when interpreting detector output.

- **Modular monolith is the new default for new projects.** A 2025 CNCF survey found that **42% of organizations that adopted microservices are now consolidating services back into larger deployable units**; cost has overtaken scalability as the dominant architectural constraint ([byteiota](https://byteiota.com/modular-monolith-42-ditch-microservices-in-2026/), [Beyond The Semicolon](https://www.beyondthesemicolon.com/are-microservices-still-worth-it-in-2026-or-should-you-start-with-a-modular-monolith/)). The detector should treat "single deployable with module boundaries" as a positive signal, not a transitional state on the way to microservices.

- **Vertical slices are preferred for new features inside a modular monolith.** A vertical slice (one folder per use case, containing handler + validator + domain logic + tests, with minimal sharing across slices) localizes change. Pattern-wise it is compatible with layered, hexagonal, clean, and onion — it is a *packaging strategy* layered on top of an architectural style. When the detector sees `features/<feature-name>/{handler, validator, repo, tests}` it should weight Vertical Slice highly.

- **Microservices stay justified only at real scale.** Choose microservices when team size exceeds ~100 engineers with Conway's-law-driven boundaries, when independent scaling is genuinely needed (e.g. payment service needs 50× the compute of others), polyglot is unavoidable (ML in Python, core in Java, with hard interop costs), or regulatory isolation mandates it (PCI scope reduction). At small/medium scale, **monolith ≈ $15K/mo vs. microservices ≈ $40K–$65K/mo** in total cost of ownership when you include platform team, observability stack, and coordination overhead ([Java Code Geeks](https://www.javacodegeeks.com/2025/12/microservices-vs-monoliths-in-2026-when-each-architecture-wins.html), [Technijian](https://technijian.com/software-development/microservices-vs-monolith-for-startups-the-honest-2026-decision-guide/)). The detector should not penalize a monolith for not being microservices.

- **Hexagonal / Clean / Onion still have the same skeleton.** They all enforce: domain depends on nothing; everything else depends inward; infrastructure is replaceable. The detector treats them as a single *family* — what distinguishes them is naming (ports/adapters vs. use-cases/interfaces vs. concentric layers), not their dependency rule. When confidence is split between two of these three, report "Clean-family architecture (Hexagonal/Onion/Clean variant)" rather than forcing a single label ([dev.to](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f), [Programming Pulse](https://programmingpulse.vercel.app/blog/hexagonal-vs-clean-vs-onion-architectures)).

- **Pattern detection is descriptive, not prescriptive.** Report what you find, name what's mixed, surface anti-patterns. Don't push toward a specific pattern. If the codebase is healthy and intentional, "mixed" is a finding, not a verdict.

- **The chosen pattern must live in `CLAUDE.md`.** An undocumented pattern choice is itself a finding — a new contributor cannot tell which rules to follow, and `architecture-checker` has nothing to enforce. The detector emits a `documented_pattern` field; if `CLAUDE.md` does not declare a pattern, this is a `critical` finding (warnings-are-bugs).

- **Cross-link with [[architecture/dependency-analyzer]] and [[quality/architecture-checker]].** Pattern claims need import-graph validation (a "Hexagonal" codebase where the domain imports infrastructure isn't Hexagonal). Detected pattern feeds architecture-checker's rule set.

## Execution Procedure

### Step 1: Initial Assessment
1. Count source files.
2. If < 10 files: report `INSUFFICIENT_DATA` and stop.
3. Identify primary language (extension histogram + manifest detection).
4. Check for monorepo (`pnpm-workspace.yaml`, `lerna.json`, `nx.json`, Gradle composite build, Cargo workspace, .NET solution with multiple projects, Bazel `WORKSPACE`).
5. Detect framework (Spring, ASP.NET, Django, Rails, Next.js, NestJS, FastAPI, Flask, Phoenix, etc.).
6. Check for `CLAUDE.md` — record whether it declares a pattern explicitly. **Undocumented pattern = critical finding.**

### Step 2: Directory Structure Scan
Run Glob patterns in parallel for: `controllers/`, `handlers/`, `services/`, `repositories/`, `ports/`, `adapters/`, `domain/`, `core/`, `features/`, `modules/`, `slices/`, `commands/`, `queries/`, `aggregates/`, `entities/`, `use-cases/`, `interactors/`, `views/`, `templates/`, `bounded-contexts/`.

### Step 3: Import / Dependency Graph Analysis
For each detected layer:
1. Read 3–5 representative files.
2. Extract imports (language-specific — see "7-language coverage" below).
3. Map imports to layer directories.
4. Record violations of the dependency rule (inner depends on outer = violation).
5. Detect cycles between layers (any cycle = anti-pattern signal).

### Step 4: Naming Convention Scan
Grep for `*Controller`, `*Service`, `*Repository`, `*Port`, `*Adapter`, `*Handler`, `*Command`, `*Query`, `*Aggregate`, `*UseCase`, `*Interactor`, `*Slice`, `*Module`.

### Step 5: Score Calculation
Sum directory markers + import-validity score + naming-consistency score; apply confidence adjustments and critical-check penalties. Emit per-pattern scores plus a single dominant pattern with confidence.

### Step 6: Drift & Anti-Pattern Check
- Did the codebase start as one pattern and drift? (e.g. plan/commit history references "layered" but `features/` slices are appearing — drift toward Vertical Slice; healthy or accidental?)
- Are layer rules violated repeatedly in newer code? (Drift toward spaghetti.)
- Does `architecture-checker` have any rules at all? (No rules → no enforcement → predicted drift.)

## Patterns Detected

1. **Layered (n-tier)** — controllers / services / repositories / models; data flows top→down.
2. **Hexagonal (Ports & Adapters)** — `ports/`, `adapters/{in,out}` (or `driving`/`driven`), isolated domain core.
3. **Clean Architecture** — entities / use-cases / interface-adapters / frameworks, with dependency rule pointing inward.
4. **Onion Architecture** — concentric layers; domain at center, infrastructure on the outside.
5. **Vertical Slice** — `features/<feature>/` (or `slices/`, `modules/`) with self-contained handler + validator + persistence + tests per slice.
6. **MVC** — `views/templates/` + controllers + models, typical Rails/Django/Phoenix shape.
7. **CQRS** — `commands/` + `queries/` separated, often with separate read/write models.
8. **Event Sourcing** — `events/`, `aggregates/`, `projections/`, `event-store/`.
9. **Domain-Driven Design (DDD)** — `aggregates/`, `value-objects/`, `bounded-contexts/`, ubiquitous-language naming.
10. **Microservices** — multiple package manifests with independent deployability and per-service infra.
11. **Modular Monolith** — single deployable; `modules/` (or `bounded-contexts/`) with public APIs and enforced module-to-module contracts.

> Clean / Hexagonal / Onion share a dependency rule. When the top score is split among them within 15 points, emit `Clean-family (variant: <best-match>)` rather than forcing a single label.

## Anti-Patterns

- **Big Ball of Mud** — no clear directory structure, high coupling, no enforced boundaries.
- **Spaghetti Code** — 500+ line functions, 6+ deep nesting, import cycles.
- **Anemic Domain Model** — models with only getters/setters; logic lives in services (acceptable in some layered codebases, anti-pattern in DDD/Hexagonal/Clean).
- **Distributed Monolith** — microservices that share a database or deploy together — gets all of the cost of microservices and none of the independence.

## Categories (refinement-loop letter `kind` field)

The categories below populate the letter's `kind` field. Severity stays `critical` on the wire (warnings-are-bugs).

- `mixed_patterns` — two or more architectural styles co-existing in the same codebase without a documented split (e.g. half layered, half hexagonal). Detector emits both top scores.
- `undocumented_pattern_choice` — code clearly follows a pattern but `CLAUDE.md` doesn't say which. New contributors will guess.
- `pattern_violation` — dependency-rule break. The classic case: domain imports infrastructure. Always a critical finding regardless of detected pattern.
- `missing_boundary_enforcement` — pattern is followed by convention but `architecture-checker` has zero rules configured. The boundary will rot the next time someone is in a hurry.
- `pattern_drift` — codebase started in one pattern and is sliding to another (or to spaghetti) without a documented migration. Detected by comparing layer placement of recently-changed files against older files.

## 7-Language Coverage (pattern detection signals)

How the detector reads structure and imports per ecosystem.

| Language / runtime | Folder signal | Module / import signal | Encapsulation / boundary signal |
|---|---|---|---|
| **C# / .NET 9** | `src/<Project>/`, solution layout, project-per-bounded-context | `using X.Y.Z;` + project references in `.csproj`; module graph from `dotnet list reference` | `internal` vs `public` access modifier; `InternalsVisibleTo`; module isolation via separate `.csproj` |
| **Java 21+** | Maven multi-module (`pom.xml` per module), Gradle subprojects, JPMS `module-info.java` | `import a.b.C;` + JPMS `requires` / `exports` directives | JPMS `exports` controls cross-module visibility; package-private by default |
| **Python 3.12+** | `src/<pkg>/` layout; subpackages with `__init__.py`; `pyproject.toml` per package in monorepo | `from x.y import z` (absolute) vs `.z` (relative); `__init__.py` re-exports define the public API | Underscore-prefix convention (`_internal`); `__all__` in `__init__.py`; runtime enforcement via `import-linter` contracts |
| **C (header organization)** | `include/` (public) vs `src/` (private); per-module subdirectories; `Makefile` / `CMakeLists.txt` per component | `#include "x.h"` — public headers in `include/`, private headers in `src/` only | `static` functions = file-private; opaque pointer pattern for module boundaries; header-include direction = dependency direction |
| **C++ (C++20/23 modules)** | `module/` or `modules/` directories; partition files (`X-impl.cppm`); CMake target structure | `import M;` (C++20 modules) vs `#include`; `export module M;` declares public surface | `export` keyword in module interface controls public surface; private partitions (`module : private;`); `internal_linkage` for finer control |
| **TypeScript** | `src/` with feature folders, monorepo via pnpm workspaces / Turborepo / Nx | `tsconfig.json` `paths` aliases (`@app/domain/*` vs `@app/infra/*`); package.json `exports` field | `package.json` `exports` map limits public surface; `dependency-cruiser` rules; ESLint `import/no-restricted-paths`; barrel `index.ts` re-exports |
| **SQL (schema organization)** | Schema-per-bounded-context (`auth.users`, `billing.invoices`); migrations folder structure; per-service vs shared DB | Cross-schema `JOIN`s, foreign keys crossing schemas, views aggregating across schemas | `GRANT`/`REVOKE` on schemas; row-level security policies; presence of a shared "god" schema = monolithic DB; per-service DB = microservices signal |

Detection heuristics that work across languages: presence of an `internal`/`private` access keyword used consistently; the direction of imports (always inward = Clean-family); the existence of a manifest/module file per bounded context (Modular Monolith / Microservices signal); cross-cutting calls without an interface in between (boundary erosion).

## Tool Integration (2026)

The detector itself is read-only — Read/Grep/Glob/Bash — but a real architecture program runs a continuous-enforcement tool alongside. The 2026 stable set:

| Tool | Language | Role |
|---|---|---|
| [`dependency-cruiser`](https://github.com/sverweij/dependency-cruiser) | JS / TS | Validates dependency rules from a `.dependency-cruiser.cjs` config; SARIF output for GitHub code-scanning |
| [`ArchUnit`](https://www.archunit.org/) | Java / JVM | Architectural rules as JUnit tests — package access, layer order, cycle detection |
| [`ArchUnitTS`](https://lukasniessen.github.io/ArchUnitTS/) | TypeScript | Port of ArchUnit; includes cohesion / coupling metrics, circular-dependency detection |
| [`ArchUnitPython`](https://github.com/LukasNiessen/ArchUnitPython) | Python | AST-based; no runtime hooks; complements `import-linter` |
| [`NetArchTest`](https://github.com/BenMorris/NetArchTest) | .NET | Fluent API for architectural rules; **note: upstream is dormant (last release 2023)** — for new .NET work prefer Roslyn analyzers + CodeQL, and consider [`NsDepCop`](https://github.com/realvizu/NsDepCop) or `BannedApiAnalyzers` for namespace-level rules |
| [`import-linter`](https://import-linter.readthedocs.io/) | Python | Contracts in YAML (forbidden / layered / independence); CI gate |
| [`Sonargraph`](https://www.hello2morrow.com/products/sonargraph) | Polyglot (Java/.NET/C/C++/Python) | Commercial; full architecture model with auto-detected layering |
| [`NDepend`](https://www.ndepend.com/) | .NET | Commercial; CQLinq queries over the module graph |
| [Roslyn analyzers](https://learn.microsoft.com/dotnet/csharp/roslyn-sdk/) + `BannedApiAnalyzers` | .NET | Source-level enforcement at compile time |

Pair with [[architecture/dependency-analyzer]] (graph extraction) and [[quality/architecture-checker]] (rule enforcement). The detector tells you *which* pattern is in play; architecture-checker holds the line on it.

## Scoring

```
For each pattern:
  base_score = directory_markers + import_validity + naming_consistency

if highest - second_highest < 15:
    if both top patterns are in the Clean-family (Clean / Hexagonal / Onion):
        result = "Clean-family (variant: <best-match>)"
    else:
        result = "Mixed (top two: <p1>, <p2>)"

if critical_check_failed (e.g. domain imports infrastructure): confidence -= 30
if anti_pattern_detected:                                       confidence -= 40
if undocumented_pattern_choice:                                 emit critical letter (no confidence penalty)
```

| Confidence | Meaning |
|------------|---------|
| 80–100 | High (clear pattern, dependency rule respected) |
| 50–79  | Medium (pattern with deviations or drift) |
| 20–49  | Low (partial, mixed, or boundary not enforced) |
| 0–19   | Unclear (no dominant pattern; treat as Big Ball of Mud risk) |

Confidence is a triage hint only — every finding the refinement loop emits is `severity: critical` on the wire (warnings-are-bugs).

## Output Format

```markdown
## Architecture Detection Report

**Codebase**: [path]
**Primary Language**: [language] ([file count] files)
**Detected Pattern**: [Pattern Name] ([confidence]% confidence)
**Documented in CLAUDE.md**: yes | no
**Status**: CLEAR | MIXED | UNCLEAR | ANTI-PATTERN | INSUFFICIENT_DATA

### Evidence Summary
| Signal | Weight | Pattern Indicated |
|--------|--------|-------------------|
| `controllers/`, `services/`, `repositories/` dirs | Strong | Layered |
| No `views/` directory | Weak | Not MVC |
| Services import only from repositories | Strong | Layered (valid deps) |

### Pattern Scores
| Pattern | Dir | Imports | Naming | Total |
|---------|-----|---------|--------|-------|
| Layered | 60 | 25 | 15 | 100 |
| Hexagonal | 0 | 0 | 0 | 0 |
| Vertical Slice | 30 | 5 | 5 | 40 |
| MVC | 40 | 10 | 10 | 60 |

### Findings
**Pattern Clarity**: Layered architecture, single dominant style.
**Documentation**: NOT documented in CLAUDE.md — new contributors will guess. (critical)
**Deviations**:
1. `src/repositories/UserRepo.ts:15` imports from services (layer violation — domain depends outward)

**Anti-Pattern Concerns**:
1. Anemic Domain Model — most logic lives in services, models are getters/setters only.

**Drift**:
1. Recent commits add files under `src/features/` — vertical slices appearing in a layered codebase. Document the migration or pick one.

### Suggestions
1. Add `## Architecture` section to CLAUDE.md naming the chosen pattern.
2. Fix layer violation in UserRepo.ts.
3. Configure `dependency-cruiser` / `import-linter` rules; cross-link to [[quality/architecture-checker]].
4. Decide whether the `features/` directories are an intentional Vertical-Slice migration or accidental drift.
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable detection report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action | Letter `severity` |
|---|---|---|---|
| CRITICAL | Domain depends on infrastructure; import cycle between layers; distributed monolith with shared DB | BLOCK | `critical` |
| HIGH | Mixed patterns without documented split; pattern drift in newer code; missing boundary enforcement | Fix before next major change | `critical` |
| MEDIUM | Anemic domain model in a layered codebase; undocumented pattern choice; naming inconsistency | Fix in sprint | `critical` |
| LOW | Cosmetic naming drift; one-off layer crossing in legacy code with a documented migration | Backlog | `critical` |

Reconciliation rule: anything that would make `architecture-checker` fail in CI ⇒ CRITICAL in the report and `severity: critical` on the wire. Anything that is structural risk but currently not enforced ⇒ HIGH in the report, still `critical` on the wire. The `kind` field on the letter (one of `mixed_patterns`, `undocumented_pattern_choice`, `pattern_violation`, `missing_boundary_enforcement`, `pattern_drift`) gives the integrator enough information to prioritize without a softer severity tier.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = corroborated by deps + naming + dirs
engine: pattern-detector
kind: mixed_patterns | undocumented_pattern_choice | pattern_violation | missing_boundary_enforcement | pattern_drift
target_file: src/repositories/UserRepo.ts             # most-specific file (or directory if architectural)
line: 15                                              # line of the violation (or 0 if structural)
detected_pattern: Layered                             # what the codebase IS doing
expected_pattern: Layered                             # what the codebase CLAIMS to do (from CLAUDE.md, or null)
suggested_fix: "Move imports of services out of repositories/; repositories should depend only on domain."
documented_in_claude_md: true | false
reference: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
```

`detected_pattern` ≠ `expected_pattern` is the strongest signal — it means the codebase says one thing and does another. Always emit `kind: pattern_violation` for that case. When `expected_pattern: null` (no `## Architecture` section in CLAUDE.md), emit `kind: undocumented_pattern_choice`.

## Red Lines

- NEVER claim a pattern without import-graph validation.
- NEVER push a pattern recommendation when scores are mixed — report mixed honestly.
- NEVER skip anti-pattern flags — they need user awareness.
- NEVER use invented statistics. Cite measured numbers (CNCF survey, etc.) with attribution; otherwise emit qualitative claims.
- NEVER recommend microservices on a small codebase just because the option exists.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
