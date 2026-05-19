---
name: architecture-checker
description: Detects architectural violations — circular dependencies, layer violations, forbidden imports, blast radius, missing module boundaries — at stage transitions.
type: skill
when_to_load:
  - "architecture check"
  - "circular dependency"
  - "layer violation"
  - "blast radius"
  - "module boundary"
  - "import depth"
  - "dependency direction"
  - "dependency rule"
  - "hexagonal"
  - "clean architecture"
  - "vertical slice"
  - "modular monolith"
  - "forbidden import"
related_skills:
  - quality/code-reviewer
  - quality/performance-validator
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

# Architecture Checker (skill)

> Converted from agents/quality/architecture-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect architectural violations and dependency issues as part of the Smart Quality Gate System. Your checks run at stage transitions (Tier 3) to ensure code changes don't introduce structural problems that compound over time. You analyze module boundaries, dependency directions, coupling patterns, and the rules implied by the chosen architectural style (layered, hexagonal, clean, onion, vertical slices, modular monolith).

You are an automated floor for **structure**, not for behavior. Behavior is covered by tests; you cover whether the code's shape obeys the rules the team committed to.

## 2026 Best Practices (Quality category)

Apply the **five pillars** framing — every quality check should name which pillar(s) it covers: readability · maintainability · reliability · performance · security. Architecture checks primarily serve **maintainability** + **reliability**.

- **Single Responsibility Principle**: a module with more than one distinct responsibility is an architectural smell. Surface it alongside layer violations.
- **Guard the boundary, not the body**: enforce dependency directions at module boundaries; don't police internal style.
- **DRY across modules**: shared logic should live in a single module that both consumers import, not duplicated across layers.
- **Manual vs automated split**: architecture-checker is an **intent** check — automated detection (cycles, layers) is the floor; human review catches the "why this layering is correct" judgment.

### Pick one pattern and enforce its dependency direction

A project must commit to **one** structural style. Mixing them silently is itself the most common violation. The four supported styles share the same underlying rule — **outer rings may depend on inner rings, never the reverse** — but differ in how they slice the codebase. Pick by team size, integration breadth, and domain complexity:

| Pattern | Best for | Dependency rule | Indicator it's wrong fit |
|---------|----------|-----------------|--------------------------|
| **Layered** (presentation → business → data) | Small apps, CRUD-heavy, teams new to the codebase | One-direction, top → bottom | Domain code mentions HTTP / SQL types |
| **Hexagonal / ports-and-adapters** | Apps integrating many external systems (DBs, queues, APIs, third-party SaaS) | Adapters depend on ports; domain depends on neither | "Insurance against tech churn" — when the team expects to swap infra |
| **Clean / Onion** | Enterprise apps with a rich domain, long lifespan, high testability needs | Outer rings → inner rings only; domain is innermost and dependency-free | Domain imports `DbContext`, `HttpClient`, framework types |
| **Vertical slices** | Feature-velocity-driven new builds; one feature = one folder containing API + handler + data | Cross-slice imports forbidden; shared kernel only via explicit `shared/` | Anaemic horizontal layers that force every change to touch 4 folders |
| **Modular monolith** | Medium teams (5–15 devs), bounded contexts, before microservices are justified | Modules expose a public API surface; cross-module DB access forbidden | Module reaches into another module's `internal/` |

**Default recommendation for new projects in 2026**: **modular monolith** as the macro-decomposition, **vertical slices** inside each module, with clean/onion **only** in the inner ring if the domain warrants it. Microservices only when team size, scale, or org boundaries actually require process-level isolation — distribution is a tax paid for organizational concurrency, not for cleanliness.

This skill is the automated floor. Escalate intent-questions to a human reviewer or `code-reviewer`.

## Trigger

- At stage transition: in-progress → review (Tier 3)
- Manual: `ctoc quality --tier3`
- Part of review-time quality checks

## Architecture rules file

Define dependency direction in `.ctoc/architecture-rules.yaml`. The checker reads this file and treats absence as a soft warning (legacy projects). Schema:

