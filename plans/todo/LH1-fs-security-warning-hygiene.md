---
iron_loop: true
approved_by: human
approved_at: 2026-07-01T06:36:17.738Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-30T22:02:42.942Z
gate_crossed: functional → implementation
---

---
iron_loop: true
step: 7
step_label: SPEC
files:
  - eslint.config.js
  - package.json
  - src/lib/safe-fs.js
  - tests/safe-fs.test.js
  - src/lib/regex-utils.js
  - tests/regex-utils.test.js
  - tests/readme-numbers.test.js
  - docs/SECURITY_LINT.md
  - "src/**/*.js"
  - "tests/**/*.js"
status: implementation
created: 2026-06-30
updated: 2026-07-01
---

# LH1 — Security-plugin warning hygiene (1036 → 0) + treat warnings as errors

## 1. ASSESS — Problem Understanding

### Business Context

CTOC's binding doctrine (`principle_warnings_are_bugs`) treats every linter
warning as a critical-tier defect: "time is a vector; today's warning is
tomorrow's crash." The repo currently carries **1,036 `eslint-plugin-security`
warnings across 5 rules and 114 files**, and the lint gate is configured to pass
on warnings (`'warn'` severity, no `--max-warnings` cap). This baseline has
accumulated silently and directly contradicts the warnings-are-bugs rule.

### Current State — the 1,036 warnings by rule

