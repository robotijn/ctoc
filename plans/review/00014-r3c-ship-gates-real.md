---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T18:30:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 orders "fix them all, do 50
  rounds of hard critique, keep fixing the code" and "fix everything", against
  the Round-5 gate-machinery audit. The core defect is the direct negation of
  the human's OWN decided rule ("push and deploy stay as gates", 2026-07-14):
  machines push by default and the off-switch is a placebo. Verified on disk by
  the coordinator: init writes `push: auto_push: true` which NO code reads
  (sync.js reads the `sync` category); post-commit.js hardcodes
  `--on-success=push`; sync.js:104 runs `git push origin main` on a 5-minute
  timer gated by `general.syncEnabled` (schema default TRUE).
---

---
title: "R3-C — The push ship gate becomes real; approvePlan validates; assignDirectly dies"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00011-r2z-boundary-typecheck-zero
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/sync.js"
  - "src/hooks/post-commit.js"
  - "src/lib/quality-agent.js"
  - "src/lib/init-project.js"
  - "src/lib/settings.js"
  - "src/lib/actions.js"
  - "src/lib/gate-order.js"
  - "src/tabs/functional.js"
  - "src/lib/iron-loop-enforcer.js"
  - "src/lib/iron-loop.js"
  - "agents/infrastructure/deployment-setup.md"
  - "src/commands/menu.md"
  - "docs/IRON_LOOP.md"
  - "CLAUDE.md"
  - "tests/ship-gate-real.test.js"
  - "tests/sync*.test.js"
  - "tests/quality-agent*.test.js"
  - "tests/init-project.test.js"
  - "tests/gates.test.js"
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