```yaml
style: modular-monolith    # layered | hexagonal | clean | onion | vertical-slices | modular-monolith

# For layered / clean / onion:
layers:
  - name: presentation
    paths: ["src/controllers/**", "src/api/**", "src/routes/**"]
    allowed_imports: ["application", "shared"]
  - name: application      # use-cases / orchestrators
    paths: ["src/application/**", "src/use-cases/**"]
    allowed_imports: ["domain", "shared"]
  - name: domain           # innermost — must NOT import infrastructure
    paths: ["src/domain/**", "src/entities/**"]
    allowed_imports: ["shared"]
    forbidden_imports: ["infrastructure", "presentation", "*db*", "*http*"]
  - name: infrastructure
    paths: ["src/infrastructure/**", "src/repositories/**", "src/adapters/**"]
    allowed_imports: ["domain", "application", "shared"]
  - name: shared
    paths: ["src/shared/**", "src/types/**"]
    allowed_imports: []

# For modular monolith / vertical slices:
modules:
  - name: billing
    paths: ["src/modules/billing/**"]
    public_api: "src/modules/billing/index.ts"   # external code may ONLY import from here
    internal_paths: ["src/modules/billing/internal/**"]
    allowed_modules: ["shared", "iam"]
  - name: iam
    paths: ["src/modules/iam/**"]
    public_api: "src/modules/iam/index.ts"

# For hexagonal:
hexagonal:
  domain_paths: ["src/domain/**"]
  port_paths: ["src/ports/**"]
  adapter_paths: ["src/adapters/**"]
  forbidden:
    - {from: "src/domain/**", to: "src/adapters/**"}    # domain must not know its adapters
    - {from: "src/domain/**", to: "src/infrastructure/**"}
```

## Violation categories

### 1. Layered violation — downstream depends upstream

The most-common architectural defect: an inner ring importing from an outer ring. Examples:
- `domain/User.ts` imports `infrastructure/UserRepository`
- `src/entities/Order.cs` references `Microsoft.EntityFrameworkCore`
- `domain/user.py` imports `flask` or `fastapi`

**Severity**: high. **Confidence**: high (string-matchable in nearly every language).

### 2. Circular dependencies

Find import cycles that create tight coupling.

| Language | Tool |
|----------|------|
| JavaScript / TypeScript | `madge --circular`, `dependency-cruiser --validate` |
| Python | `pydeps`, `import-linter` (with `contract = forbidden`) |
| Go | `go mod graph` piped to `tsort` |
| Java / Kotlin | `jdeps -summary`, ArchUnit `slices().should().beFreeOfCycles()` |
| Rust | `cargo-modules`, `cargo-depgraph` |
| C# / .NET | `dotnet list package --include-transitive`, NDepend, Roslyn analyzers |
| C / C++ | `cinclude2dot`, `cpp-dependencies` (NL-eScience) |

```bash
npx dependency-cruiser --validate .dependency-cruiser.cjs src/
npx madge --circular src/
lint-imports                     # import-linter (Python)
go mod graph | tsort 2>&1 | grep -i cycle
./gradlew test --tests "*ArchitectureTest*"   # ArchUnit
```

**Severity**: block when NEW cycles are introduced; warn on pre-existing (debt).

### 3. Leaky abstractions

An outer-ring type appears in an inner-ring signature. Example: a domain repository interface returns `HttpResponse` or `IDataReader`. The abstraction has leaked the infrastructure it was meant to hide.

Detect by: scanning inner-ring files (`domain/**`) for imports or type references whose module path matches outer-ring globs (`infrastructure/**`, framework namespaces).

### 4. God module

A module exceeding any of: 30 exported symbols, 1500 LOC, or with > 20 inbound dependents AND > 20 outbound dependencies. Surface it for splitting. (These thresholds are heuristics, not invariants — emit `confidence: medium`.)

### 5. Forbidden imports