| Rule | Count | Nature | Treatment |
|---|---|---|---|
| `security/detect-non-literal-fs-filename` | 990 | heuristic — every `fs.*` call on a computed path (the tool's core job) | centralize + validate |
| `security/detect-non-literal-regexp` | 29 | `new RegExp(var)` | escape/validate or justify |
| `security/detect-unsafe-regex` | 14 | **REAL** — catastrophic-backtracking / ReDoS | fix the regex |
| `security/detect-possible-timing-attacks` | 1 | **REAL** — non-constant-time compare on a secret | constant-time compare |
| `security/detect-non-literal-require` | 1 | dynamic `require(var)` | make literal or justify |

`eslint.config.js:123-137` currently sets all of these to `'warn'` with an
explicit comment asserting the fs warnings "are not bugs … this repo's core job
is reading/writing plan files at computed paths." This plan **deliberately
overrides that policy** per direct CTO directive (2026-06-30): fix the warnings
and make the rules `error`-level so they cannot silently re-accumulate.

The `detect-non-literal-fs-filename` heuristic fires on ANY non-literal path
argument — overwhelmingly false positives for an internal file-management tool
(the highest-risk module, `stale-cleanup.js`, already had its traversal surface
proven closed by the SP4 security-scanner). But indistinguishable, at the gate,
from a real traversal hole. The 14 `detect-unsafe-regex` and the 1
timing-attack are NOT false positives and must be fixed for real.

### Impact

- The warnings-are-bugs rule is unenforceable while 1,036 advisory warnings are
  the accepted norm: a genuinely dangerous new fs/regex call hides in the noise.
- New fs/regex-touching modules inherit the baseline and can't ship clean.
- 14 ReDoS-prone regexes + 1 timing-attack-prone compare are live, unactioned.

## 2. ALIGN — Approach (recommendation; final lock at Gate 2)

### fs-filename (990) — candidate approaches

- **(A) Centralized audited `safe-fs.js` wrapper — RECOMMENDED.** A thin,
  behavior-preserving module that re-exports the fs operations used at computed
  paths, performing real input validation (path is a non-empty string; reject
  NUL bytes; `path.normalize`); the single `eslint-disable` for the rule lives
  ONLY inside this audited file. All other modules import `safeFs.*`. Converts
  990 scattered heuristic warnings into ONE audited choke point + a real,
  tested invariant — not mere silence — and lets the rule be set to `error`.
  Cost: ~990 mechanical call-site migrations across 114 files (CTOC-agent
  parallelizable, file-partitioned). Low behavioral risk (pass-through).
- (B) Inline `eslint-disable-next-line … -- <justification>` at each of 990
  sites — silence only, no invariant, highest churn.
- (C) Scoped config rationale (file-level disable + `docs/SECURITY_LINT.md`) —
  leaves the heuristic off where a real hole could hide.

### Other rules

- `detect-unsafe-regex` (14): rewrite each regex to remove nested quantifiers /
  catastrophic backtracking; add a unit test proving bounded match time. REAL.
- `detect-possible-timing-attacks` (1): replace `===` secret compare with
  `crypto.timingSafeEqual` (length-guarded). REAL.
- `detect-non-literal-regexp` (29): route through an escape helper
  (`RegExp(escapeRegex(x))`) where the source is data, or justify where the
  source is a trusted constant.
- `detect-non-literal-require` (1): make the require literal, or justify.

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC maintainer who treats warnings as bugs,
**I want** all 1,036 `eslint-plugin-security` warnings resolved by one
consistent strategy AND the rules promoted to `error` with a zero-warning gate,
**so that** a genuinely dangerous fs/regex/timing call can never hide in
advisory noise, and the suite fails fast if one is reintroduced.

### BDD Scenarios

- [ ] **Scenario: zero security-plugin warnings remain**
  Given the chosen strategy is applied across all 114 files
  When `npx eslint src/` runs
  Then it reports 0 warnings from all five `security/*` rules above

- [ ] **Scenario: warnings are treated as errors (gate fails on any)**
  Given the cleanup is complete
  When the lint gate runs (`eslint src/ --max-warnings 0`, and the five rules
  set to `'error'` in `eslint.config.js`)
  Then a single reintroduced raw `fs.*`-on-computed-path (or unsafe regex)
  fails lint with a non-zero exit, proven by a guard test

- [ ] **Scenario: fs access is centralized and validated (Option A/D)**
  Given `src/lib/safe-fs.js` exists with the sole rule-disable
  When a path argument is empty / non-string / contains a NUL byte
  Then `safeFs.*` throws (fail-closed), proven by unit tests — a real invariant,
  not a suppressed warning

- [ ] **Scenario: the 14 unsafe regexes are fixed, not silenced**
  Given each previously `detect-unsafe-regex` site
  Then the regex is rewritten to have no catastrophic backtracking
  And a unit test feeds a pathological input and asserts bounded match time

- [ ] **Scenario: the timing-attack compare is constant-time**
  Given the `detect-possible-timing-attacks` site
  Then the secret comparison uses `crypto.timingSafeEqual` (length-guarded)

- [ ] **Scenario: behavior is unchanged**
  Given the full hygiene pass
  When `node --test tests/*.test.js` runs
  Then the suite is green (this is hygiene + real-smell fixes, no feature change)

- [ ] **Scenario: tests/ override preserved**
  Given the tests/ block in `eslint.config.js` (tests use dynamic paths/fixtures)
  Then tests continue to lint clean without forcing test code through `safe-fs`

- [ ] **Scenario: rationale documented**
  Given `docs/SECURITY_LINT.md`
  Then it records the strategy, the `safe-fs` boundary, and why each rule is now
  `error`, superseding the old "these are not bugs" comment

### In Scope

- `src/lib/safe-fs.js` (audited wrapper, sole rule-disable, input validation) + tests
- Migration of all `fs.*`-on-computed-path sites in `src/` to `safeFs.*` (114 files)
- Real fixes for the 14 unsafe-regex + 1 timing-attack + 29 non-literal-regexp + 1 non-literal-require
- `eslint.config.js`: promote the five `security/*` rules to `'error'`
- `package.json`: lint script runs with `--max-warnings 0`
- `docs/SECURITY_LINT.md` rationale
- Full-suite green (no behavior change)

### Out of Scope

- Test code routed through `safe-fs` (tests legitimately use dynamic fixture paths; tests/ override stays)
- Any runtime/feature behavior change
- The four human gates / enforcement logic (untouched)
- `security/detect-object-injection` (intentionally `off`, separate decision)

## 4. SPEC — Technical Plan + Execution (Steps 5–16)

> Re-measured `2026-07-01` via `npx eslint src/ -f json`: **990 / 29 / 14 / 1 / 1**
> (detect-non-literal-fs-filename / detect-non-literal-regexp / detect-unsafe-regex
> / detect-possible-timing-attacks / detect-non-literal-require). 114 src/ files
> carry the 990 fs warnings. tests/ tree carries 12 detect-non-literal-regexp
> (fs/require/child_process already off there). detect-child-process: 0 in src/.

### 4.0 Foundation (BUILT this run — TDD RED→GREEN, verified)

- **`src/lib/safe-fs.js`** — the audited fs choke point. Explicit per-method
  wrappers (no dynamic dispatch) so each `fs.<method>(computedPath, …)` call is
  visible in one place and the SOLE
  `/* eslint-disable security/detect-non-literal-fs-filename */` is genuinely
  load-bearing (verified: file lints 0/0; a dynamic-dispatch version made the
  disable "unused" → eslint-9 `reportUnusedDisableDirectives` warned).
  - Exports (sync): `existsSync, readFileSync, writeFileSync, appendFileSync,
    mkdirSync, readdirSync, statSync, lstatSync, unlinkSync, rmSync,
    realpathSync, readlinkSync, chmodSync, utimesSync, openSync` (single-path)
    + `renameSync, copyFileSync, cpSync` (two-path: BOTH validated).
  - Exports (`promises`): `readFile, writeFile, appendFile, mkdir, readdir,
    stat, lstat, unlink, rm, realpath, readlink, chmod` (single) + `rename,
    copyFile` (two-path). Also `validatePath` (the primitive).
  - Invariant: `validatePath(p)` throws (fail-closed) on empty string,
    non-string (number/object/null/undefined), and NUL-byte path; Buffer & URL
    pass through (fs accepts them). **No `path.normalize`** — validation only,
    byte-identical fs semantics (see Decisions §4.6).
  - Wrappers mirror fs arity explicitly (e.g. `writeFileSync(p, data, options)`)
    rather than `...rest` spread — spreading `any[]` into overloaded fs trips
    `tsc --checkJs` TS2556; explicit optional args (passed as `undefined` when
    omitted, which fs treats as omission) keep the file type-clean.
- **`tests/safe-fs.test.js`** — 12 tests, all GREEN
  (`node --test tests/safe-fs.test.js`): surface (every method exported),
  sync round-trip behavior-identical to fs (write via safeFs → read via raw fs
  and vice versa), `promises` round-trip, Buffer + file: URL passthrough,
  fail-closed throws on empty/non-string/NUL for every method, two-path methods
  validate BOTH args, promises reject (not sync-throw) on bad path.
- **`tests/readme-numbers.test.js`** — module-count guard bumped 108 → 109
  (mechanical acknowledgment of the sanctioned new module; NOT migration/config).
- Full suite GREEN after foundation: `node --test tests/*.test.js` →
  **2563 pass / 0 fail / 0 skipped / 0 todo**. `tsc` baseline held (≤89).

### 4.1 fs migration — AUTHORITATIVE WAVE PARTITION (18 waves, ≤8 files each)

Each wave is a bounded, single-context job for one implementer agent. Grouped by
directory cluster; **no file appears in two waves**; tests/ excluded (override
stays). Migration mechanics per file: add `const safeFs = require('<rel>/safe-fs')`
(relative to the file's dir), replace every path-taking `fs.<m>(` with
`safeFs.<m>(` for the wrapped methods; in promise-aliased files
(`const fs = require('fs').promises`) replace `fs.<m>(` → `safeFs.promises.<m>(`;
leave fd-based ops (`closeSync`, `readSync`, `writeSync`) on raw `fs` (no path,
not flagged). Numbers in parentheses = fs warnings in that file.

```
Wave 1  [src/lib] 8 files / 117 warn: actions.js(36), agent-critic-loop.js(8), agent-lock.js(12), agent-resolver.js(8), ai-provenance.js(5), architecture-detector.js(6), audit-chain.js(10), auto-fixer.js(32)
Wave 2  [src/lib] 8 files / 79 warn:  background.js(7), budget.js(7), ci-parser.js(17), ci-wizard.js(13), claude-md-lessons.js(11), cmd-audit.js(7), cmd-coverage.js(10), cmd-hooks.js(7)
Wave 3  [src/lib] 8 files / 59 warn:  cmd-ide.js(6), cmd-playwright.js(1), cmd-quality.js(4), cmd-security.js(9), config-baseline.js(19), coverage-checker.js(9), coverage-map.js(4), crypto.js(7)
Wave 4  [src/lib] 8 files / 46 warn:  ctoc-project-detector.js(5), data-lineage.js(5), dependency-auditor.js(2), deployment.js(12), enforcement-log.js(5), eval-harness.js(4), four-eyes.js(7), framework-detector.js(6)
Wave 5  [src/lib] 8 files / 165 warn: grading-system.js(3), hash-utils.js(7), hooks-installer.js(52), ide-config.js(9), inbox.js(10), init-project.js(40), iron-loop-enforcer.js(33), iron-loop.js(11)
Wave 6  [src/lib] 8 files / 37 warn:  legal-hold.js(10), letter-renderer.js(1), menu-screens.js(6), metrics-loop.js(5), mode-suggester.js(1), pipeline-orchestrator.js(2), plan-coverage.js(3), plan-validator.js(9)
Wave 7  [src/lib] 8 files / 75 warn:  playwright-scaffolder.js(12), privilege-posture.js(2), product-loop.js(8), project-analyzer.js(33), project-root.js(6), proportionality.js(3), quality-agent.js(2), quality-config.js(9)
Wave 8  [src/lib] 8 files / 63 warn:  quality-gate.js(5), quality-reporter.js(3), quality-scorer.js(20), quality-state.js(13), reconciliation.js(2), refinement-loop.js(10), regulatory-regime.js(6), retention.js(4)
Wave 9  [src/lib] 8 files / 50 warn:  runner-detect.js(4), runner-settings.js(7), runner-setup.js(14), sast-runner.js(1), secrets-scanner.js(3), sections.js(5), settings.js(5), skill-loader.js(11)
Wave 10 [src/lib] 8 files / 77 warn:  spoliation-safe.js(13), stack-detector.js(7), staged-files.js(6), stale-cleanup.js(14), stale-detector.js(7), state-manager.js(6), state.js(20), step-13-verify.js(4)
Wave 11 [src/lib] 8 files / 52 warn:  sync.js(8), test-runner.js(9), time-source.js(1), tool-detector.js(11), traceability-matrix.js(6), transition-log.js(7), upgrade-planner.js(3), v8-dispatcher.js(7)
Wave 12 [src/lib] 3 files / 35 warn:  version.js(18), violation-tracker.js(2), vision-decomposer.js(15)
Wave 13 [src/hooks] 6 files / 32 warn: andon-halt.js(12), human-gate-check.js(8), PostToolUse.status-check.js(4), PreToolUse.Edit.js(1), SessionStart.js(2), validate-plan-steps.js(5)
Wave 14 [src/commands] 2 files / 18 warn: menu.js(1), update.js(17)
Wave 15 [src/scripts] 8 files / 46 warn: add-exploration-template.js(3), build-coverage-map.js(7), evidence-pack.js(19), migrate-add-approval-markers.js(4), move-plan.js(1), release.js(6), run-evals.js(2), strip-unenforced-budgets.js(4)
Wave 16 [src/scripts] 3 files / 10 warn: test-human-gates.js(3), v8-add-tier.js(3), v8-migrate-skills.js(4)
Wave 17 [src/tabs] 2 files / 21 warn:  tools.js(4), vision.js(17)
Wave 18 [src/areas] 2 files / 8 warn:   library.js(6), system.js(2)
TOTAL: 18 waves, 114 files, 990 warnings, 0 duplicates.
```

Promise-aliased files needing `safeFs.promises.*` (not `safeFs.*`):
`grading-system.js`, `agent-critic-loop.js`, `pipeline-orchestrator.js`
(`const fs = require('fs').promises`); `eval-harness.js` (`fsp` alias);
`proportionality.js`, `regulatory-regime.js` (`fs.promises.*` direct).

### 4.2 REAL-SMELL INVENTORY — the non-fs rules (fix, do not silence)

**Threat-model framing:** CTOC is a local developer CLI that operates on the
user's OWN repo (plans, CI configs, state, the user's source). There is **no
untrusted remote-input path** into any of these regexes. Therefore **NO finding
is remotely exploitable / CRITICAL**. Per the warnings-are-bugs doctrine every
one is still fixed for real. The genuinely super-linear class (worth a
bounded-time regression test) is flagged MEDIUM; safe-regex false positives that
are provably linear are LOW.

#### (a) detect-unsafe-regex — 14 sites

MEDIUM (real catastrophic-backtracking class — `\s` is newline-inclusive, so
`\s+` inside a nested `(…)+`/`(…)*` next to `.*`/`.+`/`\S.*` is ambiguous across
line boundaries). Fix: anchor horizontal whitespace `\s`→`[ \t]` (and `\s*`→
`[ \t]*`) so a repetition cannot cross newlines, OR restructure to a line-based
split parser; add a unit test feeding a pathological input asserting bounded
match time.

| file:line | snippet | fix |
|---|---|---|
| ci-parser.js:202 | `/-\s*name:\s*([^\n]+)\s*\n\s*run:\s*\|?\s*\n?((?:[ \t]+[^\n]+\n?)+\|[^\n]+)/g` | replace mega-regex with line-based GitHub-Actions `run:` block parse; or anchor inner `\s`→`[ \t]` + drop the `\|[^\n]+` alternation overlap |
| ci-parser.js:266 | `/script:\s*\n((?:[ \t]+-[^\n]+\n?)+)/g` | line-based GitLab `script:` parse; or bound the block to a fixed indent depth |
| product-loop.js:88 | `/^launch_kpis:\s*\n((?:\s+-\s+\S.*\n)+)/m` | `/^launch_kpis:[ \t]*\n((?:[ \t]+-[ \t]+\S.*\n)+)/m` |
| reconciliation.js:97 | `/^files:\s*\n((?:\s+-\s+\S.*\n?)+)/m` | `/^files:[ \t]*\n((?:[ \t]+-[ \t]+\S.*\n?)+)/m` |
| regulatory-regime.js:183 | `/^\s+active_profiles:\s*(?:\[([^\]]*)\]\|\n((?:\s+-\s+\S+\n?)+))/m` | anchor leading+inner `\s`→`[ \t]`: `…\|\n((?:[ \t]+-[ \t]+\S+\n?)+))/m` |
| regulatory-regime.js:196 | `/^\s+overrides:\s*\n((?:\s+\S+:\s+\S+\n?)+)/m` | `/^[ \t]+overrides:[ \t]*\n((?:[ \t]+\S+:[ \t]+\S+\n?)+)/m` |
| runner-settings.js:53 | `/^ci:\s*\n((?:\s+.+\n)*)/m` | `/^ci:[ \t]*\n((?:[ \t]+.+\n)*)/m` |

LOW (safe-regex heuristic false positive — provably linear; minor bounded
rewrite clears the rule):

| file:line | snippet | root cause | fix |
|---|---|---|---|
| claude-md-lessons.js:310 | `raw.replace(/(\r?\n)*$/, '')` | trailing-newline trim; `(\r?\n)*$` flagged for `\r?` in starred group — disjoint chars, linear | `raw.replace(/[\r\n]+$/, '')` |
| eval-harness.js:227 | `/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/` | skill-path validate; mandatory `/` between repeats ⇒ bounded | split on `/`, test each segment `/^[a-z0-9][a-z0-9-]*$/` |
| quality-config.js:519 | ` /```(?:\w+)?\n([\s\S]*?)```/ ` | fenced-code extract; lazy `*?` with literal terminator ⇒ linear | parse by `indexOf('```')` index pair; or keep + prove bounded by test |
| runner-detect.js:137 | `/(\d+\.\d+(\.\d+)?)/` | semver from trusted CLI output; literal `.` separators ⇒ bounded | `/\d+\.\d+(?:\.\d+)?/` (drop nested capture) — input is `--version` output |
| secrets-scanner.js:132 | `/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g` | PEM header; `RSA` mandatory between the two `\s+` ⇒ linear backtracking only | `/-----BEGIN (?:RSA )?PRIVATE KEY-----/g` (PEM uses single spaces) |
| test-runner.js:273 | `/(\d+)\s*passed.*?(\d+)?\s*failed/i` | test-output parse; `.*?` bridge over trusted output | two regexes: `/(\d+)\s+passed/i` and `/(\d+)\s+failed/i` |
| time-source.js:128 | `/(-?\d+(?:\.\d+)?)\s*seconds?/` | chrony/ntp output; bounded digits | `/(-?\d+(?:\.\d+)?)[ \t]*seconds?/` |

#### (b) detect-possible-timing-attacks — 1 site (FALSE POSITIVE)

| file:line | snippet | assessment | fix |
|---|---|---|---|
| claude-md-lessons.js:118 | `} else if (token === fenceToken) {` | **NOT a secret compare.** `fenceToken` is a markdown fence char (`` ` `` or `~`); the rule fires only because the identifier matches its `*token*` secret-name heuristic. There is no security boundary. | **Rename** `fenceToken`→`fenceChar` (and local `token`→`fenceChar`) so the heuristic doesn't fire. **Do NOT** use `crypto.timingSafeEqual` — it is the wrong tool here (single-char, no secret) and would be misleading crypto-theater. *(This corrects the directive's default assumption for this specific site, on the evidence.)* |

#### (c) detect-non-literal-regexp — 29 sites

Fix strategy (mirrors safe-fs): add **`src/lib/regex-utils.js`** exporting
`escapeRegExp(str)` (single source of truth, replacing inlined
`.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')` copies) and `safeRegExp(pattern, flags)`
— the audited choke point holding the **sole**
`/* eslint-disable security/detect-non-literal-regexp */`. Route every dynamic
construction through `safeRegExp(...)`; wrap any data-derived interpolation in
`escapeRegExp(...)`. Then the rule → `error` at 0. (+ `tests/regex-utils.test.js`.)

- **Already-escaped data → route via safeRegExp (migrate inline escape to shared helper):** escape-phrases.js:37, stale-detector.js:451.
- **Glob→regex, already escapes before substituting → route via safeRegExp:** plan-coverage.js:65, stack-detector.js:122, refinement-loop.js:492.
- **Glob→regex, INCOMPLETE escaping (real correctness/injection smell — ADD full escaping, then safeRegExp):** hash-utils.js:245 (`pattern.replace(/\*/g,'.*')` — other metachars unescaped), tool-detector.js:88 (`marker.replace('*','.*')` — only first `*`, no escape, no anchors), staged-files.js:234 (`new RegExp(pattern)` raw — no escape/convert; confirm callers pass intended-regex vs glob).
- **Trusted constant / integer interpolation (no external data; route via safeRegExp, document trust — no escaping needed):** validate-plan-steps.js:68,72; iron-loop.js:371,372; coverage-checker.js:171; init-project.js:487; plan-validator.js:200,208,748,758,826; legal-hold.js:139,144; metrics-loop.js:69; product-loop.js:46,50; v8-migrate-skills.js:71,77; vision.js:352.

#### (d) detect-non-literal-require — 1 site

| file:line | snippet | assessment | fix |
|---|---|---|---|
| PreToolUse.Edit.js:23 | `try { return require(modulePath); } catch { return null; }` | `safeRequire` is called only with 4 LITERAL relative paths (`'../lib/ctoc-project-detector'`, `'../lib/plan-coverage'`, `'../lib/enforcement-log'`, `'../lib/escape-phrases'`). The dynamic surface is unnecessary. | Replace the indirection with 4 **literal** `require()` calls, each in its own `try/catch` (e.g. a tiny `function load(name){…}` won't satisfy the rule — must be literal). Clears the rule and removes the dynamic-require surface entirely. |

### 4.3 CONFIG CHANGE SPEC — apply LAST (after migration verifies 0 warnings)

**`eslint.config.js`** — main project block (currently lines ~120-137). Replace
the five `security/*` `'warn'` lines + their old "these are not bugs" rationale:

```diff
-      // --- Security: child_process is the highest-signal rule for this codebase ---
-      // Surface every spawn/exec call for human review; keep as warn so the suite
-      // can still pass while making the surface visible.
-      'security/detect-child-process': 'warn',
-      // Dynamic fs paths are pervasive and intentional (plan/state file I/O driven
-      // by user input by design). Keeping as warn avoids hundreds of unactionable
-      // errors while still flagging the pattern. Justification: this repo's core job
-      // is reading/writing plan files at computed paths; these are not bugs.
-      'security/detect-non-literal-fs-filename': 'warn',
-      // Dynamic require is used for optional/peer module loading — warn, not error.
-      'security/detect-non-literal-require': 'warn',
-      // Regex from variables appears in detectors; warn (potential ReDoS surface).
-      'security/detect-non-literal-regexp': 'warn',
+      // --- Security (LH1, 2026-07): warnings-are-bugs. All fs path I/O routes
+      // through src/lib/safe-fs.js (sole fs-filename disable, validated); all
+      // dynamic regex through src/lib/regex-utils.js (sole regexp disable,
+      // escaped). Unsafe regexes rewritten; the timing-attack site was a false
+      // positive (renamed). See docs/SECURITY_LINT.md. Promoted to error so a
+      // genuinely dangerous call cannot hide in advisory noise.
+      'security/detect-child-process': 'warn',            // stays warn (surface spawn/exec; --max-warnings 0 makes it effectively blocking — 0 in src/ today)
+      'security/detect-non-literal-fs-filename': 'error',
+      'security/detect-non-literal-require': 'error',
+      'security/detect-non-literal-regexp': 'error',
+      'security/detect-unsafe-regex': 'error',            // ADDED (was inherited 'warn' from recommended)
+      'security/detect-possible-timing-attacks': 'error', // ADDED (was inherited 'warn' from recommended)
       'security/detect-object-injection': 'off'
```

**`eslint.config.js`** — tests/ override (currently lines ~155-160). Tests
legitimately use dynamic paths/regex/child_process against fixtures; KEEP the
three existing off-rules and ADD the regex/timing rules (tests/ carries 12
detect-non-literal-regexp today → would break the gate otherwise):

```diff
       'security/detect-child-process': 'off',
       'security/detect-non-literal-fs-filename': 'off',
-      'security/detect-non-literal-require': 'off'
+      'security/detect-non-literal-require': 'off',
+      'security/detect-non-literal-regexp': 'off',
+      'security/detect-unsafe-regex': 'off',
+      'security/detect-possible-timing-attacks': 'off'
```

**`package.json`** — lint script gains the zero-warning cap:

```diff
-    "lint": "eslint .",
+    "lint": "eslint . --max-warnings 0",
```

Note: with `--max-warnings 0`, the remaining `detect-child-process: 'warn'`
becomes effectively blocking. src/ has 0 today and tests/ has it off, so the
gate is clean; a future `spawn`/`exec` will (correctly) fail the gate — aligned
with warnings-are-bugs. Recommended to accept; alternatively justify-disable
specific child_process sites as they arise.

### 4.4 STRICT ORDERING (flipping early reds the gate mid-migration)

1. Foundation (§4.0) — **DONE**: safe-fs.js + tests green; suite green.
2. Build `src/lib/regex-utils.js` + `tests/regex-utils.test.js` (escapeRegExp + safeRegExp choke point) — GREEN.
3. Migrate all 18 fs waves (§4.1) — `safeFs.*` / `safeFs.promises.*`. After each wave: `node --test tests/*.test.js` green (behavior unchanged).
4. Fix the 14 unsafe-regex (§4.2a) + add bounded-time tests; rename the timing-attack site (§4.2b).
5. Migrate the 29 non-literal-regexp through `safeRegExp`/`escapeRegExp` (§4.2c); make the 1 require literal (§4.2d).
6. **GATE CHECK:** `npx eslint src/` → **0**, and `npx eslint .` → **0** (whole repo incl. tests override).
7. **THEN** flip `eslint.config.js` to `error` + add the two ADDED rules + extend tests override (§4.3); add `--max-warnings 0` to `package.json`.
8. Final: `npm run lint` exits 0; `node --test tests/*.test.js` green; `tsc` baseline held; add a guard test proving a reintroduced raw `fs.<m>(computedPath)` / unsafe regex fails lint non-zero.

### 4.5 Execution Steps (canonical labels)

- **Step 8 TEST** — write/extend failing tests first: regex-utils.test.js
  (escape correctness, safeRegExp behavior); bounded-time tests for each
  rewritten unsafe regex; a lint-guard test (seed a raw fs/unsafe-regex call →
  assert non-zero `eslint` exit). [safe-fs.test.js already GREEN.]
- **Step 9 PREPARE** — confirm baseline counts (990/29/14/1/1); scouts
  (secret/dep/lint) clean; ensure `eslint -f json` harness reproducible.
- **Step 10 IMPLEMENT** — (10a) regex-utils.js; (10b) fs waves 1-18; (10c) 14
  unsafe-regex rewrites; (10d) timing rename; (10e) 29 regexp migration; (10f) 1
  literal require. No stubs; document any ambiguous call in §Decisions.
- **Step 11 REVIEW** — code-reviewer + consistency-checker across migrated waves
  (uniform `safeFs`/`safeRegExp` usage; no leftover raw `fs.<path>`).
- **Step 12 OPTIMIZE** — none expected (pure pass-through); verify no perf
  regression in hot paths (state.js, quality-scorer.js).
- **Step 13 SECURE** — security-scanner + sast on the new code; confirm
  validatePath invariant holds; re-run secret/dep scouts.
- **Step 14 VERIFY** — `npx eslint src/`=0, `npx eslint .`=0, `npm run lint`
  exits 0 (after flip), `node --test tests/*.test.js` green, `tsc` ≤ baseline,
  coverage ≥80% on new code, 0 skipped/flaky.
- **Step 15 DOCUMENT** — `docs/SECURITY_LINT.md`: the safe-fs + regex-utils
  boundaries, why each rule is now `error`, the tests override rationale;
  supersede the old "these are not bugs" comment.
- **Step 16 FINAL-REVIEW** — synthesizer minimal change list; technical-debt
  tracker note (child_process-under-max-warnings interaction); Gate 3 (human).

### 4.6 Decisions Taken Under Ambiguity

1. **No `path.normalize` in safe-fs** (directive override of ALIGN §A's mention).
   Validation only → byte-identical fs semantics; normalization could silently
   change behavior (`..` collapse, trailing slashes) callers may rely on.
2. **safeFs.existsSync / accessSync become strict-throwing** on invalid path
   (fs.existsSync returns false). Intentional fail-closed; surfaces latent
   `existsSync(undefined)`-style caller bugs. Wave agents fix any caller relying
   on the old false-return (none expected); Step 14 full-suite catches them.
3. **Explicit per-method wrappers** (not dynamic `fs[name]`) so the sole
   eslint-disable is load-bearing (dynamic dispatch made it "unused" → eslint-9
   `reportUnusedDisableDirectives` warning) and so a human sees the full fs
   surface in one audited file.
4. **safeRegExp choke point** for detect-non-literal-regexp, symmetric with
   safe-fs: escaping is the security fix but does NOT silence the rule (it fires
   on any non-literal RegExp), so a single audited constructor holds the lone
   disable. (Implementation is Step 10b, not this run.)
5. **Timing-attack site fixed by RENAME, not crypto.timingSafeEqual** — it is a
   false positive (markdown fence char), correcting the generic directive on
   evidence.
6. **readme-numbers guard bumped 108→109** this run — mechanical acknowledgment
   of the sanctioned new module; explicitly not migration/config-flip. Required
   to keep the suite green.

## Notes

- Origin: surfaced at SP4 Gate 3 (2026-06-30); expanded per CTO directive to all
  security-plugin warnings + treat-as-errors. Queued + driven by user.
- Real numbers captured `2026-06-30` via `npx eslint src/` (1036 total: 990/29/14/1/1).
  Re-measure at implementation — the count drifts as code is added.
- Execution: CTO Chief orchestrates via CTOC agents (implementation-planner →
  iron-loop-critic → iron-loop-executor / file-partitioned implementer waves →
  quality:code-reviewer + security:security-scanner pre-ship). Migrate sites
  BEFORE flipping the rule to error (order matters: a mid-migration error-flip
  would red the gate).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
