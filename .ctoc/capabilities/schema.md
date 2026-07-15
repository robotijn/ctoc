# Capability Registry — schema (the contract)

The Capability Registry (`src/lib/capability-registry.js`) is CTOC's single,
data-driven source of truth for how to **detect, lint, type-check, test, secure,
build and RUN** each language. One table, loaded from
`.ctoc/capabilities/languages/*.yaml`, that all four detection surfaces
(stack-detector, tool-detector, sast-runner, app-runner) consume instead of four
drifting local tables. Adding a language is a one-file change.

**The engine is dumb; the data is smart.** There is no hardcoded language logic in
the engine — every command lives here in the data.

**It returns commands; it never runs them.** A `cmd` value is an inert string the
caller may choose to execute under its own controls. The engine contains no
`eval` / `Function` / `child_process`, reads every file through `safe-fs`, and is
fail-open: a malformed, oversized, or hostile capability file is skipped with a
warning — never executed, never fatal.

## One language entry

Each `.ctoc/capabilities/languages/<language>.yaml` file declares:

```yaml
language: rust                         # REQUIRED — the key this entry registers under
detectionMarkers: [Cargo.toml]         # files whose presence detects the language
extensions: [.rs]                      # source-file extensions
toolchain:                             # REQUIRED — one entry per pipeline phase
  lint:      { cmd: "cargo clippy -- -D warnings", tool: clippy,     verified: web-2026-07 }
  format:    { cmd: "cargo fmt --check",           tool: rustfmt,    verified: web-2026-07 }
  typecheck: { cmd: "cargo check",                 tool: cargo,      verified: web-2026-07 }
  test:      { cmd: "cargo test", tool: cargo, altCmd: "cargo nextest run", verified: web-2026-07 }
  coverage:  { cmd: "cargo tarpaulin --out Json",  tool: tarpaulin,  verified: web-2026-07 }
  security:  { cmd: "cargo audit",                 tool: cargo-audit, verified: web-2026-07 }
  depsAudit: { cmd: "cargo audit",                 tool: cargo-audit, verified: web-2026-07 }
  build:     { cmd: "cargo build --release",       tool: cargo,      verified: web-2026-07 }
run:
  shapes: { cli: "cargo run", server: "cargo run" }   # command per project-type/shape
  honest: true                          # true = a real runnable binary
configScaffold: [Cargo.toml, rustfmt.toml]
verified: web-2026-07                   # provenance for the whole entry
```

### Field reference

| Field | Meaning |
|---|---|
| `language` | The registry key. REQUIRED — a file with no `language` is skipped + warned. |
| `detectionMarkers` | Exact filenames; if any exists in a project, the language is detected. |
| `extensions` | Source-file extensions (informational for the surfaces). |
| `toolchain.<phase>` | A `{ cmd, tool, verified, altCmd? }` entry per phase. REQUIRED object. |
| `toolchain.<phase>.cmd` | The command STRING to run for that phase. Never empty. |
| `toolchain.<phase>.tool` | The underlying tool's name (e.g. `clippy`, `ruff`). |
| `toolchain.<phase>.altCmd` | An optional alternative command (e.g. `biome check .` for TS lint). |
| `run.shapes` | Map of project-type → run command (`cli`, `server`, `web`, `mobile`). |
| `run.honest` | `true` (a genuinely runnable/pollable runtime) or `build-is-last-mile` (mobile/desktop: build+test is the CI-safe last mile — never a false "it ran"). |
| `configScaffold` | Config files a scaffolder would create for the language. |
| `verified` | Provenance. `web-2026-07` (web-sourced 2026 anchor) or `UNVERIFIED`. **Never `guessed`.** |

Recognized `toolchain` phases: `lint`, `format`, `typecheck`, `test`, `coverage`,
`security`, `depsAudit`, `build`. `lint` is required for every language. `test` is
required for every RUNNABLE language, but is honestly OMITTED by non-runnable
config/data languages that have no test concept — `dockerfile`, `github-actions`,
`shell`, and `yaml` deliberately declare no `test` phase (an absent phase is honest
N/A, never a stub). A phase a language genuinely lacks is omitted, never faked.

### Provenance rule (invariant)

Every command is web-grounded and carries `verified: web-2026-07`, or is honestly
flagged `verified: UNVERIFIED` when an exact CI-standard invocation cannot be
confirmed (e.g. Dart has no established dedicated static-application-security-testing
tool; Kotlin/Android OWASP dependency-check and Kover). **No command is ever
fabricated, and no entry is ever flagged `guessed`** — enforced by
`tests/capability-registry.test.js`.

## The engine API

The lookups the four surfaces call (CR5 wires them; app-runner already consumes the
registry for the non-JS run last mile in CR1):

