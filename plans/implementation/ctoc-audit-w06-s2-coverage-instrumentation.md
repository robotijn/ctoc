---
title: "W06-s2 — Coverage is measured; any skip fails the gate"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - src/scripts/test-gate.js
  - tests/coverage-gate.test.js
  - package.json
priority: HIGH
---

# W06-s2 — Coverage is measured; any skip fails the gate

**Stories:** S3 `[MVP]`, S4 — findings **A4**.
**Pairing:** SELF-PAIRED. Wiring coverage into `npm test` and treating `# skipped > 0`
as failure is explicitly in W06's scope (test infrastructure). This slice goes GREEN
within itself; RED-now is guaranteed because the gate module does not exist yet.

## Implementation Details

### Architecture Decision

Two defects, one gate. (A4) The suite runs under bare `node --test tests/*.test.js` with
**no coverage instrumentation** — the documented "≥ 80%" figure has no instrument behind
it. (S4) `# skipped > 0` is invisible under the `# fail 0` gate. Both are fixed by a
single **run-summary gate** that (1) requires the run to carry a numeric coverage figure,
(2) fails on coverage below 80, and (3) fails on any skip. Per the parent's decision,
coverage uses Node's built-in `node --test --experimental-test-coverage` — **zero new
dependency**, already available in the project's supported Node range.

