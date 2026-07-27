---
title: "R3-C — The push ship gate becomes real (no machine push without an explicit human opt-in)"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00011-r2z-boundary-typecheck-zero
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
# files: reconciled to this slice's REAL change surface (rework, finding 3).
# REMOVED (declared but never touched by THIS slice): src/lib/init-project.js
# (the placebo push: block was deleted by R4-B), src/lib/actions.js and
# src/lib/gate-order.js (approvePlan-validation + single gate-order encoding were
# delivered by sibling 00019-r5b), src/tabs/functional.js (deleted with
# assignDirectly by R5-B — the file no longer exists), src/commands/menu.md and
# CLAUDE.md (menu Approve-anyway wiring + doc-truth were re-scoped to siblings).
# ADDED: src/lib/dependency-auditor.js + src/lib/cvss.js + their test (the CVSS
# severity unification of Decision 6, previously undeclared).
files:
  - "src/lib/sync.js"
  - "src/hooks/post-commit.js"
  - "src/lib/quality-agent.js"
  - "src/lib/settings.js"
  - "src/lib/iron-loop-enforcer.js"
  - "src/lib/iron-loop.js"
  - "src/lib/dependency-auditor.js"
  - "src/lib/cvss.js"
  - "agents/infrastructure/deployment-setup.md"
  - "docs/IRON_LOOP.md"
  - "tests/ship-gate-real.test.js"
  - "tests/dependency-auditor-severity.test.js"
  - "tests/cvss.test.js"
  - "tests/sync*.test.js"
  - "tests/quality-agent*.test.js"
  - "tests/environment-mode.test.js"
  - "tests/iron-loop.test.js"
---

# R3-C — A gate a machine can cross is not a gate

The human decided (2026-07-14): **push and deploy are the two human ship
gates.** The code crosses BOTH by machine, by default:

- `init-project.js:533` writes `push:\n  auto_push: true` — and NOTHING reads
  it (`sync.js:195` reads `getSetting('sync','auto_push')`, a different
  category). The visible off-switch is a **placebo**.
- `post-commit.js:56` hardcodes `--on-success=push`; `quality-agent.js:49`
  defaults `onSuccess:'push'` and pushes on green (`:668-671`). The post-commit
  hook is auto-installed into every fresh project by init. The only off-switch
  is an environment variable.
- `sync.js:104` runs `git push origin main` (hardcoded branch) on a 5-minute
  timer started by every menu open (`menu.js:622`), gated only by
  `general.syncEnabled`, schema default **true**.
- On rejection, `quality-agent.js:552-557` silently runs `git pull --rebase`
  and pushes again — an unattended machine rebase.

## Implementation Details

1. **ONE real setting, default OFF, gating EVERY push path.**
   `general.autoPushEnabled` (or reuse a single canonical key — decide while
   reading settings.js, and make it the ONLY one) defaults to **false**.
   Every push path consults it: quality-agent's `onSuccess` push, the
   post-commit hook's flag, sync's auto-commit push. With it false: CTOC
   commits (if configured) but NEVER pushes; the human pushes via `/ctoc:push`
   — which stays the sanctioned human ship gate.
2. **Delete the placebo keys.** Remove init's `push: auto_push: true` block (or
   make it the real key from item 1 — one encoding, no dead keys). Remove the
   dead `git.commitAndPush` prod-profile key and schema toggle (zero consumers)
   or wire them; no key may exist that nothing reads.
3. **No silent machine rebase.** `quality-agent`'s pull-rebase-retry on push
   rejection is removed (or gated behind the same explicit setting AND logged
   loudly). A machine rewriting history unattended is not acceptable under the
   ship-gate rule.