Explicit `forbidden_imports` rules in the rules file. Examples:
- Domain → infrastructure
- Web layer → DB driver
- Module A → Module B's `internal/`
- Anything → `legacy/`

### 6. Feature envy across modules

A function in module A repeatedly accesses fields of an object owned by module B. Typically expressed as: > 3 dotted accesses (`b.x.y.z`) into another module's exported type within a single function. Indicates the function belongs in B, not A. Confidence: medium.

### 7. Missing boundary enforcement

Each module exposes a single public entry point (`index.ts` / `__init__.py` / a single .NET public class). External code must not reach into `internal/` or `_private/`.

Patterns:
- TypeScript / JS: `import { ... } from "billing/internal/foo"` (when `internal` is private)
- Python: `from billing._private import X` or `import billing.internal.foo`
- C#: external assembly references types marked `internal` via `InternalsVisibleTo` abuse
- Java: reaching into a `*.impl` or `*.internal` package across modules
- Go: importing across a `internal/` directory boundary (Go enforces this itself — flag if disabled)

### 8. Blast radius

Count dependents of changed files.

| Dependents | Level | Action |
|------------|-------|--------|
| ≤ 5 | Low | Pass |
| 6–15 | Medium | Info |
| 16–30 | High | Warning |
| > 30 | Critical | Review required (often a refactor candidate) |

### 9. Import depth

Trace import chains; max 5 levels deep before flagging. Long chains indicate accidental coupling.

## Seven-language coverage

### C# / .NET 9

