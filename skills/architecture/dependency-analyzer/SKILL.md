---
name: dependency-analyzer
description: Builds the import graph and detects circular dependencies, layer violations, instability mismatches, and cross-module coupling.
type: skill
when_to_load:
  - "dependency analysis"
  - "module dependencies"
  - "dependency graph"
  - "circular dependency"
  - "module boundary"
  - "import graph"
  - "afferent coupling"
  - "efferent coupling"
  - "instability metric"
related_skills:
  - architecture/pattern-detector
  - quality/architecture-checker
  - quality/code-smell-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep, Glob, Bash
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Dependency Analyzer (skill)

> Converted from agents/architecture/dependency-analyzer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You build the dependency graph of a codebase and detect circular dependencies, layer violations, instability mismatches, and cross-module coupling problems. You are the **detection** layer — you produce findings. You do not rewrite rules (that is [[architecture-checker]]) and you do not name design patterns (that is [[pattern-detector]]). Cross-link both: a "MVC violation" claim from [[pattern-detector]] needs a concrete edge from this skill to be actionable; an architecture rule from [[architecture-checker]] needs this skill's graph to enforce it.

## 2026 Best Practices (Architecture category)

- **Directed acyclic dependency graph**: the module dependency graph MUST be a DAG. Cycles — direct or indirect — are blockers. New cycles introduced in a PR = BLOCK at Gate 3. Established tools (madge, dependency-cruiser, jdeps, JDepend, import-linter, pydeps) all use DFS-based cycle detection; treat any one of them flagging a cycle as ground truth pending a second-engine corroboration.
- **Low efferent coupling (Ce), high cohesion**: a module that imports from too many places is fragile to upstream change. Set a Ce budget per module type (utils: 0–3, domain: 0–5, service: 0–10, controller: 0–15) and flag overshoots.
- **Instability metric in CI**: `I = Ce / (Ca + Ce)` where Ca = afferent coupling (who depends on me), Ce = efferent (whom I depend on). I=0 → maximally stable; I=1 → maximally unstable. This is the JDepend-canonical definition (Clarkware / Martin). Track per-module I in CI and flag drift between commits.
- **Stable Abstractions Principle**: stable modules (I ≈ 0) should be abstract (interfaces / type-only / pure data). The **Distance from Main Sequence** D = |A + I − 1| where A is the abstract-fraction. D > 0.5 = instability_mismatch finding — concrete code that everything depends on, or abstract code that nothing depends on.
- **Deprecate before remove**: never sever a module dependency without first marking the export `@deprecated` (or language equivalent) for at least one minor release. The deprecation must include the migration target. Removing a public export without that grace period = high finding. Cross-link [[architecture-checker]] for the deprecation policy.
- **Module ownership clear**: every module declares an owner (CODEOWNERS / package manifest). Unowned modules with Ca > 5 are an organizational risk finding.
- **Type-only imports are different**: TypeScript `import type` and Python `if TYPE_CHECKING:` blocks do not cause runtime cycles. Report them in a separate `type_only_cycles` bucket — they are still smells, but not blockers.
- **Cross-link with [[pattern-detector]]**: dependency findings are how you validate or refute a pattern claim. If pattern-detector says "this is Hexagonal Architecture," verify by checking that the domain layer has zero edges into infrastructure.

## Categories

| Category | Definition | Default severity |
|---|---|---|
| `circular_dependency` | A cycle exists in the runtime dependency graph (direct A↔B, indirect A→B→C→A, or deep ≥4) | high (direct), medium (indirect), low (type-only) |
| `high_efferent_coupling` | A module's Ce exceeds the budget for its layer (depends on too much) | medium |
| `high_afferent_coupling_without_abstraction` | A module has Ca ≥ 8 but is concrete (god class / god module) | high |
| `instability_mismatch` | D = \|A + I − 1\| > 0.5 — abstract types that nothing depends on, or concrete code that everything depends on | medium |
| `missing_module_boundary` | A "long-distance call": a deep module reaches across the project without going through a public boundary | medium |
| `layer_violation_high` | Reverse-direction import that crosses two or more layers (e.g., controller → repository) | high |
| `layer_violation_medium` | Reverse-direction import across one layer (e.g., service → controller) | medium |

## Quick Reference

| Detection Type | Severity | Penalty | Example |
|----------------|----------|---------|---------|
| Direct cycle (A→B→A) | High | -1.0 | UserService ↔ AuthService |
| Indirect cycle (A→B→C→A) | Medium | -0.5 | Order → Inventory → Payment → Order |
| Type-only cycle | Low | -0.1 | `import type` ring (TS) / `TYPE_CHECKING` ring (Py) |
| Layer violation (high) | High | -0.4 | Controller imports Repository |
| Layer violation (medium) | Medium | -0.3 | Service imports Controller |
| High efferent coupling (Ce over budget) | Medium | -0.3 | service module imports 18 things |
| God module (Ca ≥ 8, concrete) | High | -0.4 | concrete class everyone depends on |
| Instability mismatch (D > 0.5) | Medium | -0.3 | abstract module with no callers |
| Missing module boundary | Medium | -0.2 | deep reach across project |