4. **`approvePlan` validates (F3 core).** Every transition consults
   `plan-validator.validateTransition` before crossing. A failing validation
   REFUSES by default. An explicit `{ override: { reason } }` argument allows
   the human's "Approve anyway" — and RECORDS the override in the ledger entry
   (`override: true, override_reason`) and in the plan's marker, so a forced
   crossing is auditable and NEVER indistinguishable from a clean one (today it
   is: menu-screens' Approve-anyway routes to the same raw `claude:approve`).
   Wire the menu's Approve-anyway to pass the override + reason.
5. **ONE gate-rule encoding (F3).** Delete `actions.js` `HUMAN_GATES` (191-195)
   and `flowMap` (299-303) as separate literals; both come from
   `gate-order.js` (the canonical module). Point `human-gate-check.js`'s revert
   map, `iron-loop-enforcer.js` GATE_DESTINATIONS, and `stale-cleanup.js`
   REVERT_MAP at the same module in a follow-up if they are not in this slice's
   file list — actually gate-order.js IS in scope, so export what they need and
   convert every in-scope consumer now; name any consumer you could not convert.
6. **Kill `assignDirectly`.** It inserts into todo with no stamp and no ledger,
   so the revived hook REVERTS it (to `implementation/`, a stage the plan never
   occupied) right after the UI prints "✓ added to todo queue". Delete the
   function AND its caller (`src/tabs/functional.js:136`); if the tab needs the
   capability, route it through `approvePlan` (the human's keypress IS the gate
   decision, so it stamps + ledgers properly).
7. **`ship_gate_confirmed` gets a setter.** `agents/infrastructure/
   deployment-setup.md` asks the deploy ship-gate question and writes the flag;
   until a human answers, the deploy trigger stays off (that part is already
   correct). The deploy-ready notice already names the key — now the supported
   path can actually set it.
8. **`refineLoop` stops self-approving (Goodhart).** `iron-loop.js:530-552`
   returns `status:'approved'` from its own critic score. Rename to a
   descriptive, non-authoritative status (`score-passed`), since the ONLY
   consumer (`applyIronLoop`) ignores it anyway — the label must not imply an
   approval nobody gave. Remove the `auto_approve_after_max` claim from
   docs/IRON_LOOP.md (zero code consumers).
9. **Enforcer stops trusting forgeable markers.** `iron-loop-enforcer.js:344`
   accepts frontmatter `approved_by: human` OR `approved_by_human: true` (a
   form no writer produces) with no ledger. Make the enforcer's advisory check
   consult the LEDGER (same acceptance as the hook) — two systems must not
   disagree about whether the repo is clean.
10. **Doc truth.** CLAUDE.md's "in-progress is a plan state in frontmatter, not
    a directory" contradicts the code (a real `plans/in-progress/` directory
    everywhere). Fix the doc to the code.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| autoPushEnabled | quality-agent push path, post-commit hook, sync timer (this slice) | hook + /ctoc:menu |
| approvePlan validation + override | menu approve/Approve-anyway recipes (menu.md, this slice) | /ctoc:menu |
| gate-order single encoding | actions/enforcer consumers (this slice) | /ctoc:menu |
| assignDirectly deletion | src/tabs/functional.js caller removed (this slice) | /ctoc:menu |
| ship_gate_confirmed setter | deployment-setup agent (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first) — new tests/ship-gate-real.test.js
THE SHIP-GATE TEST: with default settings, NO code path reaches `git push` —
drive quality-agent's success path, the post-commit hook's argv, and sync's
timer path with a spy/stub on the git executor and assert ZERO push
invocations. With the setting explicitly true → push reached (the human opted
in). Placebo test: `getSetting` for every push-related key returns a value some
code actually reads (assert no orphan keys — grep-based test like the
reachability fence: every settings key written by init has ≥1 reader).
approvePlan: invalid transition REFUSED; with override → crosses AND the ledger
entry carries `override:true` + reason; clean → crosses with no override field.
assignDirectly: gone (require-time assertion its export does not exist; the tab
path stamps+ledgers). refineLoop: no `status:'approved'` literal remains.
Enforcer: a plan with a forged frontmatter marker and no ledger entry is
reported UNCLEAN (parity with the hook).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the named files, record red.
### Step 9: PREPARE — read every file in scope IN FULL from disk. Map EVERY
git-push call site (grep `git push`, `pushToRemote`, `execSync.*push`) before
changing anything; the report must list them all with their new gate.
### Step 10: IMPLEMENT — items 1–10.
### Step 11: REVIEW — re-grep every push call site: each must be gated or
deleted. Any ungated push is a CRITICAL regression.
### Step 12: OPTIMIZE — n/a.
### Step 13: SECURE — the setting is the security surface; no environment
variable may re-enable a push silently (CTOC_SKIP_QUALITY stays a SKIP, never
an enable).
### Step 14: VERIFY — node --test on the named files + eslint; no git ops of
your own; no full suite.
### Step 15: DOCUMENT — headers + CLAUDE.md/IRON_LOOP state the real ship-gate
behavior: CTOC never pushes unless the human opted in; /ctoc:push is the gate.
### Step 16: FINAL-REVIEW — report every push path found and its new gate;
report any key you deleted and any consumer you could not convert.