- `load(projectRoot?)` → `{ languages, warnings }`. Reads the bundled seed data,
  then overlays a project's `.ctoc/capabilities/languages/*` (a project override
  replaces a bundled language of the same name). Fail-open per entry.
- `detectLanguages(projectRoot)` → the languages whose `detectionMarkers` exist.
- `capabilitiesFor(language, projectRoot?)` → the whole capability object, or null.
- `toolchainFor(language, phase, projectRoot?)` → the `{ cmd, tool, verified, … }`
  entry (an inert string command), or null.
- `runStrategyFor(language, projectType, projectRoot?)` →
  `{ command, honest, shape }`, or null. `honest` is `true` or `build-is-last-mile`.

## One project-type entry (CR3)

A language names the toolchain; a **project type** names *which phases matter*, the
*run strategy*, and the *config scaffold* — so a Flutter app, a Rust CLI, a
data-science notebook and a microservice monorepo get different pipelines even in
the same language. Each `.ctoc/capabilities/project-types/<type>.yaml` declares:

```yaml
projectType: mobile-crossplatform        # REQUIRED — the key this entry registers under
detectionMarkers: [pubspec.yaml, app.json]  # exact filenames/dirnames whose presence detects the type
frameworks: [flutter, react-native, expo]   # informational: frameworks that map to this type
priority: 70                             # detection tie-break: higher wins (turbo.json→monorepo beats a plain package.json)
runShape: mobile                         # which of the LANGUAGE's run.shapes keys this type maps to (cli|server|web|mobile|desktop|none)
phases: { lint: required, typecheck: required, test: required,
          security: recommended, coverage: recommended }   # REQUIRED — phase relevance
run: { strategy: build-and-test, honest: build-is-last-mile }  # REQUIRED — run strategy + honest flag
configScaffold: [pubspec.yaml, analysis_options.yaml, .gitignore]  # REQUIRED — non-empty
verified: web-2026-07                    # provenance, or UNVERIFIED
```

### Project-type field reference

| Field | Meaning |
|---|---|
| `projectType` | The registry key. REQUIRED — a file with no `projectType` is skipped + warned. |
| `detectionMarkers` | Exact filenames/dirnames; if any exists in a project, the type matches. No globs (no ReDoS). |
| `frameworks` | Frameworks that map to this type (informational). |
| `priority` | Detection tie-break — the highest-priority matching type wins (default 0). |
| `runShape` | The `run.shapes` key of the matched LANGUAGE that `pipelineFor` reads the run command from. `none` when the type has no runtime. |
| `phases.<phase>` | The relevance of a phase for this type: `required` \| `recommended` \| `optional` \| `skip`. REQUIRED object. |
| `run.strategy` | How the type is run (e.g. `dev-server`, `server-probe`, `build-and-test`, `help-exit-0`, `notebook-execute`, `plan-only`, `none`). |
| `run.honest` | `true` (a genuinely runnable/pollable runtime), `false` (no human-facing runtime — a library/infra), `build-is-last-mile` (mobile/desktop), or a descriptor like `notebook-executes` / `per-workspace`. **Never a false "it ran".** |
| `configScaffold` | Config files/dirs a scaffolder would create for this type. REQUIRED, non-empty. |
| `verified` | Provenance. `web-2026-07` or `UNVERIFIED`. **Never `guessed`.** |

Recognized phase-relevance tokens: `required`, `recommended`, `optional`, `skip`.

### The 13 shipped project types (CR3)

`web-frontend` (dev-server, honest:true) · `web-backend` (server-probe, honest:true,
security required) · `mobile-crossplatform` (build-is-last-mile) ·
`mobile-native-android` (build-is-last-mile) · `mobile-native-ios`
(build-is-last-mile) · `desktop` (build-is-last-mile) · `cli` (help-exit-0,
honest:true) · `library` (**honest:false — no runtime**, coverage required) ·
`data-science` (notebook-execute, honest:notebook-executes) · `ml-service`
(serve-probe, honest:true, test required) · `microservice` (server-probe,
honest:true, security required) · `monorepo` (per-workspace) · `infra` (plan-only,
**honest:false**, test/typecheck/coverage `skip`, security required).

### The project-type engine API

- `loadProjectTypes(projectRoot?)` → `{ projectTypes, warnings }`. Bundled seed data,
  then a project's `.ctoc/capabilities/project-types/*` overlaid. Fail-open per entry.
- `projectTypeFor(projectRoot)` → the detected project-type name (by `detectionMarkers`,
  resolved with `priority`), or null.
