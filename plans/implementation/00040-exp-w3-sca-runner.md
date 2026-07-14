---
title: "Expansion wave 3 — SCA runner (consume the registry's depsAudit commands)"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00039-exp-w2fix-solidity-dockerfile
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/sca-runner.js"
  - "src/lib/quality-agent.js"
  - "tests/sca-runner.test.js"
---

# Wave 3 — the SCA (software-composition analysis) runner

The registry defines a `depsAudit` command for most languages (npm audit, pip-audit,
cargo audit, govulncheck, composer audit, bundler-audit, osv-scanner, …) but NOTHING
consumes them — dependency CVEs are unchecked across all 24 languages. Build an SCA
runner that runs + parses them, modeled EXACTLY on the existing `src/lib/sast-runner.js`
(read it IN FULL first — same class shape, same honest routing, same fail-closed, same
argv-safe execFileSync execution, same exported-surface discipline).

## Design (mirror sast-runner's honest routing — this is the load-bearing rule)
`src/lib/sca-runner.js`, `class SCARunner(projectRoot, options)`:
1. `detectLanguages()` → `require('./capability-registry').detectLanguages(this.projectRoot)`.
2. **osv-scanner is the UNIVERSAL SCA engine** (the SCA analog of semgrep-universal for
   SAST): it covers 11+ ecosystems via lockfiles with ONE unified OSV JSON format
   (C/C++, Dart, Elixir, Go, Java, JS, PHP, Python, R, Ruby, Rust). Write ONE parser for
   OSV JSON.
3. `scaRouteFor(lang)` — the honesty-critical predicate: return `{ native, osvUniversal }`.
   A language routes to a NATIVE tool ONLY if this runner has a real parser for it. Write
   native parsers for the JSON-emitting tools with stable formats: **npm audit** (`--json`),
   **pip-audit** (`--format json`), **cargo audit** (`--json`). Every OTHER language routes
   to **osv-scanner** (`osv-scanner scan --format json .`), which is parsed. NEVER attribute
   a finding to a tool this runner cannot parse (composer audit / bundler-audit / govulncheck
   text formats → route to osv-scanner, do not fake-parse). If neither a native parser nor
   osv-scanner is available/installed, record `scanned:false` with an honest reason
   (mirror sast-runner-failclosed semantics exactly).
4. `run()` → run the routed tool per detected language (or osv-scanner once for the whole
   repo, since it is lockfile-based and multi-ecosystem — prefer ONE osv-scanner pass for
   all osv-routed languages, plus the native tools for their languages), parse, map severity
   (reuse sast-runner's SEVERITY + CWE mapping shape), dedupe by (package, advisory-id),
   `generateSummary` / `generateReport` / `checkThreshold` mirroring sast-runner.
5. Export the same public surface shape as sast-runner (`SCARunner`, `SEVERITY`, a
   `TOOL_PARSERS`/route table). Every export MUST have a live caller (see wiring) — no dead
   exports (the fence will catch them).

## Wiring — MANDATORY (wired-is-done, same slice)
Add an SCA step to `src/lib/quality-agent.js` right after the SAST step, mirroring its
structure: detect languages, compute `scannable` from `scaRouteFor` (native-installed OR
osv-scanner-installed), print an honest per-language "no SCA scanner" skip for the rest,
run, and keep the belt-and-suspenders `scanned===false` → loud skip. This is the live
caller that keeps SCARunner reachable. Do NOT ship a runner nothing calls.

## Security
This runner EXECUTES scanners — every exec stays on the existing `execFileSync` argv-safe
path (copy sast-runner's exact pattern); add NO string-concatenated shell. The registry
depsAudit strings are inert data; the runner splits/executes them the same safe way
sast-runner does its TOOL_CONFIGS commands.

## TDD-Red FIRST
`tests/sca-runner.test.js` (real temp-dir fixtures; mock ONLY external tool-availability,
exactly as sast-runner-failclosed.test.js does — never mock core parsing logic):
- a JS project (package.json) routes to npm audit (native parser); a Rust project to cargo
  audit; a Python project to pip-audit; a Go/PHP/Ruby project (no native parser here)
  routes to osv-scanner universal — asserted via `scaRouteFor`.
- an OSV JSON fixture parses into findings with the right package + severity.
- an npm-audit JSON fixture parses correctly.
- HONESTY: no language ever routes to a parser-less tool; a language detected with NO
  available scanner yields `scanned:false` with a reason (not a silent pass).
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/sca-runner.test.js tests/quality-fleet-wiring.test.js tests/security.test.js
tests/sast-runner-failclosed.test.js` all green; eslint clean on the 3 touched files;
`node node_modules/typescript/bin/tsc --noEmit` → 0; dead-export fence + iron-loop-enforcer
0 block (SCARunner is reachable from quality-agent); NO git. Step 16: report the route table
(which languages → native parser vs osv-universal) and the quality-agent wiring edge.