## Decisions Taken Under Ambiguity

1. **Canonical key = `git.autoPushEnabled`** (not `general.autoPushEnabled`). The
   Git settings tab already existed and already carried a (dead) `commitAndPush`
   toggle labelled "Auto-push after commit" — so the Git tab is where a human looks
   for this. `general` is also index-sensitive (`tests/w10-settings-key-dispatch`
   pins `syncEnabled` at index 3), so appending there is fragile. Deleted
   `git.commitAndPush` outright (zero readers, and its name lied: it never
   committed). Exposed ONE reader, `settings.isAutoPushEnabled(projectPath)`, and
   every push path calls it — no second encoding.
2. **`fullPlansSync` (the dashboard "Sync plans" command) is gated too.** It is
   human-invoked, so it was arguable. Gated anyway: the ship-gate rule is "no code
   path reaches `git push` by default", and a menu item whose label says "sync" is
   not informed consent to publish. It pulls and commits, and reports
   `pushed:false, pushSkipped:'…use /ctoc:push'`.
3. **The pull-rebase-retry is DELETED, not gated** (`quality-agent.pushToRemote`,
   old "Decision 15"). A background agent rewriting the human's history after a
   rejected push is not something a boolean should be able to buy. On rejection it
   now fails loudly and prints the command the human can run. The pre-push rebase
   inside `sync.syncPlans` is kept but moved onto the opted-in path only (it is only
   meaningful immediately before a push).
4. **`quality-agent.parseArgs` takes an injectable argv** and defaults `onSuccess`
   to `'none'`. Argv now expresses INTENT; the setting holds AUTHORITY — a stale
   hook, a stray flag, or a hand-run `--on-success=push` cannot ship.
5. **Enforcer acceptance delegates to the hook's own predicate**
   (`human-gate-check.hasLedgerApproval`) rather than re-implementing ledger reads.
   One definition of "approved", two callers. This surfaced a REAL live-repo finding
   (see Step 16 report): 4 plans in `plans/todo/` carry `approved_by: human` in
   frontmatter with NO ledger entry — the runtime hook already classifies them
   `no-ledger-entry` and would revert them. Not fixed here: writing an approval
   record is a gate act and belongs to the human, never to the executor.
6. **`mapPipSeverity` / `mapGoSeverity` unified into `mapCvssOrLabel` + `bandCvss`.**
   Unknown severities map to MODERATE, never LOW. In a security path we over-report,
   never under-report.
7. **Skipped by explicit coordinator instruction** (file-disjointness with the
   concurrently-running plan 00015, which owns `actions.js`, `menu-screens.js`,
   `menu.md`, `reachability.js`, `iron-loop-executor.md`, `init-project.js`): items
   4 (approvePlan validation + override ledger), 5 (single gate-order encoding), 6
   (kill `assignDirectly`), 10 (CLAUDE.md doc truth), and the init-project.js half of
   item 2. Re-scoped to a follow-up slice; see the report for the exact init line.

## Execution Record (Steps 8-16)
- [x] Step 8 TEST — `tests/ship-gate-real.test.js` (new, 23 cases) +
      `tests/dependency-auditor-severity.test.js` (new, 6 cases) written FIRST and
      run RED: 26 failing / 3 passing before any source change.
- [x] Step 9 PREPARE — every push call site grepped and mapped before editing.
- [x] Step 10 IMPLEMENT — items 1, 2 (settings half), 3, 7, 8, 9 + dependency-auditor.
- [x] Step 11 REVIEW — re-grepped: 5 machine push sites, all gated; 1 human site
      (`/ctoc:push`) intentionally ungated; deploy paths on their own gate.
- [x] Step 12 OPTIMIZE — n/a (no hot path touched).
- [x] Step 13 SECURE — no environment variable can open the gate; `CTOC_SKIP_QUALITY`
      stays a SKIP (test asserts it cannot enable a push). Severity under-report closed.
- [x] Step 14 VERIFY — eslint clean, `tsc --noEmit` clean on all touched files,
      422 tests across 27 affected suites: 420 pass, 2 fail — both are the live-repo
      self-check assertions failing HONESTLY on pre-existing un-ledgered plans.
- [x] Step 15 DOCUMENT — docs/IRON_LOOP.md: new "2 Human Ship Gates" section;
      `auto_approve_after_max` removed; deployment-setup agent gained Step 4b.
