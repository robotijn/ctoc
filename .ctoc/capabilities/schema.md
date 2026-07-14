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
`security`, `depsAudit`, `build`. `lint` and `test` are required for every language.

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

## Seed languages (CR1)

Six web-grounded 2026 toolchains: **dart** (Flutter), **kotlin** (Android),
**rust**, plus **python**, **typescript**, **go** — the last three seeded to PROVE
parity with tool-detector's current `DEFAULT_TOOLS` (their `lint`/`test` commands
match exactly, so CR5's swap is behavior-preserving). CR2 adds the rest of the top
20; CR5 wires all four surfaces.
