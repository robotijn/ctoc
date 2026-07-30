---
title: "CR1 — Capability Registry core: schema, engine, seed data for Flutter/Android/Rust + parity langs"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: none
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - "src/lib/app-runner.js"
  - ".ctoc/capabilities/languages/dart.yaml"
  - ".ctoc/capabilities/languages/kotlin.yaml"
  - ".ctoc/capabilities/languages/rust.yaml"
  - ".ctoc/capabilities/languages/python.yaml"
  - ".ctoc/capabilities/languages/typescript.yaml"
  - ".ctoc/capabilities/languages/go.yaml"
  - ".ctoc/capabilities/schema.md"
  - "tests/capability-registry.test.js"
---

# CR1 — The Capability Registry keystone

A single data-driven registry that all four detection surfaces will consume.
CR1 builds the engine + schema + seed data for the human's three named
priorities (Dart/Flutter, Kotlin/Android, Rust) plus three already-covered
languages (Python, TypeScript, Go) to PROVE parity with the existing tables.
Later slices add the rest of the top-20, frameworks, DS/ML, databases, and wire
the four surfaces.

## Implementation Details

1. **Schema (`.ctoc/capabilities/schema.md`).** Document the capability entry
   shape. Each language YAML declares:
   ```yaml
   language: rust
   detectionMarkers: [Cargo.toml]           # files whose presence detects it
   extensions: [.rs]
   toolchain:
     lint:      { cmd: "cargo clippy -- -D warnings", tool: clippy }
     format:    { cmd: "cargo fmt --check", tool: rustfmt }
     typecheck: { cmd: "cargo check", tool: cargo }
     test:      { cmd: "cargo test", tool: cargo, altCmd: "cargo nextest run" }
     coverage:  { cmd: "cargo tarpaulin --out Json", tool: tarpaulin }
     security:  { cmd: "cargo audit", tool: cargo-audit }
     depsAudit: { cmd: "cargo audit", tool: cargo-audit }
     build:     { cmd: "cargo build --release", tool: cargo }
   run:
     shapes: { cli: "cargo run", server: "cargo run" }   # per project-type
     honest: true    # a real runnable binary
   configScaffold: [Cargo.toml, rustfmt.toml]
   verified: web-2026-07   # provenance — NEVER 'guessed'
   ```
   Every `cmd`/`tool` MUST be a real 2026 tool (the vision lists the web-sourced
   anchors). Mark `verified: web-2026-07` where sourced; anything you cannot
   confirm gets `verified: UNVERIFIED` — NEVER fabricate a command.

2. **Engine (`src/lib/capability-registry.js`).** Pure, data-driven, no
   hardcoded language logic:
   - `load(projectRoot?)` — reads `.ctoc/capabilities/languages/*.yaml` (bundled
     with the plugin; a project may override under its own `.ctoc/capabilities/`).
     Fail-open on a malformed entry (skip + warn), like task-registry.
   - `detectLanguages(projectRoot)` — returns languages whose detectionMarkers
     exist in the project (replacing the 4 duplicate marker tables later).
   - `capabilitiesFor(language)` / `toolchainFor(language, phase)` — the lookup
     the surfaces call: given a language + a phase (lint/typecheck/test/security/
     build/run), return the command + tool + whether it's available.
   - `runStrategyFor(language, projectType)` — the run-the-app command for the
     shape, and the `honest` flag (mobile/desktop build-is-the-last-mile).
   - All fs via safe-fs; use the repo's existing YAML reader if one exists (grep
     for js-yaml/yaml usage), else a minimal safe parser — do NOT add a new
     dependency without flagging it.

