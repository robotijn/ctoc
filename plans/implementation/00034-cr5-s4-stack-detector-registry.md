---
title: "CR5-s4 — stack-detector unions registry languages (additive, hook-safe)"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00031-cr5-s1-glob-extension-detection
priority: MEDIUM
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/stack-detector.js"
  - "tests/stack-detector.test.js"
---

# CR5-s4 — stack-detector sees all 20 registry languages, keeps everything it had

`stack-detector.js` detects 14 languages by file markers AND file extensions (it has
`zig`, which the registry lacks) and feeds BOTH `init-project.js` and the
`SessionStart` hook. The registry covers 20 languages (incl. c, cpp, sql, r, scala,
lua, objectivec) that stack-detector misses. Make stack-detector aware of them —
ADDITIVELY, so nothing it does today changes.

## The change (conservative UNION — not a replace)
In `detectLanguages(projectPath)`, after computing the current result, UNION in
`require('./capability-registry').detectLanguages(projectPath)` (glob-aware post-s1).
- Keep stack-detector's existing file + EXTENSION detection exactly as-is (the registry
  does NOT do extension-tree-walking, and `zig` exists only here — both must survive).
- Dedupe the union; preserve stack-detector's current ordering for the languages it
  already detected (append registry-only languages after).
- `detectFrameworks`, `detectStack`, `readPackageDeps`, `readPythonDeps`,
  `matchGlob`, and `FRAMEWORK_PATTERNS` are UNCHANGED (frameworks are a separate
  dimension — CR4, not this slice).

## REGRESSION GUARDS (this module feeds a hook and init — highest blast radius)
- **`tests/hooks.test.js` MUST stay green** (SessionStart consumes stack-detector) —
  do not change the output shape of `detectStack`/`detectLanguages`, only widen the
  language set additively.
- **`tests/stack-detector.test.js`**: every language it currently detects (python, js,
  ts, go, rust, java, kotlin, ruby, php, csharp, elixir, swift, dart, zig) must STILL
  detect, in a form the existing assertions accept. You own this test file — if the
  union legitimately adds a language to a fixture that the test enumerates exhaustively,
  update that assertion to the wider-but-correct set (tighten toward truth; never delete
  a language it used to find).
- `init-project.js` imports this — the CLAUDE.md generation must not break. If a change
  would alter init output shape, STOP and report rather than reshaping it.

## TDD-Red FIRST
Add to `tests/stack-detector.test.js` (real fixtures, zero mocks):
- a C project (`Makefile` + `main.c`) → `detectLanguages` now includes `c` (was missing).
- a project with `dbt_project.yml` → includes `sql`.
- REGRESSION: a `build.zig` project still includes `zig` (registry lacks it — extension/
  file path must survive); a Python-by-extension-only project (`.py`, no marker file)
  still detects python via stack-detector's extension scan.
Run RED first for the additive cases.

## VERIFY (Step 14) — paste verbatim
`node --test tests/stack-detector.test.js tests/hooks.test.js` green; eslint clean on
the two touched files; NO git; do not move the plan. Report before→after language set
and CONFIRM zig + extension-only detection survive.

## Iron Loop Steps (executor)
- [x] Step 8: TEST — TDD-Red tests added to tests/stack-detector.test.js (C, sql RED first; zig + ts-over-js + ext-only-python regression guards). Ran RED, confirmed C/sql failed pre-implementation.
- [x] Step 9: PREPARE — no deps; registry API (capability-registry.detectLanguages) verified present + non-circular (requires only path/safe-fs/regex-utils).
- [x] Step 10: IMPLEMENT — additive UNION in detectLanguages; TS-over-JS preference re-applied after union.
- [x] Step 11: REVIEW — output shape unchanged (string[]); ordering preserved; registry-only appended; only consumer SessionStart.js is shape-stable.
- [x] Step 12: OPTIMIZE — top-level require (no per-call require cost); registry read is the tiny fail-open load it already performs.
- [x] Step 13: SECURE — no new I/O of our own; registry routes all reads through safe-fs; no dynamic exec; no user-string regex.
- [x] Step 14: VERIFY — node --test on both files green; eslint exit 0 on both touched files.
- [x] Step 15: DOCUMENT — JSDoc on detectLanguages updated to describe the union + the inert-extension reality.
- [x] Step 16: FINAL-REVIEW — before/after language sets reported; zig + ext-only behavior confirmed unchanged.

## Decisions Taken Under Ambiguity
- **Plan's "extension-only python detects via stack-detector's extension scan" is factually wrong.**
  `detectLanguages` only iterates `patterns.files`; the `extensions` arrays in
  `LANGUAGE_PATTERNS` are inert data never consulted by any code path (verified
  empirically: a dir with only `foo.py` returns `[]` from BOTH stack-detector AND the
  registry, which has no `*.py` marker). Making "extension-only python" detect would
  require adding recursive extension-tree-walking — explicitly forbidden by this slice
  ("keep existing extension detection exactly as-is", "the registry does NOT do
  extension-tree-walking … out of scope"). DECISION: do not fake a green; the regression
  test asserts the TRUTH — an extension-only `.py` dir is not detected, and the additive
  union does NOT change that. Wiring extension-scanning is a separate, human-scheduled
  slice, not smuggled in here.
- **Plan says "init-project.js imports this" — it does not.** `init-project.js` has its
  own independent `detectLanguages`; the ONLY runtime importer of `stack-detector` is
  `src/hooks/SessionStart.js`. So the additive widening cannot alter init's output at all
  (lower blast radius than the plan assumed). No action needed; recorded for accuracy.
- **TS-over-JS preference re-applied after the union.** The registry returns BOTH
  `javascript` and `typescript` for a `package.json`+`tsconfig.json` project (no
  preference logic), so a naive union re-introduces `javascript` and breaks the existing
  `!includes('javascript')` assertion. DECISION: run the existing preference-removal block
  after the union so the established behavior is preserved exactly.