- `pipelineFor(language, projectType, projectRoot?)` → the MERGE: each phase's
  relevance (from the type) + command (from the language toolchain); the run strategy
  + honest flag (from the type) enriched with the language's run command (via
  `runShape`); the UNION of both config scaffolds. Null when either is unknown.

**Live consumer:** app-runner's `detectRunTarget` calls `projectTypeFor` +
`pipelineFor` to attach the detected `taxonomy` and the merged `pipeline` to a native
run target — the CR3 engine functions are wired to a real caller, never test-only.

## One framework entry (FW-w1)

A language names the toolchain; a project type names the pipeline shape; a database
names the persistence layer; a **framework** names the *application layer*: its
category (frontend/backend/fullstack/api), its language, its framework-specific
security **concern areas**, a test/lint hint, and a config scaffold. Frameworks live
in a project's **dependencies** (`next`, `@nestjs/core`, `django`) and/or config
**markers** (`manage.py`, `angular.json`, `artisan`) — so *enrichment* is dep/marker
matching in stack-detector (which consumes `loadFrameworks`), and this registry holds
the capability data. Each `.ctoc/capabilities/frameworks/<framework>.yaml` declares:

```yaml
framework: nextjs                 # REQUIRED — the key this entry registers under
category: web-fullstack           # web-frontend | web-backend | web-fullstack | api | test
language: typescript              # the framework's primary language
deps: [next]                      # detection dep names (node package.json + python requirements.txt)
files: [next.config.js, next.config.mjs, next.config.ts]   # config markers (existsSync)
security:
  concerns: [security-headers, env-exposure, ssrf, auth-middleware]  # framework-specific areas
test: "next build && vitest"      # the conventional test/lint hint
configScaffold: [next.config.ts, .env.example, middleware.ts]
verified: web-2026-07             # provenance, or UNVERIFIED
```

### Framework field reference

| Field | Meaning |
|---|---|
| `framework` | The registry key. REQUIRED — a file with no `framework` is skipped + warned. |
| `category` | `web-frontend` \| `web-backend` \| `web-fullstack` \| `api` \| `test`. REQUIRED. |
| `language` | The framework's primary language. REQUIRED. |
| `deps` | Detection dep names (node package.json + python requirements.txt). REQUIRED, non-empty — enrichment depends on it. |
| `files` | Framework-specific config markers matched by `existsSync` (may be empty when the framework ships no unique root marker). |
| `security.concerns` | The framework-specific security areas. REQUIRED, non-empty. **FW-w2 turns these into real checks; wave 1 records them honestly.** |
| `test` | The conventional test/lint hint (an inert string). |
| `configScaffold` | Config files a scaffolder would create for the framework. |
| `verified` | Provenance. `web-2026-07` or `UNVERIFIED` (e.g. a framework whose canonical test runner varies, or whose deps live in an un-parsed build file). **Never `guessed`.** |

### The 18 shipped frameworks (FW-w1)

Frontend/fullstack: `nextjs` · `react` (UNVERIFIED — runner varies) · `vue` ·
`angular` · `svelte` · `astro` · `nuxt` · `remix`. Node backend: `express`
(UNVERIFIED) · `nestjs` · `fastify` (UNVERIFIED). Python: `django` · `fastapi` ·
`flask`. Ruby: `rails`. PHP: `laravel`. Java: `spring-boot` (UNVERIFIED — Maven/Gradle
test command varies, deps in un-parsed pom.xml/build.gradle). Elixir: `phoenix`
(UNVERIFIED — deps in un-parsed mix.exs, no unique root marker → detection limited).

### The framework engine API

- `loadFrameworks(projectRoot?)` → `{ frameworks, warnings }`. Bundled seed data, then a
  project's `.ctoc/capabilities/frameworks/*` overlaid. Fail-open per entry.
- `frameworkCapability(name, projectRoot?)` → the whole capability object, or null.

**Live consumer:** stack-detector's `frameworkCapabilities(projectPath)` matches each
registry framework's `deps`/`files` against the project and returns the enriched
records; `detectStack` attaches them as an additive `frameworkCapabilities` field
(the legacy `frameworks: string[]` is unchanged), and SessionStart renders each
detected framework's security concerns — the FW-w1 engine functions are wired to a
real caller, never test-only. FW-w2 turns `security.concerns` into real checks.

## Seed languages (CR1)

Six web-grounded 2026 toolchains: **dart** (Flutter), **kotlin** (Android),
**rust**, plus **python**, **typescript**, **go** — the last three seeded to PROVE
parity with tool-detector's current `DEFAULT_TOOLS` (their `lint`/`test` commands
match exactly, so CR5's swap is behavior-preserving). CR2 adds the rest of the top
20; CR5 wires all four surfaces.
