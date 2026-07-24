---
name: mutation-test-runner
description: Validates test quality by introducing mutations and checking if tests catch them — table stakes for AI-written suites.
type: skill
when_to_load:
  - "run mutation test"
  - "mutation test"
  - "mutation testing"
  - "mutation score"
  - "test quality check"
  - "stryker run"
  - "mutmut run"
related_skills:
  - testing/runners/unit-test-runner
  - testing/coverage-enforcer
  - testing/writers/unit-test-writer
  - testing/quality-gate-runner
effort_level: high
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Mutation Test Runner (skill)

> Converted from agents/testing/runners/mutation-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run mutation testing to verify that tests actually catch bugs, not just cover code. Mutations are small code changes (`+` → `-`, `>` → `>=`, `true` → `false`, `return x` → `return null`); if the test suite still passes under a mutation, those tests aren't asserting on the behavior the mutation broke. Line coverage shows tests *touched* a line; mutation score shows tests *would have caught* a regression on that line. Coverage without mutation is a vanity metric.

## 2026 Best Practices (Testing category)

The 2026 headline: mutation testing is the only credible quality gate for AI-written test suites, and `coverage-enforcer` is no longer sufficient on its own. Five practices are now load-bearing:

- **Mutation score ≥ 75% on critical paths is the working target**; ≥ 80% for new code in greenfield modules. Critical paths = auth, payment/billing, access control, anything that ships money or PII. Standard features can sit lower (50–70%) and experimental/spike code can stay un-gated. Below 50% on a release-bound module is a serious gap and must block. These tiers are what publicly-documented teams ship to; do not chase 100% (see equivalent mutants below).
- **Run nightly, not per-PR**. Full mutation runs are minutes-to-hours, not seconds, because the test suite re-runs once per surviving mutant. Per-PR gates create reviewer drag and get disabled inside two sprints. Pattern: **diff/incremental mode on PRs, full sweep nightly**. StrykerJS reuses prior results with `--incremental`; Stryker.NET scopes to a Git diff with `--since:<committish>` and reuses a baseline with `--with-baseline` (it has no `--incremental` flag). PIT has `withHistory` for incremental. mutmut scopes to matching files with a glob argument (`mutmut run "path*"`). mull mutates only the files you compile with its IR pass plugin, which is itself a natural scope.
- **Equivalent mutants are real — don't chase 100%**. Some mutations produce semantically-equivalent code (e.g. `i++` vs `++i` in a statement context, or a dead-branch flip). These are unkillable by definition. Equivalent and redundant mutants make up a meaningful fraction of the total in typical codebases, which is why a mutation score in the ~80–85% range is already functionally a "perfect" suite (Microsoft Learn's Stryker.NET guidance likewise says not to chase a 100% score). Plateaus above this should be inspected manually, not test-padded.
- **Mutation as coverage-quality signal, not a coverage replacement**. They measure different things: coverage = "did the test execute this line?", mutation = "did the test assert on this line's behavior?". Cross-link with [[testing/coverage-enforcer]]: coverage is the necessary condition (a line with 0% coverage cannot kill a mutant), mutation is the sufficient condition. Run coverage every PR (cheap, fast); run mutation nightly (expensive, deep).
- **AI-written suites need mutation testing more than human-written ones**. Two patterns dominate LLM-generated tests: (1) the assertions re-state the implementation (`assert add(2,3) == add(2,3)` style tautologies — coverage 100%, mutation score near 0); (2) the test calls the function but asserts only on side-effects that all mutants preserve. Veracode has measured that a large share of AI-generated code contains at least one security flaw (see [[security/sast-scanner]] for the current figure and source); the test-quality equivalent is anecdotally worse. Make mutation testing mandatory after any LLM-driven test generation, before merge.

## Categories (common failure modes)

Each finding maps to one of these. Letters use these as the `kind` field.

### 1. Line coverage as proxy without mutation
Coverage at 90%+ but mutation score < 40%. Hallmark of AI-written or rubber-stamp tests. Action: regenerate tests with intent-based prompts (assert on outputs and behavior, not method calls), or escalate to the human author.

### 2. Missing diff mode (slow runs disable the gate)
A team running full Stryker sweeps on every PR will disable the gate within weeks. Always configure incremental or diff mode for PR runs, full sweep nightly. Flag any CI config that runs unscoped mutation on PR triggers.

### 3. Chasing 100% (equivalent mutants treated as gaps)
Surviving mutants forced to be killed when they're semantically equivalent. Symptoms: tests that assert on internal state instead of observable behavior; tests that pin implementation details; mutation score climbing above ~90% only via tautological assertions. Triage: manually inspect surviving mutants above the threshold rather than auto-failing.