The gate is a small script `src/scripts/test-gate.js` that runs the suite with coverage,
parses the TAP/`node:test` run summary (`# tests`, `# pass`, `# fail`, `# skipped`, and
the coverage report's `all files … % lines`), and exits non-zero when any of the three
conditions trips. `package.json`'s `test` script routes through it. The **gate logic** is
unit-tested on synthetic summaries in `tests/coverage-gate.test.js`, so RED/GREEN is
deterministic and independent of the live suite's momentary numbers.

### Dependency Graph

```
package.json (scripts.test) --invokes--> src/scripts/test-gate.js --spawns--> node --test --experimental-test-coverage
tests/coverage-gate.test.js --hard-require--> src/scripts/test-gate.js (exported pure parsers)
```

`src/scripts/test-gate.js` exports pure functions (`evaluateSummary({skipped, coveragePct})`,
`parseCoveragePct(text)`, `parseSkipped(text)`) so the gate decision is testable without
spawning a subprocess. The CLI wrapper (`if (require.main === module)`) does the spawn +
`process.exit`. Independent of s1, s3–s7 (no shared files).

### File Specifications

#### `src/scripts/test-gate.js` (CREATE — test infrastructure)
- `parseSkipped(summaryText) -> number` — extracts the `# skipped N` line from a
  `node:test` summary; returns `N` (0 if absent).
- `parseCoveragePct(coverageText) -> number|null` — extracts the "all files" line-coverage
  percentage from `--experimental-test-coverage` output; returns `null` if no coverage
  block is present (this is itself a failure condition — coverage must be measured).
- `evaluateSummary({ skipped, coveragePct, fail }, { threshold = 80 }) -> { ok, reasons[] }`
  — `ok=false` when `fail > 0`, or `skipped > 0`, or `coveragePct === null`, or
  `coveragePct < threshold`; `reasons` names each trip (e.g. `"coverage 71.4% < 80%"`,
  `"# skipped 1 > 0"`).
- CLI (`require.main === module`): spawn `node --test --experimental-test-coverage
  tests/*.test.js` (cross-platform: use `process.execPath` + args array via
  `child_process.spawnSync`, **no shell string**, per the cross-platform rule), capture
  stdout, run the parsers + `evaluateSummary`, print the reasons, `process.exit(ok ? 0 : 1)`.
  Coverage figure is echoed next to the 80% threshold on every run.

#### `tests/coverage-gate.test.js` (CREATE — the invariant)
- Hard `require('../src/scripts/test-gate.js')` (RED-now: file absent → throws → the file
  FAILS, not skips — obeying the s1 discipline).
- Cases (synthetic input, deterministic):
  1. `evaluateSummary({fail:0, skipped:0, coveragePct:92})` → `ok:true`.
  2. `evaluateSummary({fail:0, skipped:1, coveragePct:92})` → `ok:false`, reason names skip.
  3. `evaluateSummary({fail:0, skipped:0, coveragePct:71.4})` → `ok:false`, reason prints
     `71.4%` next to `80%`.
  4. `evaluateSummary({fail:0, skipped:0, coveragePct:null})` → `ok:false` (coverage
     unmeasured is a failure).
  5. `parseSkipped('# skipped 3')` → `3`; `parseSkipped('# skipped 0')` → `0`.
  6. `parseCoveragePct('# all files | 84.20 |')`-shaped sample → `84.2`;
     `parseCoveragePct('no coverage here')` → `null`.
- Plus one **wiring assertion**: read the real `package.json` from disk and assert
  `scripts.test` contains both `--experimental-test-coverage` and an invocation of
  `test-gate.js` (RED-now: current script is `node --test tests/*.test.js`).

#### `package.json` (MODIFY)
- `scripts.test` → `node src/scripts/test-gate.js` (which internally runs the suite with
  `--experimental-test-coverage`). Keep a `scripts.test:raw` = `node --test tests/*.test.js`
  escape hatch for debugging without the gate.

### RED-now evidence
- `package.json.scripts.test` today = `node --test tests/*.test.js` — no coverage flag,
  no gate → the wiring assertion FAILS now.
- `src/scripts/test-gate.js` does not exist → `tests/coverage-gate.test.js` FAILS to load
  now (hard require throws).

### Known consequence (schedule is the maintainer's)
Arming the gate makes `npm test` fail if live line-coverage is below 80%. That is the
intended instrument, not a W06 defect. Raising live coverage is a broad test-writing
effort owned across workstreams; **W06 delivers the measuring instrument, not the number.**
The gate-logic tests here are on synthetic input so this slice is GREEN regardless of the
live figure; whether/when to let the live-threshold block the suite is the maintainer's
scheduling call at the gate.

### Test Plan
See `tests/coverage-gate.test.js` above — pure-function gate logic + one real-`package.json`
wiring assertion. No mocks of core logic; the only external boundary (the subprocess spawn)
is exercised by the CLI path, not unit-tested (spawning the whole suite inside a unit test
is neither necessary nor stable).

### Security Review
- [x] Command injection: subprocess uses `spawnSync(process.execPath, [args…])` — argument
  array, **no shell interpolation**.
- [x] Path traversal: fixed glob `tests/*.test.js`; no user input reaches the spawn.
- [x] Cross-platform: `process.execPath`, args array, `path.join`; no `2>/dev/null`, no
  shell.
- [x] No secrets; error/reason strings contain only counts and percentages.

## Execution Plan

### Step 8: TEST
Write `tests/coverage-gate.test.js` (gate-logic cases + the `package.json` wiring
assertion). Run against today's tree and **capture RED**: the file fails to load
(`test-gate.js` absent) and the wiring assertion would fail (no coverage flag). This is
the acceptance evidence for S3/S4.

### Step 9: PREPARE
Confirm the project's Node supports `--experimental-test-coverage` (parent decision: yes).
Confirm `src/scripts/` is a valid home for a test-infra script (it hosts `release.js`).

### Step 10: IMPLEMENT
One step, file sub-items — the self-paired fix:
- [ ] `src/scripts/test-gate.js` — pure parsers + `evaluateSummary` + CLI spawn/exit
- [ ] `package.json` — route `scripts.test` through the gate; add `scripts.test:raw`

### Step 11: REVIEW
Verify the three trip conditions each map to a distinct `reasons[]` entry; verify
`coveragePct === null` is treated as failure (unmeasured ≠ passing). Confirm the CLI path
echoes the coverage figure next to the threshold.

### Step 12: OPTIMIZE
Single pass over the captured stdout for parsing; no double-spawn. Parsers are plain regex
on the summary text — no dependency added.

### Step 13: SECURE
Re-confirm `spawnSync` uses an argument array and never a shell string; confirm no
POSIX-only redirection. Confirm exit code is non-zero on every failure branch (the whole
reason the finding existed is a gate that signalled but did not fail).

### Step 14: VERIFY
`node --test tests/coverage-gate.test.js` → GREEN (all gate-logic cases + wiring
assertion pass). Run `node src/scripts/test-gate.js` once and confirm a numeric coverage
percentage prints next to `80%` and the exit code reflects the result.

### Step 15: DOCUMENT
Header comment in `src/scripts/test-gate.js` naming finding A4 + S4. Note the
`scripts.test:raw` escape hatch inline.

### Step 16: FINAL-REVIEW
Confirm: gate module exists; `package.json` routes through it with the coverage flag;
gate-logic RED-before / GREEN-after captured; `# skipped > 0` and `< 80%` and
unmeasured-coverage each fail. Ready for the batched Gate 2.

## Decisions Taken Under Ambiguity
- **Gate as a script under `src/scripts/`, not a lib module.** It is test infrastructure
  (sibling of `release.js`), keeping it out of the `src/lib/` production surface while
  remaining importable for unit tests.
- **Live-threshold enforcement is wired but its blocking is the maintainer's schedule.**
  W06 ships the instrument and proves the gate logic; it does not manufacture an 80%
  figure. The synthetic-input tests keep this slice deterministically GREEN.
- **`spawnSync` with an args array over a shell string** — satisfies the cross-platform
  rule and eliminates command-injection surface.
