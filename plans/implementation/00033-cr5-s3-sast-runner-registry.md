---
title: "CR5-s3 — sast-runner consumes the capability registry"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00031-cr5-s1-glob-extension-detection
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/sast-runner.js"
  - "tests/sast-runner-registry.test.js"
---

# CR5-s3 — sast-runner: registry-driven language detection, honest parser routing

`sast-runner.js` detects 8 languages and has SAST tool configs for 5 (python bandit,
js/ts eslint, go gosec, java spotbugs) + a semgrep universal fallback. Its result
PARSERS exist only for semgrep / bandit / gosec / eslint. Wire detection to the
registry (20 languages) WITHOUT pretending to parse tools it cannot parse.

## The change
1. `detectLanguages()` (class method): consume
   `require('./capability-registry').detectLanguages(this.projectRoot)` (glob-aware,
   superset of the current 8). Keep the return shape the rest of the class expects.
2. Security-tool routing — the HONESTY-CRITICAL part:
   - For a detected language whose registry `security` tool has a KNOWN parser here
     (bandit / gosec / eslint / semgrep), run it and parse it as today.
   - For ALL OTHER detected languages (cppcheck, brakeman, psalm, cargo-audit, oclint,
     sqlfluff, detekt, …) DO NOT fabricate a parser. Route them to the **semgrep
     universal** config (`p/security-audit` + `p/owasp-top-ten`), which is
     multi-language and HAS a parser. This keeps every finding real.
   - Never emit a parsed finding from an unparsed tool. If neither a native parser nor
     semgrep is available, record the language as scanned:false with an honest reason
     (mirror the existing fail-closed behavior from sast-runner-failclosed).
3. depsAudit (npm audit / pip-audit / cargo audit — different output formats) is OUT OF
   SCOPE here (this is SAST, not SCA). Note it as a follow-up; do not add it.

## REGRESSION GUARDS
- **`tests/sast-runner-failclosed.test.js` and `tests/security.test.js` stay green**
  WITHOUT editing them — the fail-closed-on-scanner-crash and scanned:false semantics
  must be preserved.
- python/js/ts/go/java security behavior UNCHANGED (same native tools, same parsers).
- `quality-agent.js` imports this module — keep the public surface
  (`SASTRunner`, `SEVERITY`, `TOOL_CONFIGS`) exported and shaped as today.
- Engine safety: sast-runner legitimately executes scanners (it is the runner, not the
  registry) — keep every exec on the existing execFileSync/argv-safe path; add none by
  string concatenation.

## TDD-Red FIRST
New file `tests/sast-runner-registry.test.js`, real fixtures, zero mocks:
- a Rust project (`Cargo.toml`) is now DETECTED by the runner (was invisible) and routes
  to the semgrep universal config (no fake cargo-audit parsing).
- a PHP project (`composer.json`) detected → semgrep universal route.
- REGRESSION: a Python project still selects bandit; a Go project still gosec; a JS
  project still eslint-security — same tool, same parser.
- an unparsed-tool language never yields a finding attributed to a tool with no parser.
Run RED first (the detection-superset assertions fail before wiring).

## VERIFY (Step 14) — paste verbatim
`node --test tests/sast-runner-registry.test.js tests/sast-runner-failclosed.test.js
tests/security.test.js` all green; eslint clean on the two touched files; NO git; do
not move the plan. Report before→after detected-language count and the exact parser-
routing table (which langs use a native parser vs semgrep universal).