### 4. No nightly schedule (mutation testing exists but never runs)
Mutation config exists in the repo, but no scheduled CI job runs it. Score stays at "last measured 6 months ago." Treat as equivalent to no mutation testing at all.

### 5. Mutation on test code or generated code
Running mutation against the test files themselves (loops + nonsense), against vendored/generated code (auto-generated parsers, ORM scaffolding, protobuf stubs), or against migration scripts. Always exclude these paths in tool config.

### 6. Threshold drift (silent regressions)
Mutation score drops over time and nobody notices because the gate has no diff-to-baseline. Persist the previous run's score and alert on drops > 5 percentage points, similar to the SARIF baseline pattern in [[security/sast-scanner]].

## Tool Integration (2026)

Seven-language coverage. SQL is excluded — there is no production-grade mutation tester for stored procedures or query bodies as of 2026; quality there is governed by [[testing/coverage-enforcer]] and integration tests.

| Language(s) | Tool | Status as of 2026 | Notes |
|---|---|---|---|
| JS / TS | Stryker (StrykerJS) | stable, dominant | `--incremental` reuses prior results for fast CI re-runs (no `--since` flag) |
| C# / .NET | Stryker.NET | stable; documented on Microsoft Learn as the .NET mutation tester | `--since:<committish>` diff scoping + `--with-baseline`; supports .NET Framework and modern .NET |
| Java / Kotlin | PIT (PITest) | stable, dominant | `withHistory` for incremental; Maven + Gradle plugins |
| Python | mutmut | stable, simple | Fast for small/mid projects; integrates with pytest |
| Python (alt) | Cosmic Ray | stable, deeper | More mutation operators than mutmut; slower; distributes work via HTTP workers |
| C / C++ | mull | stable | LLVM-based; compile-time IR pass plugin (`mull-ir-frontend`); prebuilt for recent LLVM releases on Ubuntu 22.04/24.04 (aarch64 + amd64) and macOS |
| Rust | cargo-mutants | stable | Source-level; integrates with `cargo test` |
| SQL | — | no mainstream tool | Test stored procs via integration tests + coverage; track in `coverage-enforcer` |

### Stryker — JavaScript / TypeScript
```bash
npx stryker run
# Incremental (PR/CI mode) — store results and re-run only new or changed mutants
npx stryker run --incremental
```
`stryker.conf.js`:
```javascript
module.exports = {
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/generated/**'],
  testRunner: 'jest',
  reporters: ['html', 'clear-text', 'dashboard', 'json'],
  thresholds: { high: 80, low: 60, break: 50 },  // break = exit nonzero
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  // Incremental mode is StrykerJS's fast-CI path — there is no --since flag
};
```

### Stryker.NET — C# / .NET
```bash
dotnet tool install -g dotnet-stryker
cd test/MyProject.Tests
dotnet stryker
# Differential (PR mode) — test only code changed since a committish
dotnet stryker --since:main
# Reuse a baseline instead of a full re-run (Stryker.NET has no --incremental)
dotnet stryker --with-baseline:main
```
`stryker-config.json`:
```json
{
  "stryker-config": {
    "project": "MyProject.csproj",
    "mutate": ["**/*.cs", "!**/Migrations/**", "!**/obj/**", "!**/bin/**"],
    "thresholds": { "high": 80, "low": 60, "break": 50 },
    "reporters": ["html", "json", "progress"]
  }
}
```

### PIT (PITest) — Java / Kotlin
Maven:
```bash
mvn org.pitest:pitest-maven:mutationCoverage
# Incremental: write/read history file
mvn org.pitest:pitest-maven:mutationCoverage \
    -DwithHistory \
    -DhistoryInputFile=target/pit-history.bin \
    -DhistoryOutputFile=target/pit-history.bin
```
`pom.xml` plugin config:
```xml
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <configuration>
    <targetClasses><param>com.example.*</param></targetClasses>
    <targetTests><param>com.example.*</param></targetTests>
    <mutationThreshold>75</mutationThreshold>
    <coverageThreshold>80</coverageThreshold>
    <outputFormats><param>HTML</param><param>XML</param></outputFormats>
  </configuration>
</plugin>
```

### mutmut — Python (default choice)
mutmut 3 was a rewrite: results are viewed in an interactive terminal UI, not via `results`/`show`/`html` subcommands, and paths are set in config, not with a `--paths-to-mutate` flag.
```bash
pip install mutmut
mutmut run              # mutates the configured source_paths
mutmut run "src/auth*"  # scope to matching files (glob argument)
mutmut browse           # interactive TUI to inspect surviving mutants
mutmut apply <mutant>   # write one mutant to disk to reproduce it
```
`setup.cfg` (mutmut 3):
```ini
[mutmut]
source_paths=src/
pytest_add_cli_args_test_selection=tests/
```

