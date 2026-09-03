# Handoff — CTOC: validator claim-parser fix in flight; detector slice gate-green, waiting on it

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. VERIFY EVERY CLAIM IN THIS FILE
     AGAINST DISK, INCLUDING THIS FILE. -->

- Updated: 2026-09-03 22:19 by claude
- Branch: main
- Status: in progress

## Goal
Finish two human-approved fixes that are mid-pipeline: (1) the Create-React-App
detector fix — BUILT and gate-green, blocked at completion by (2) a
plan-validator defect that misreads a JavaScript method name in plan prose as a
claimed-but-missing file. Fix 2 was building in the background when this
handoff was saved.

## Current status
- Done and pushed earlier (through `253a443a` / v6.14.65): README course +
  README-truth sync machinery, the 20-slice coverage wave (99.04→99.9%, floor
  HELD at 99), done-gate + kickback-sidecar fixes, ledger at zero mismatches,
  evidence-pack five fixes. See the previous handoff content in git history.
- In progress at save time (both plans human-approved through every gate up to
  the build):
  1. `plans/in-progress/00259-…-s1-symmetric-credit.md` (CRA detector) —
     **work FINISHED and gate-green** (its evidence is recorded inside the plan
     under Execution Record / Verification Evidence; `npm test` PASS 99.9%).
     Its `menu task complete t103` was REFUSED by the validator defect below.
     Its four file edits are in the working tree, deliberately UNCOMMITTED
     together with the in-flight parser work (one gate-green commit later).
  2. `plans/in-progress/00260-…-s1-honest-claim-parser.md` (validator fix) —
     executor was STOPPED BY THE HUMAN mid-build (t105 cancelling); it had edited
     `src/lib/plan-validator.js` + its two test files. Its last report: AFTER sweep clean of member-expression misreads, but its
     own plan prose still tripped a different misread shape — unresolved. A stop note is appended to the plan.
- Next: see Resume here.

## Key decisions
- The validator defect: `validateNoContradictions`'s created-file pattern
  captures `assert.strictEqual` (capture stops at `(`), scans inline backtick
  code, and treats any dotted identifier as a path. Fix = three guards
  (read-past-match call skip — NOT a lookahead, it backtracks; inline call-span
  stripping; path-plausibility with a union extension list incl. `template`,
  `gitkeep`). Human approved 2026-09-03.
- Six shipped plans / seven tokens misread today; the slice makes the runnable
  sweep the census (a text probe under-reports).
- One vacuous test tightened with Lesson-14 justification: `VP1 #4` in
  tests/plan-validator.test.js used the verb `add`, which the pattern never
  matches.
- Overload protocol (human, 2026-09-03): when the opus subagent tier returns
  529, back off 30 minutes and retry — never substitute a different model.
- All standing rulings from the previous handoff still bind (floor 99;
  new plans enter at functional/; executors write only canonical sections;
  `depends_on: none` never `[]`; one blank line before appended records).

## Open questions / blockers
- t105 (parser fix build) outcome unknown at save time.
- After the parser fix ships gate-green: complete the detector slice with
  `node src/commands/start.js menu task complete t103 --summary "…"` (it was
  refused only by the parser defect; its work needs NO rebuild).
- The executor's scope-growth question at
  `.ctoc/inbox/questions/1788440244002-hhro07.md` is answered in-file (fix
  approved as its own plan); close it out when both slices are done.
- Still awaiting the human's scheduling (unchanged): hasViteSignal placement
  defect (sibling of the CRA fix, recorded in plan 00259's ancestry),
  confinement refusal message naming the wrong store, SessionStart
  exit-before-drain, reachability-roots `reasons` note, `general.entry_point`
  declaration for CTOC itself, stale tasks t43–t45 + t48.

## Gotchas
- The working tree deliberately carries BOTH slices' edits uncommitted
  (detector files finished; parser files possibly mid-write by t105). Do not
  commit or revert until t105's outcome is known and its gate is green.
- The parser-fix slice's own completion runs through the parser it fixes.
- A plan's prose must cite calls in fenced blocks until the fix lands —
  inline citations trip the old parser at completion.
- Opus subagent tier had a multi-hour 529 overload on 2026-09-03; the fifth
  launch attempt succeeded ~21:00.
- The zsh gate-exit trap, the `npm test`-is-the-gate rule, and the
  coverage-reporter losing its number under child-process load: all still
  true (previous handoff, git history).

## Key files
- `src/lib/plan-validator.js` (+ tests/plan-validator*.test.js) — in flight, t105.
- `src/lib/framework-detector.js` (+ its two test files,
  tests/remainder-security-tooling-coverage.test.js header) — finished, t103.
- `plans/in-progress/00259…`, `plans/in-progress/00260…` — the two live plans,
  evidence recorded in-plan.
- `.ctoc/approvals/00259….json`, `.ctoc/approvals/00260….json` + the two parent
  entries — the human's crossings (committed with this handoff).
- Task registry: t103 running (waiting), t105 running (building) at save time.

## Resume here
1. Check whether t105 finished: does `.ctoc/state/verify/00260-…json` exist and
   read `passed:true`? Is `plans/review/00260-…md` present? If yes → commit both
   slices' edits (one commit, full `npm test` first, unpiped `$?` check), push.
2. Then run the t103 completion command above; on `ok:true` both plans are in
   review — ask the human "is it finished?" for both (his word crosses).
3. If t105 died mid-build: `git status` the three parser files, read the plan's
   Execution Plan ticks to see how far it got, and relaunch an
   iron-loop-executor for task t105 with the brief pattern used all session
   (Rule 1 plan path, declared files, red-first, complete-once).