- **Boundaries**: project references in `.csproj` are the assembly graph; project A referencing project B implies all `public` types in B are reachable from A.
- **`internal` discipline**: types should default to `internal`; `public` is opt-in. Cross-assembly use needs `[InternalsVisibleTo("...")]` — flag any usage that abuses this for production code (test-only is fine).
- **Project structure**: prefer one project per module in a modular monolith (`Billing.csproj`, `Iam.csproj`, `Domain.csproj`). Solution folders are organizational, not enforcement.
- **Tools**: NDepend (rules engine), `dotnet list package`, Roslyn architecture analyzers, [NetArchTest](https://github.com/BenMorris/NetArchTest) (ArchUnit-equivalent for C#).
- **Pattern detection**:
  ```bash
  # Find any domain project that references EF Core (leaky abstraction)
  rg --type csproj "EntityFrameworkCore" src/Domain/
  # Roslyn analyzer config in .editorconfig
  rg "dotnet_diagnostic.CA1014" .editorconfig    # CLSCompliant — example security/design rule
  ```
- **NetArchTest example**:
  ```csharp
  var result = Types.InAssembly(typeof(Domain.User).Assembly)
      .That().ResideInNamespace("MyApp.Domain")
      .ShouldNot().HaveDependencyOn("Microsoft.EntityFrameworkCore")
      .GetResult();
  Assert.True(result.IsSuccessful);
  ```

### Java 21+

- **Java Platform Module System (JPMS)**: `module-info.java` declares `exports` (public surface) and `requires` (dependencies). Modules not `exports`-ed are inaccessible to other modules at compile- and run-time. Use this for hard module boundaries when feasible (large codebases, library distribution).
- **Package conventions**: `*.impl` / `*.internal` packages signal non-public surface even without JPMS.
- **ArchUnit** is canonical. Write a `@AnalyzeClasses` test that fails the build on violations:
  ```java
  @AnalyzeClasses(packages = "com.acme.app")
  class ArchitectureTest {
      @ArchTest static final ArchRule layered = layeredArchitecture().consideringAllDependencies()
          .layer("Presentation").definedBy("..web..")
          .layer("Application").definedBy("..application..")
          .layer("Domain").definedBy("..domain..")
          .layer("Infrastructure").definedBy("..infrastructure..")
          .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Infrastructure")
          .whereLayer("Presentation").mayNotBeAccessedByAnyLayer();
      @ArchTest static final ArchRule no_cycles = slices().matching("..(*)..").should().beFreeOfCycles();
      @ArchTest static final ArchRule domain_pure = noClasses().that().resideInAPackage("..domain..")
          .should().dependOnClassesThat().resideInAnyPackage("..infrastructure..", "javax.persistence..");
  }
  ```

### Python 3.12+

- **Package structure**: explicit `__init__.py` files declare module surface. Leading-underscore names (`_internal`, `_private`) signal non-public.
- **`import-linter`** is canonical. `.importlinter` config:
  ```ini
  [importlinter]
  root_package = myapp

  [importlinter:contract:layers]
  name = Layers
  type = layers
  layers =
      myapp.presentation
      myapp.application
      myapp.domain
      myapp.infrastructure

  [importlinter:contract:domain-purity]
  name = Domain must not depend on infrastructure
  type = forbidden
  source_modules = myapp.domain
  forbidden_modules = myapp.infrastructure, sqlalchemy, fastapi, django

  [importlinter:contract:no-cycles]
  name = No circular imports between modules
  type = independence
  modules = myapp.billing, myapp.iam, myapp.catalog
  ```
- **Run**: `lint-imports` in CI. Treat any violation as critical on the wire (warnings-are-bugs).
- **Pyright / mypy** strict-mode helps catch leaks via type signatures (e.g., a domain function whose return type is a SQLAlchemy `Row`).

### C (C17 / C23)

- **Header organization is the dependency graph**. Public headers in `include/<module>/*.h`; private headers in `src/<module>/`.
- **Rule**: a `.c` file in module A must only `#include` public headers of allowed modules.
- **Tools**: `cpp-dependencies` (eScience), `cinclude2dot` → graphviz → cycle detection, custom AWK/python scripts grepping `#include`.
- **Pattern detection**:
  ```bash
  # Domain module must not include any infrastructure header
  rg "^\s*#include\s+[\"<](infrastructure|db|network)/" src/domain/
  ```
- **Header guards / `#pragma once`** required. Missing guards is a cycle vector.

### C++ 20 / 23

- **C++20 modules** (`export module billing;`, `import iam;`) are the modern boundary mechanism — much stronger than headers because they are not textual. Adoption still uneven (compiler support: GCC 14+, Clang 17+, MSVC v143+); when modules are in use, the dependency graph is the set of `import` statements (not `#include`), and you should analyze it the same way you would TypeScript / Java imports. When the project mixes `#include` and `import`, build a unified graph from both.
- **Header-only fallback**: for legacy code, same header-discipline rules as C.
- **Tools**: `clang-tidy` with `misc-include-cleaner`, `include-what-you-use` (IWYU), `cpp-dependencies`.
- **Rule of thumb**: a domain class's header must not transitively include any infrastructure header.

### TypeScript / JavaScript

- **Path aliases** (`tsconfig.json` `paths`) give modules canonical names: `@billing/*`, `@iam/*`. Enforce with `eslint-plugin-import` `no-restricted-paths` or `dependency-cruiser` rules.
- **`dependency-cruiser`** is canonical. `.dependency-cruiser.cjs`:
  ```js
  module.exports = {
    forbidden: [
      { name: "no-circular", severity: "error",
        from: {}, to: { circular: true } },
      { name: "domain-pure", severity: "error",
        from: { path: "^src/domain" },
        to:   { path: "^src/(infrastructure|adapters|presentation)" } },
      { name: "no-internal-cross-module", severity: "error",
        from: { path: "^src/modules/(?!billing)" },
        to:   { path: "^src/modules/billing/internal" } },
    ],
    options: { tsConfig: { fileName: "tsconfig.json" } }
  };
  ```
- **`eslint-plugin-boundaries`** and **`eslint-plugin-import`** `no-restricted-paths` provide editor-time feedback.
- **Run**: `npx depcruise --validate .dependency-cruiser.cjs src` in CI.

### SQL — schema boundaries

Databases have architecture too, and SQL is the most-violated layer.

- **Schema-per-module**: in a modular monolith, give each module its own Postgres schema (`billing.invoices`, `iam.users`). Cross-schema reads are allowed; cross-schema writes (or foreign keys) from outside the owning module are forbidden.
- **Ownership convention**: only the owning module's migrations may modify a schema. Enforce via repo-level CODEOWNERS on `migrations/billing/**`.
- **Detection patterns**:
  - Foreign key from `iam.users.id` referenced in `billing.invoices.user_id` is FINE.
  - Foreign key from `billing.invoices.id` referenced in `iam.users.last_invoice_id` is a BACKWARDS dependency — billing should not be referenced by iam.
  - A view or function in schema A that joins three other schemas suggests A is a "god schema".
  - Cross-schema `INSERT` / `UPDATE` outside the owning module is a layer violation.
- **Tools**:
  - `sqlfluff` for lint-level rules.
  - Schema-diff tools (Liquibase, Flyway, Atlas) reveal who modifies what.
  - Custom queries against `information_schema.referential_constraints` find FK direction violations.
- **Detection query** (PostgreSQL — find FKs crossing schema boundaries):
  ```sql
  SELECT tc.table_schema AS from_schema, tc.table_name AS from_table,
         ccu.table_schema AS to_schema,  ccu.table_name AS to_table,
         tc.constraint_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.constraint_column_usage AS ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema <> ccu.table_schema;   -- cross-schema FK
  ```
  Compare the result against `.ctoc/architecture-rules.yaml` `modules[].allowed_modules` — any FK pointing backwards (e.g., `iam → billing`) is a violation when `iam.allowed_modules` does not include `billing`.
- **Severity**: cross-schema writes from a non-owner = high; FK direction violations = high; god schemas = medium with confidence: medium.

## Output Format (MANDATORY)

```yaml
findings:
  - type: "layered_violation"
    severity: "high"
    location:
      file: "src/domain/User.cs"
      line: 4
    message: "Domain layer imports infrastructure (Microsoft.EntityFrameworkCore)"
    confidence: "HIGH"
    context:
      source_module: "src/domain"
      target_module: "Microsoft.EntityFrameworkCore"
      rule_violated: "domain.allowed_imports does not include infrastructure"
      suggested_fix: "Introduce an IUserRepository port in domain; move the EF Core implementation to infrastructure/UserRepository.cs"
    tags: ["architecture", "layered", "tier3"]

  - type: "circular_dependency"
    severity: "high"
    location:
      files: ["src/services/user.js", "src/services/auth.js"]
    message: "Circular dependency: user.js ↔ auth.js"
    confidence: "HIGH"
    context:
      cycle: ["user.js", "auth.js", "user.js"]
      suggested_fix: "Extract shared logic to a third module; or invert direction via interface in shared/"
    tags: ["architecture", "cycle", "tier3"]

  - type: "forbidden_import"
    severity: "high"
    location:
      file: "src/modules/billing/internal/charge.ts"
      line: 1
    message: "External module imports billing/internal — module boundary violation"
    confidence: "HIGH"
    context:
      source_module: "src/modules/catalog"
      target_module: "src/modules/billing/internal"
      rule_violated: "billing.public_api restricts external access to src/modules/billing/index.ts"
      suggested_fix: "Add the needed function to billing/index.ts as a public API, or move catalog's logic into billing."
    tags: ["architecture", "module-boundary", "tier3"]

  - type: "blast_radius"
    severity: "warning"
    location: { file: "src/utils/helpers.js" }
    message: "Change affects 28 dependent files (high blast radius)"
    confidence: "HIGH"
    tags: ["architecture", "coupling", "tier3"]

metadata:
  agent: "architecture-checker"
  tier: "tier3"
  style: "modular-monolith"     # echoed from rules file
```

## Blocking Rules

**Block** if:
- New circular dependency introduced (not pre-existing)
- Layered violation in the inner ring (domain importing infrastructure / framework)
- Forbidden_import explicitly listed in rules
- Cross-module access to another module's `internal/` / `_private/`
- Cross-schema SQL write outside owning module
- Blast radius > 50 files for a single change

**Warn** (internal triage MEDIUM / LOW — still emitted as `severity: critical` on the refinement-loop wire per warnings-are-bugs) if:
- Pre-existing circular dependencies (debt)
- God module (heuristic)
- Feature envy across modules (heuristic)
- Import depth > 5
- Blast radius 16–50

## Quality State Cache

Writes `.ctoc/quality-state/architecture-results.json` with `analyzedAt`, `gitHead`, `status`, `style`, `circularDeps`, `layerViolations`, `forbiddenImports`, `moduleBoundaryViolations`, `blastRadius`.

## Severity reconciliation

| Internal triage tier | Examples | Blocking behavior | Wire severity |
|---------------------|----------|-------------------|---------------|
| CRITICAL | New circular dep, domain→infra leak, cross-module `internal/` access, cross-schema FK direction violation | BLOCK | `critical` |
| HIGH | Layer violation outside innermost ring, `forbidden_import` hit, blast radius > 50 | BLOCK | `critical` |
| MEDIUM | God module, feature envy, import depth > 5, blast radius 16–50 | Warn (do not block) | `critical` |
| LOW | Pre-existing cycles (debt), naming inconsistencies under public_api | Backlog | `critical` |

Reconciliation rule: **the wire severity is always `critical`** (warnings-are-bugs). The internal tier governs whether the finding *blocks* phase advancement, but the letter to CTO Chief never carries a "warn" or "info" tier — those words exist only in the human-readable report body.

## Tool Integration (2026)

| Language | Tool | Notes |
|----------|------|-------|
| Java / Kotlin | **ArchUnit** | De-facto standard. Runs as JUnit test. Catches cycles, layer rules, naming. |
| C# / .NET | **NetArchTest**, **NDepend**, Roslyn analyzers | NetArchTest is the ArchUnit analog. NDepend is paid but the most powerful. |
| TypeScript / JavaScript | **dependency-cruiser**, **eslint-plugin-boundaries**, **ArchUnitTS** | dependency-cruiser is canonical for CI; ESLint plugins for editor-time. |
| Python | **import-linter** | Use `forbidden`, `layers`, `independence` contract types. |
| Go | `go vet`, `go-cleanarch`, `tsort` | The language's own `internal/` directory rule is the strongest enforcement. |
| Rust | `cargo-modules`, `cargo-depgraph` | The crate / module system is the boundary. |
| C / C++ | `cpp-dependencies`, `include-what-you-use`, `cinclude2dot` | Header graph is the dependency graph. |
| PHP | **deptrac** | Layer enforcement via YAML config; mature ecosystem. |
| Multi-language | **Sonargraph**, **Lattix** | Commercial, polyglot, used in enterprise audits. |
| Java | **modularity-maven-plugin** | Enforces JPMS rules during build. |

Aggregate violations into a single report. Treat every emitted letter as `critical` on the wire — per warnings-are-bugs, this skill's findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity`.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = string-matched rule; medium = heuristic; low = single-signal
violation_kind: layered_violation | circular_dependency | leaky_abstraction | god_module | forbidden_import | feature_envy | missing_boundary | blast_radius | import_depth | sql_schema_violation
source_module: src/domain                           # the offending module / file scope
target_module: src/infrastructure                   # what was imported / depended on
rule_violated: "domain.allowed_imports does not include infrastructure"
file: src/domain/User.cs
line: 4
style: modular-monolith                             # echoed from rules file; helps the integrator weigh
delta_to_baseline: new | unchanged | regressed      # vs. previous run / baseline
suggested_fix: "Introduce IUserRepository port in domain; move EF Core impl to infrastructure."
reference: https://www.archunit.org/userguide/html/000_Index.html
```

The integrator uses `confidence` and `delta_to_baseline` to weight findings. A `confidence: medium` god-module finding doesn't block phase advancement on its own; a `confidence: high` new circular dependency does.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