### Cosmic Ray — Python (when mutmut isn't deep enough)
```bash
pip install cosmic-ray
cosmic-ray init config.toml session.sqlite
cosmic-ray exec config.toml session.sqlite
cr-report session.sqlite
```
`config.toml`:
```toml
[cosmic-ray]
module-path = "src"
timeout = 30
excluded-modules = ["src/generated/*"]
test-command = "pytest -x"

[cosmic-ray.distributor]
name = "local"   # or "http" to distribute across worker processes
```

### mull — C / C++
mull injects its instrumentation at compile time through an LLVM pass plugin (`mull-ir-frontend`), versioned per LLVM release, so the workflow is: compile with the plugin loaded, then run the resulting binary under `mull-runner`.
```bash
# Compile with the mull IR pass plugin loaded (the -18 suffix = your LLVM version)
clang++-18 -fpass-plugin=/usr/lib/mull-ir-frontend-18 -g -grecord-command-line \
    src/*.cpp tests/*.cpp -o ./tests-bin

# Run the mutated binary
mull-runner-18 ./tests-bin
```
`mull.yml`:
```yaml
mutators:
  - cxx_arithmetic
  - cxx_comparison
  - cxx_boundary
  - cxx_logical
  - cxx_calls
  - negate_mutator
parallelization:
  workers: 4
excludePaths:
  - tests/.*
  - third_party/.*
```
Prebuilt packages target recent LLVM releases on Ubuntu 22.04 + 24.04 (aarch64 + amd64) and macOS; the `mull-ir-frontend` and `mull-runner` binaries are versioned per LLVM release, so match the suffix to your clang.

### cargo-mutants — Rust
```bash
cargo install --locked cargo-mutants
cargo mutants
# Diff mode — mutate only lines changed in a diff FILE (not a git ref)
git diff main > pr.diff && cargo mutants --in-diff pr.diff
```

## Mutation Operators (cross-language reference)

| Type | Original | Mutated | Catches |
|------|----------|---------|---------|
| Arithmetic | `a + b` | `a - b` | Wrong operator, sign flips |
| Boundary | `a < b` | `a <= b` | Off-by-one |
| Negation | `true` | `false` / `!x` | Inverted conditions |
| Return | `return x` | `return null` / `return 0` | Missing return-value assertions |
| Statement removal | `call()` | (removed) | Missing side-effect assertions |
| Comparison | `==` | `!=` | Wrong equality |
| Logical | `&&` | `\|\|` | Wrong short-circuit semantics |
| Constant | `42` | `0` / `-1` / `Integer.MAX_VALUE` | Magic-number assertions |

## Interpreting Results

| Status | Meaning |
|--------|---------|
| **Killed** | Test caught the mutation — good |
| **Survived** | Test missed the bug — gap |
| **Timeout** | Mutation caused a hang / non-termination — **counted as detected** (numerator, same as Killed) |
| **No Coverage** | Code not exercised by any test at all — coverage problem, not mutation problem |
| **Equivalent** | Semantically identical to original — unkillable by definition |
| **Compile Error** | Mutation produced invalid code — tool excludes from score |

**Mutation Score** = `Detected / Valid × 100%` = `(Killed + Timeout) / (Killed + Timeout + Survived + No Coverage) × 100%`. Timeout mutants are **detected** — the hang is the test catching the mutation — so they sit in the numerator alongside Killed. No Coverage stays in the denominator (untested code must drag the score down). Equivalent and compile-error mutants are *invalid* and excluded from both numerator and denominator. This is Stryker's default `mutationScore` — the exact value its `break` threshold gates on. Stryker's separate `mutationScoreBasedOnCoveredCode` = `Detected / (Detected + Survived) × 100%` additionally drops No Coverage from the denominator; quote it only when coverage is already gated elsewhere, and never confuse it with the `break` number.