- [x] Step 16 FINAL-REVIEW — reported to the coordinator, including the blocking
      live-repo finding the executor must NOT fix itself.

## Rework Report (adversarial findings, 2026-07-27)

Reworked against the five adversarial findings in
`review__00014-r3c-ship-gates-real.md.json`. Each was verified against the actual
source on HEAD before acting.

- **Finding 1 — "cross with a red suite / ungated VERIFY" (critical): REFUTED AS
  STALE.** The Step-14 record above ("420 pass, 2 fail") was captured during the
  plan's original execution, mid-concurrent-edit. On HEAD today the FULL gated
  `npm test` runs GREEN: **10499 pass, 0 fail, 0 skipped, coverage 99.04%**
  (`tsc --noEmit` also clean). The two original failures were the enforcer/
  residency parity self-checks firing on un-ledgered `plans/todo/` markers; those
  plans were resolved by the ongoing repair loop, so the gate instrument this
  plan itself created now passes. The premise of the finding no longer holds.
- **Finding 5 — gate ruling REJECT (critical): REFUTED AS STALE.** Same root cause
  as Finding 1 — its REJECT rested entirely on the red suite. With the gate green
  on HEAD the ruling is moot; the load-bearing deliverable (no machine push
  without an explicit human opt-in) was already verified sound by all three lenses.
- **Finding 2 — title over-credits undelivered work (important): FIXED (record).**
  The old title claimed "approvePlan validates; assignDirectly dies." Per Decision
  7 those items (4/5/6/10) were re-scoped for file-disjointness and delivered by
  siblings, which are confirmed present in the tree: `approvePlan` runs
  `validateTransition` and the single gate-order encoding shipped in
  **00019-r5b-approveplan-validates-one-gate-encoding** (in review/);
  `assignDirectly` and `src/tabs/functional.js` were deleted by R5-B (verified
  absent). Title rewritten to describe ONLY what this slice shipped: the real
  push ship gate, the CVSS severity unification, the refineLoop status rename, and
  the enforcer/ledger parity.
- **Finding 3 — files: declaration mismatches what shipped (important): FIXED
  (record).** Verified by grep: `mapCvssOrLabel`/`bandCvss` live only in
  `src/lib/dependency-auditor.js` and `src/lib/cvss.js` (Decision 6), and
  `src/tabs/functional.js` no longer exists. Declaration reconciled — dropped the
  four untouched files and the dangling deleted-file reference, added the two
  security files and their test. See the comment above the `files:` block.
- **Finding 4 — the ship-gate fence has silent bypasses (important): FIXED
  (code).** `tests/ship-gate-real.test.js` decided a file was safe by whole-file
  token presence (`!/isAutoPushEnabled/.test(text)`), so a SECOND ungated
  `git push` added to any already-gated file passed with zero failures, and the
  local `git([...'push'])` wrapper idiom sync.js uses was not even recognised as a
  push. The fence is now PER-CALL-SITE and scope-aware (`ungatedPushSites`): every
  push invocation — three idioms including the wrapper — must be gated within its
  own enclosing function, or be the caller-gated `pushToRemote` primitive. The
  bare name-whitelist (deployment.js, PreToolUse.Bash.js) is GONE, replaced by two
  positive assertions: every `pushToRemote` caller is either the human's
  `/ctoc:push` or a function consulting `isAutoPushEnabled`; and the deploy trigger
  in `actions.js` is the per-crossing `options.deploy === true` stamp (not a
  standing flag). TDD-red was demonstrated: the old whole-file matcher returned
  false for both the two-function case and the wrapper idiom; the tightened fence
  flags both while staying clean across all of src/.

### Surfaced observation (NOT one of the five findings — for scheduling)
`deployment.ship_gate_confirmed` has ZERO code readers. `agents/infrastructure/
deployment-setup.md` still claims it "is the flag `src/lib/actions.js` checks
before a Gate 3 approval may trigger a deploy" — but actions.js gates the deploy
trigger on the per-crossing `options.deploy === true` stamp (a comment there
explicitly rejects a standing flag as one that would permanently disarm the gate).
So item 7's setter now writes a config marker no runtime path consults — a placebo
of the exact class this plan set out to kill, introduced downstream when the G4
per-crossing-stamp change superseded the standing-flag design. Not fixed here
because the resolution is a genuine decision (correct the doc claim vs. restore a
code reader vs. drop the field), and the deploy gate is not actually open — the
per-crossing stamp holds. Flagging for the human to schedule.