**Score Range:** 0–10 (10 = perfect, <5 = needs attention)

## Performance

| Files | Target |
|-------|--------|
| < 100 | < 30 seconds |
| 100-500 | < 2 minutes |
| 500-1000 | < 5 minutes |
| 1000+ | Use incremental mode (diff-only, transitive callers) |

## Execution Procedure

### Step 1: Identify Source Files
Glob the primary language(s), excluding `node_modules/`, `dist/`, `build/`, `vendor/`, `target/`, `bin/`, `obj/`, `__pycache__/`, `.venv/`.

### Step 2: Extract Imports (language-aware)
- **TS/JS**: `import ... from`, `require(...)`, dynamic `import()`, `import type` (tag separately).
- **Python**: `import X`, `from X import Y`, distinguish `if TYPE_CHECKING:` blocks.
- **Java**: `import a.b.C;` plus same-package implicit edges.
- **C# / .NET**: `using A.B;` plus assembly references in `.csproj`.
- **C**: `#include "header.h"` (project headers, not system).
- **C++ (20/23)**: `#include`, `import module;` (C++20 modules), `import :partition;`.
- **SQL**: foreign keys from `information_schema.referential_constraints` form the schema dependency graph.

### Step 3: Build Dependency Graph
For each file F, for each import I, add edge F → resolved(I). Resolve aliases (`paths` in `tsconfig.json`, `pyproject.toml`'s `[tool.poetry.packages]`, Java module-info). Tag each edge with `kind: runtime | type-only | test`.

### Step 4: Detect Circular Dependencies
DFS with `visited` and `on_stack` tracking. Tarjan's SCC for full-graph cycle detection on large repos. Classify:
- 2 nodes → direct (high)
- 3 nodes → indirect (medium)
- ≥ 4 → deep (low; usually symptom of missing boundary)
- All edges `type-only` → type-only cycle (low)

### Step 5: Detect Layer Violations
Define layer rules:
```
controllers → services, models, utils
services → repositories, models, utils
repositories → models, utils
domain → models, utils
models → utils
utils → (nothing)
```
Flag any reverse-direction import. Cross more than one layer = high.

### Step 6: Calculate Coupling Metrics
```
Ca = afferent (files importing M)
Ce = efferent (files M imports)
I  = Ce / (Ca + Ce)        -- instability, 0..1
A  = abstract_types / total_types in M    -- abstractness, 0..1
D  = |A + I - 1|           -- distance from main sequence
```
Flag `I > 0.7` on a module with `Ca > 5` (unstable AND depended on).
Flag `D > 0.5` as instability_mismatch.

### Step 7: Detect Long-Distance Calls (missing module boundary)
A "long-distance call" = an edge F → G where path-depth(F, G) > 2 in the module tree AND there is no `index.ts` / `__init__.py` / `package-info.java` / public re-export between them. Flag as missing_module_boundary.

### Step 8: Generate Report

## Layer Hierarchy

```
+-------------------------+
| controllers / handlers  |  <- Top
+-------------------------+
| services / use-cases    |
+-------------------------+
| repositories / gateways |
+-------------------------+
| domain / entities       |
+-------------------------+
| models / types          |
+-------------------------+
| utils / shared          |  <- Bottom (anyone can use)
+-------------------------+
Flow DOWNWARD only.
```

## 7-language coverage

### TypeScript / JavaScript
```bash
# dependency-cruiser: rules-based, supports CommonJS, ESM, AMD, TS path mapping
npx depcruise --include-only "^src" --output-type err src
npx depcruise --config .dependency-cruiser.cjs --output-type json src > deps.json
# madge: focused on cycles; useful in CI as a fast first pass
npx madge --circular --extensions ts,tsx src/
npx madge --image graph.svg --extensions ts,tsx src/
```
`.dependency-cruiser.cjs` rule for "no controller -> repository":
```js
forbidden: [{
  name: 'no-controller-to-repo',
  severity: 'error',
  from: { path: '^src/controllers' },
  to:   { path: '^src/repositories' },
}]
```

### Python (3.12+)
```bash
# import-linter: declarative contracts (layers, independence, forbidden)
lint-imports --config .importlinter
# pydeps: visual + cycle detection
pydeps mypackage --show-cycles --max-bacon 2 --noshow -o deps.svg
# pyan3 / grimp underlie import-linter; grimp 3.14+ is the current graph engine
```
`.importlinter` layered contract:
```ini
[importlinter:contract:layered]
name = Layered architecture
type = layers
layers =
    myapp.controllers
    myapp.services
    myapp.repositories
    myapp.domain
    myapp.models
    myapp.utils
```

### Java (21+)
```bash
# jdeps ships with the JDK; --check on a modular project flags split packages
jdeps --multi-release 21 --check com.example.myapp build/libs/app.jar
# JDepend computes Ca/Ce/I/A/D per package
java jdepend.swingui.JDepend build/classes/java/main
# ArchUnit: runtime test library, fail the build on rule violation
```
ArchUnit rule (JUnit 5):
```java
@AnalyzeClasses(packages = "com.example.myapp")
class ArchitectureTest {
    @ArchTest static final ArchRule no_cycles =
        slices().matching("com.example.myapp.(*)..").should().beFreeOfCycles();
    @ArchTest static final ArchRule layered =
        layeredArchitecture().consideringAllDependencies()
            .layer("Controllers").definedBy("..controllers..")
            .layer("Services").definedBy("..services..")
            .layer("Repositories").definedBy("..repositories..")
            .whereLayer("Controllers").mayNotBeAccessedByAnyLayer()
            .whereLayer("Services").mayOnlyBeAccessedByLayers("Controllers")
            .whereLayer("Repositories").mayOnlyBeAccessedByLayers("Services");
}
```

### C# / .NET 9
```bash
# NDepend (commercial) computes I, A, D, RelationalCohesion; CI integration via NDepend.Console
NDepend.Console MySolution.sln /OutDir reports/
# Roslyn analyzers: write a DiagnosticAnalyzer that walks SymbolUsage / SemanticModel.GetSymbolInfo
# "DependsOn"-style queries via the Roslyn API on the Compilation graph
# Free alternative: NsDepCop enforces namespace dependency rules at build time
dotnet add package NsDepCop.Analyzers
```
`config.nsdepcop`:
```xml
<NsDepCopConfig IsEnabled="True" ChildCanDependOnParentImplicitly="True">
  <Allowed From="MyApp.Controllers" To="MyApp.Services" />
  <Disallowed From="MyApp.Controllers" To="MyApp.Repositories" />
</NsDepCopConfig>
```

### C (header includes-graph)
```bash
# include-what-you-use (IWYU) — Clang-based; flags missing/superfluous #includes
iwyu_tool.py -p build/ src/
# cinclude2dot generates a Graphviz dot file from includes
cinclude2dot --src=src > includes.dot && dot -Tsvg includes.dot -o includes.svg
# Clang scan-build / -MD -MF .d files give per-translation-unit dependency facts
clang -MD -MF deps/foo.d -c src/foo.c
```
Cycle detection on the header graph: run `tsort` on the merged `.d` files; non-empty output = cycle.

### C++ (20/23)
```bash
# IWYU works on C++ too; add --no_fwd_decls if you prefer concrete includes
iwyu_tool.py -p build/ src/
# Modules (C++20): the build system already produces a module dependency manifest
# CMake (3.28+) exports module deps under .CXXModules/
# deplint / cpp-dependencies for legacy header-only projects
cpp-dependencies --dir src --graph deps.dot
```
For C++20 named modules, treat `import foo;` and `import :partition;` as graph edges; the build system's BMI cache encodes the topological order.

### SQL (FK graph via information_schema)
```sql
-- Build the schema dependency graph: each row is an edge child.table -> parent.table
SELECT tc.table_name AS child, ccu.table_name AS parent, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```
Apply DFS for cycles (rare but possible with deferrable FKs). Long FK chains (>5) indicate missing aggregate boundaries — flag as missing_module_boundary at the data layer.

## Tool Integration (2026)

| Tool | Languages | Strengths | When |
|------|-----------|-----------|------|
| **dependency-cruiser** | TS/JS/CoffeeScript | Declarative rules in JS config, CI-friendly, JSON/SARIF output, supports path mappings | Every PR, TS/JS projects |
| **madge** | TS/JS | Fast cycle detection via DFS, SVG visualization, low config | First-pass cycle check |
| **JDepend** | Java | Computes Ca, Ce, I, A, D per package; the canonical instability metric tool | Java analysis baseline |
| **ArchUnit** | Java/Kotlin | Runtime architecture tests fail the build on rule violation | Java/Kotlin CI |
| **jdeps** | Java | Ships with JDK; multi-release jar aware; split-package detection | Java JDK-only environments |
| **NDepend** | C#/.NET | I/A/D plus dozens of CQLinq queries; commercial | .NET shops with budget |
| **NsDepCop** | C#/.NET | Free Roslyn-based namespace-dependency analyzer | .NET CI without NDepend |
| **pydeps** | Python | Bytecode-level imports, SVG, highlights cycles in blue | Python visual review |
| **import-linter** | Python | Declarative contracts: layered, independence, forbidden | Python CI gate |
| **include-what-you-use (IWYU)** | C/C++ | Clang-based; finds missing and superfluous #includes | C/C++ pre-commit |
| **cpp-dependencies** | C++ | Builds include/module graph for legacy headers | C++ legacy audits |

Aggregate outputs to SARIF or a normalized JSON so the integrator can dedupe across tools. A cycle reported by both madge AND dependency-cruiser raises confidence to `high`.

## Output Format

```markdown
## Dependency Analysis Report

### Summary
| Metric | Value | Status |
|--------|-------|--------|
| Circular Dependencies | 2 | CRITICAL |
| Layer Violations | 3 | WARNING |
| High Coupling Modules | 1 | WARNING |
| Instability Mismatches (D > 0.5) | 2 | WARNING |
| Coupling Score | 7.2/10 | GOOD |

### Circular Dependencies

#### Cycle 1 (Direct - HIGH)
```
src/services/UserService.ts
    -> imports (line 5)
src/services/AuthService.ts
    -> imports (line 8)
src/services/UserService.ts (CYCLE!)
```

**Fixes**:
1. Extract shared logic to `src/services/shared/AuthHelpers.ts`
2. Use dependency injection
3. Introduce event bus for cross-service communication

### Layer Violations

#### Violation 1 (HIGH)
- File: `src/controllers/UserController.ts:15`
- Import: `import { UserRepository } from '../repositories/UserRepository'`
- Rule: Controllers should not import directly from repositories
- Fix: Replace with `import { UserService } from '../services/UserService';`

### Cross-Module Coupling
| Module | Ca | Ce | I | A | D | Assessment |
|--------|----|----|----|----|----|------------|
| user/ | 8 | 2 | 0.20 | 0.10 | 0.70 | Stable (core) — but D>0.5 = should be more abstract |
| orders/ | 3 | 7 | 0.70 | 0.30 | 0.00 | Unstable but appropriately so |
| utils/ | 12 | 0 | 0.00 | 0.80 | 0.20 | Stable abstraction (leaf) — ideal |

### Overall Score: 7.2/10 (Good)

### Recommendations
1. **Fix Circular Dependencies** (Critical)
2. **Fix Layer Violations** (High)
3. **Reduce Module Coupling** (Medium)
4. Add dependency-cruiser / import-linter / ArchUnit rules to CI
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used for human-readable scan reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | New cycle introduced in this PR, controller→repository, domain→infrastructure | BLOCK |
| HIGH | Existing direct cycle, god module (Ca≥8 concrete), reverse-import across 2+ layers | BLOCK |
| MEDIUM | Indirect cycle, instability mismatch (D>0.5), Ce-over-budget, missing module boundary | Fix soon |
| LOW | Type-only cycle, deep cycle (≥4 nodes), modules with high I but low Ca | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(engine+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = two engines agree; low = single-engine unverified
engine: dependency-cruiser | madge | jdeps | jdepend | archunit | ndepend | nsdepcop | pydeps | import-linter | iwyu | cpp-dependencies | sql-fk | manual
corroborated_by: [<other engines that also flagged this>]
kind: circular_dependency | high_efferent_coupling | high_afferent_coupling_without_abstraction | instability_mismatch | missing_module_boundary | layer_violation_high | layer_violation_medium
target_file: src/services/UserService.ts
line: 5
cycle_path: ["src/services/UserService.ts", "src/services/AuthService.ts", "src/services/UserService.ts"]   # empty for non-cycle findings
metrics:                                            # populated where relevant
  ca: 8
  ce: 2
  instability: 0.20
  abstractness: 0.10
  distance: 0.70
type_only: false                                    # true if the cycle is TS import-type / TYPE_CHECKING only
delta_to_baseline: new | unchanged | regressed      # vs. .ctoc/baselines/dependency-graph.json (last accepted snapshot)
message: "Direct circular dependency between UserService and AuthService"
suggested_fix: "Extract the shared auth-token logic to src/services/shared/AuthHelpers.ts and have both services import it."
reference: https://www.archunit.org/userguide/html/000_Index.html
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-engine finding doesn't block phase advancement on its own, but two engines agreeing escalates it. `type_only: true` cycles are emitted but the integrator may defer them. `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings.

## Red Lines

- NEVER allow new circular dependencies (runtime) to merge to main
- NEVER allow direct controller -> repository imports
- NEVER allow domain -> infrastructure imports
- NEVER skip the analysis on a refactor PR that touches > 10 files
- NEVER suppress a finding by deleting the rule — only via `## Decisions Taken Under Ambiguity` with justification

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every cycle, layer violation, instability mismatch, or coupling-budget overshoot you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a cycle today is a build failure or a hot-reload deadlock after the next refactor. Architecture that ships green-with-cycles ships with known latent failures.