| Score | Quality |
|-------|---------|
| 75%+ on critical paths, 80%+ on new code | Target |
| 60–75% | Acceptable for standard features |
| < 50% on release-bound modules | BLOCK |
| < 40% with > 90% line coverage | AI-written-suite hallmark — regenerate tests |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable mutation report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agent-fragments/warnings-are-critical.md](../../../agent-fragments/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | Mutation score < 50% on a release-bound module (auth, payment, access control); AI-written suite with > 90% coverage and < 40% mutation score; release attempt with no mutation testing on critical paths | BLOCK |
| HIGH | Score 50–60% on critical paths; nightly job not configured; score regression > 10 pp vs. baseline | BLOCK before release |
| MEDIUM | Score 60–75% on standard features; PR running unscoped (slow) mutation; surviving mutants flagged but not investigated | Fix this sprint |
| LOW | Score 75–80% on new code; equivalent mutants miscounted; outdated tool version | Backlog |

The rationale matches `sast-scanner`: a low mutation score on a payment module today is a customer-facing regression after the next refactor. Time is a vector.

## Output Format (human report)

```markdown
## Mutation Test Report

**Tool**: Stryker.NET 4.x
**Mode**: incremental + --since:main
**Duration**: 14m 22s
**Run**: 2026-05-19 nightly

### Summary
| Metric | Count |
|--------|-------|
| Total Mutants | 612 |
| Killed | 487 |
| Survived | 81 |
| Timeout | 18 |
| No Coverage | 14 |
| Equivalent (flagged) | 12 |
| Compile Error | 0 |

**Mutation Score**: 84.2% (detected 505 = killed 487 + timeout 18; valid 600 = detected + survived 81 + no-coverage 14; 12 flagged-equivalent excluded)
**Critical-path score** (Auth/Payment): 78.4%
**Δ vs. baseline**: −0.6 pp (no regression alert)

### Surviving Mutants (Top 5 by criticality)
1. `src/Auth/TokenValidator.cs:142`
   - Mutation: `>= → >`
   - Boundary at token-expiry edge — needs test at exact expiry timestamp

2. `src/Payments/RefundProcessor.cs:78`
   - Mutation: `return result → return null`
   - Caller assumes non-null; no assertion on return type

3. `src/Authz/RoleCheck.cs:23`
   - Mutation: `&& → ||`
   - Privilege-escalation risk — flips access-control logic, no test catches it

### Recommendations
- Add boundary test for token expiry at exact threshold (TokenValidator:142)
- Add null-return assertion in RefundProcessor caller test
- RoleCheck:23 is on the critical path — block release until killed
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+module+kind)[:12]>      # fingerprint for dedup
severity: critical                                       # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                          # high = mutation directly observable; low = inferred from score trend
engine: stryker | stryker-net | pit | mutmut | cosmic-ray | mull | cargo-mutants | manual
kind: low_critical_path_score | low_overall_score | surviving_mutant | no_diff_mode | no_nightly_schedule | score_regression | mutation_on_excluded_path | tautological_test
target_file: src/Auth/TokenValidator.cs
target_line: 142                                         # null when finding is suite-wide
target_module: Auth                                      # critical-path tag if applicable
measured_mutation_score: 78.4                            # percentage, two decimals
threshold: 75.0                                          # the gate this finding violated (or null for advisory)
delta_to_baseline: -10.2                                 # pp change vs prior run; null on first run
mutants_killed: 487
mutants_timeout: 18                                      # detected, part of the score numerator
mutants_survived: 81
mutants_no_coverage: 14
mutants_equivalent_flagged: 12
suggested_fix: "Add boundary test for token expiry at exact timestamp; assert on TokenValidator return at edge."
reference: https://stryker-mutator.io/docs/stryker-net/introduction/
```

The integrator uses `confidence` and `delta_to_baseline` to weight findings — a `confidence: low` trend-only finding doesn't block phase advancement on its own, but a `kind: low_critical_path_score` with `measured_mutation_score` below `threshold` is hard-stop. `kind: tautological_test` (90%+ coverage, < 40% mutation) escalates regardless of confidence — it identifies AI-written-suite drift and should kick back to the test-writer skill.

## When to Run

- **Per-commit**: NO — too slow for inner loop. Use coverage instead.
- **Per-PR (diff mode)**: YES — StrykerJS `--incremental`, Stryker.NET `--since`, PIT `withHistory`, cargo-mutants `--in-diff`. Targets only changed files.
- **Nightly CI**: YES — full sweep on release-bound modules. Track score trend, alert on drops > 5 pp.
- **Pre-release**: YES — block release if critical-path score < 75%.
- **After AI test generation**: YES, mandatory — AI suites with 90%+ coverage routinely score < 40% mutation.

## Red Lines

- Never replace coverage with mutation, or vice versa — see [[testing/coverage-enforcer]]. They measure different things and the gates compound.
- Never run mutation on test code itself, generated code, or migrations — always exclude in tool config.
- Never gate PRs on full (unscoped) mutation runs — disabled within sprints, no exceptions.
- Never accept a release with mutation score < 50% on a release-bound module (auth, payment, access control).
- Never let AI-generated tests skip the mutation gate.
- Never chase 100% — equivalent mutants are real; plateaus above ~85% should be inspected manually, not test-padded.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agent-fragments/warnings-are-critical.md):

- Every surviving mutant on a critical path, every measured score below threshold, every regression > 5 pp, and every absent nightly schedule emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Mutation findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a low mutation score today is a customer-visible regression after the next refactor. Tests that pass without asserting are tests that already failed quietly.