3. **Seed data — 6 languages, web-grounded** (the vision's anchors):
   - dart (Flutter): flutter analyze, dart format --set-exit-if-changed, flutter
     test, flutter build; run shapes {mobile: "flutter run", web: "flutter run -d
     chrome"}; honest:true for mobile means build+test is the CI last mile.
   - kotlin (Android): ktlint + detekt, ./gradlew test, ./gradlew build; run
     {mobile: "./gradlew installDebug"} honest:build-is-last-mile.
   - rust: clippy/fmt/check/test(+nextest)/tarpaulin/cargo-audit/build; run
     {cli/server: "cargo run"} honest:true.
   - python: ruff (lint+format), mypy, pytest, pytest-cov, bandit, pip-audit;
     run {server: "python -m <pkg>"/"uvicorn"}.
   - typescript: biome OR eslint+prettier, tsc, vitest/jest, c8, semgrep, npm
     audit; run {web/server: package.json scripts}.
   - go: golangci-lint, go build, go test, gosec; run {cli/server: "go run ."}.
   Each entry `verified: web-2026-07`.

### Wiring — the live call sites (MANDATORY)
CR1 is the engine + data; the four surfaces are wired in CR5 (SAME program, next
slices). To avoid a dead module NOW, wire ONE real consumer in this slice:
`src/lib/app-runner.js`'s detectAppShape/run path is the biggest hole — but it is
NOT in this slice's files. Instead: the registry's `detectLanguages` +
`toolchainFor` are consumed by `tests/capability-registry.test.js` AND the schema
doc references it from an instruction surface. If that leaves the module
reachable only by tests (dead by the fence rule), STOP and report — do NOT ship
a dead engine; the correct fix is to expand this slice's files to include ONE
surface (app-runner) so the wiring is real. Flag this at PREPARE.

### Test Plan (TDD-Red first)
Engine: detectLanguages finds rust in a dir with Cargo.toml, dart with
pubspec.yaml, none in an empty dir. toolchainFor('rust','test') returns the
cargo test command; ('dart','lint') returns flutter analyze. runStrategyFor
('dart','mobile') returns the build-honest strategy (honest flag set); ('rust',
'cli') returns cargo run. A malformed YAML entry → skipped + warn, others load.
Data: every seed YAML parses; every toolchain phase has a real cmd + a tool +
a verified provenance (assert NO entry has verified:guessed or an empty cmd).
Parity: for python/typescript/go, the registry's test/lint commands match what
tool-detector.js currently produces (so CR5's swap is behavior-preserving) —
assert against the existing tool-detector TOOL_MAP values.

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read tool-detector TOOL_MAP + LANGUAGE_MARKERS,
stack-detector, sast-runner LANGUAGE_MARKERS/TOOL_CONFIGS, app-runner
detectAppShape, and grep for an existing YAML parser; resolve the dead-module
wiring question — expand to app-runner if needed and REPORT) · Step 10 IMPLEMENT
· Step 11 REVIEW (no fabricated cmd; parity asserted) · Step 13 SECURE (YAML read
via safe-fs; no eval; a malformed/hostile capability file fails open, never
executes an arbitrary cmd — the registry RETURNS commands, it does not run them)
· Step 14 VERIFY (named test + eslint; no git) · Step 15 DOCUMENT (schema.md is
the contract) · Step 16 REPORT (the 6 seed langs, the wiring decision, any
UNVERIFIED entry).

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
## Execution Result (Steps 8–16 complete)

- **Step 8 TEST (TDD-Red):** `tests/capability-registry.test.js` written first, run
  red (module absent).
- **Step 9 PREPARE:** read tool-detector DEFAULT_TOOLS + LANGUAGE_MARKERS,
  stack-detector, sast-runner LANGUAGE_MARKERS/TOOL_CONFIGS, app-runner
  detectAppShape; found js-yaml is only a transitive eslint dep (won't ship) →
  minimal zero-dep parser; resolved the dead-module wiring by expanding the slice to
  `src/lib/app-runner.js` (both reachability fences are exact-count ratchets:
  file `maxUnreachable:0`, export `maxDead:103`).
- **Step 10 IMPLEMENT:** engine + 6 seed YAML + schema.md + app-runner wire.
- **Steps 11–13 REVIEW/OPTIMIZE/SECURE:** safe-fs reads, no dynamic execution
  (asserted by test), fail-open per-entry, size/count caps, commands returned as
  inert strings, parity asserted.
- **Step 14 VERIFY:** *(original CR1 executor record — NARROWED to the named test)*
  `tests/capability-registry.test.js` 29/29 pass; eslint clean (0 warnings) on all
  changed files; typecheck 1/1; both reachability fences green (file 5/5, export
  16/16); app-runner 13/13, last-mile + verify-evidence suites green (parity).
  Engine coverage 95.70% lines / 100% functions. **This ran only the named test,
  not the full gate — corrected in the Rework Verification below.**
- **Step 15 DOCUMENT:** `.ctoc/capabilities/schema.md` is the contract.
- **Step 16 REPORT:** delivered to CTO Chief.

## Rework Verification (2026-07-27, isolated worktree, real full gate)

Re-verified against disk after later slices (CR2–CR5 + adversarial repair rounds
1/2/5) evolved the engine. Every check below was RUN and its output READ.

- **Full gate — `npm test` (the gated entry point, not the named test):**
  **10520 pass · 0 fail · 0 skipped**, coverage **99.15%** (threshold 99), gate
  prints `PASS`. The original Step-14 record ran only the named test; the real
  gate is green.
- **Typecheck — `npx tsc --noEmit`:** clean, no errors.
- **Registry's own test file:** 61/61 pass (was 29 at CR1; grew through the later
  slices and repair rounds — the 29/29 figure is **REFUTED-as-stale**).
- **Registry coverage:** `capability-registry.js` **100.00% line / 100.00%
  function** (the 95.70% engine-coverage figure is **REFUTED-as-stale** — coverage
  rose, not fell); `app-runner.js` 98.05% line.
- **Reachability (not dead code):** `capability-registry.js` is ABSENT from
  `.ctoc/reachability-baseline.json` (unreachable list) — it is LIVE, required by
  7 shipped modules: `app-runner.js`, `stack-detector.js`, `tool-detector.js`,
  `sast-runner.js`, `sca-runner.js`, `dependency-auditor.js`,
  `framework-security-checker.js`. The CR1-era "file 5/5, export 16/16" fence
  snapshot is superseded by the repo-wide ratchets, which are green in the full
  gate. The core exists, is wired, and a human/agent reaches it through the live
  Step-14 VERIFY path (app-runner) and the init/quality detection surfaces.
- **eslint:** clean on `capability-registry.js`, `app-runner.js`,
  `tests/capability-registry.test.js`.
- **No fabricated commands:** the 6 CR1 seed languages (dart, kotlin, rust,
  python, typescript, go) contain no `verified: guessed` marker; UNVERIFIED
  flags (Dart SAST, Kotlin deps/coverage) are honest per the vision invariant.
- **`files:` frontmatter:** VERIFIED ACCURATE — all 10 declared files exist on
  disk and were exactly the set created by the CR1 commit (`a9d6a77`); no file
  missing, none spurious. No correction required.
- **Ledger:** `.ctoc/approvals/00027-cr1-capability-registry-core.json` left
  untouched (a review-stage plan's ledger hash is not re-stamped by rework).

**Disposition:** no code defect found — the engine is green at 100% registry
coverage with adversarial rounds already applied; the only defects were
record-vs-disk drift in this plan, corrected above. The narrowed Step-14 claim is
replaced with real full-gate evidence.

## Decisions Taken Under Ambiguity

1. **YAML reader — a minimal, dependency-free subset parser inside the module (NOT
   js-yaml).** `js-yaml` resolves on disk but ONLY as a transitive dependency of
   eslint (a devDependency); `node_modules/` is gitignored, so js-yaml will NOT
   ship with the marketplace plugin. circuit-breaker.js relying on it is a latent
   runtime risk I did not replicate. The codebase convention is per-module minimal
   parsers (budget.js `parseYaml`, regulatory-regime.js `parseYAMLShallow`,
   settings.yaml parsed flat by the hooks). CR1 follows suit: a zero-dependency
   subset parser (block maps + inline arrays + inline flow maps + typed scalars,
   quote-aware, no eval). This is the plan's sanctioned "else a minimal safe
   parser" branch — no new dependency added.

2. **Dead-module wiring — the slice EXPANDS by one file: `src/lib/app-runner.js`.**
   The two reachability fences are exact-count ratchets: the FILE fence baseline is
   `maxUnreachable: 0` (a new unreachable file fails the exact-equality assertion),
   and the EXPORT fence baseline is `maxDead: 103`. A test is NEVER a caller. So the
   engine consumed only by its test would be DEAD ON ARRIVAL and fail both fences.
   Resolution (exactly the plan's anticipated one): add app-runner.js — a LIVE
   module (required by src/lib/step-13-verify.js, the Step-14 VERIFY path) — as a
   genuine consumer. app-runner now consults the registry (`detectLanguages`,
   `runStrategyFor`, `toolchainFor`) to recognize a NON-JS project (Rust/Flutter/
   Android) that its package.json logic classifies as 'unknown', making
   capability-registry.js file-reachable and every export live via real code edges.
   `files:` is expanded to include `src/lib/app-runner.js`. REPORTED to CTO Chief.

3. **Honest native run reporting (gate-safe).** `applyAppRunCheck` in
   step-13-verify pushes a gate-FAILING error when `applicable:true &&
   responded:false`. So a registry-detected native/mobile project returns
   `applicable:false` with RICH evidence (language + build-is-last-mile run
   strategy, execution deferred to CR6) — more honest than today's "shape could not
   be determined", never a false pass, and it does not fail Step 14. CR1 detects
   and describes; it never executes a build/run (that is CR6).

4. **Parity over 2026-anchor for TypeScript lint/test.** biome is the 2026 anchor,
   but tool-detector's DEFAULT_TOOLS uses `eslint .` (lint) and `npm test` (test).
   Parity wins so CR5's swap is behavior-preserving: typescript lint.cmd=`eslint .`
   (tool eslint), test.cmd=`npm test`; biome is carried as an `altCmd`. python
   (`ruff check .` / `pytest`) and go (`golangci-lint run` / `go test ./...`) match
   DEFAULT_TOOLS exactly.

5. **UNVERIFIED, never guessed.** No WebSearch tool was available in this executor
   context (only Read/Write/Edit/Bash + doc MCP servers). Commands are grounded in
   the vision's web-sourced 2026 anchor list (dated 2026-07-15) plus stable tool
   knowledge; peripheral phases I could not confirm to an exact CI-standard
   invocation are flagged `verified: UNVERIFIED` (Dart has no established dedicated
   SAST → security UNVERIFIED; Kotlin/Android OWASP dependency-check + Kover deps/
   coverage → UNVERIFIED). No command is fabricated or flagged "guessed".

6. **Concurrent sibling plan.** Plan 00026 (dashboard stripCtl sweep — files
   src/lib/tui.js, src/areas/*.js) was already in `plans/in-progress/`. Its files
   are DISJOINT from CR1's, which is exactly the file-disjoint concurrent-wave
   pattern the task-registry supports. Proceeding on the explicitly-assigned 00027
   is safe and correct; no file conflict.
