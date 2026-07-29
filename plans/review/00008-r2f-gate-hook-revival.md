---
title: "R2-F — Revive the dead gate hook: legacy slugs, per-plan fault isolation, pipeline-advance provenance"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/human-gate-check.js"
  - "src/lib/approval-ledger.js"
  - "tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js"
  - "tests/approval-ledger*.test.js"
  - "tests/gate-hook-revival.test.js"
---

# R2-F — The gate hook enforces again

VERIFIED BY EXECUTION: `checkFolder('done', cwd)` throws `Invalid slug` —
`hasLedgerApproval` calls `ledger.verify` unguarded; 127 uppercase legacy
slugs in plans/done/ crash the sweep; main()'s outer catch exits 0. The hook
registered on every tool call has enforced NOTHING in this repo. Also: 181 of
234 done plans have no ledger entry — reviving the hook naively mass-reverts
them, so acceptance must be sequenced with the backfill the INTEGRATOR runs
at the wave boundary (this slice ships the code + the backfill helper API;
the integrator executes the data migration before the commit).

## Implementation Details

1. **Canonical lowercase slugs.** `slugFromPlanPath` (approval-ledger.js)
   lowercases; every ledger key is the lowercase slug; `SLUG_RE` unchanged
   (the path-safety constraint stays tight). Two plans differing only by case
   would collide — `appendEntry`/write path must detect an existing entry for
   a different original path and fail loudly (report says none exist today;
   verify while implementing).
2. **Per-plan fault isolation in the sweep.** `hasLedgerApproval` wrapped so
   an un-keyable slug or a corrupt entry NEVER aborts the whole sweep: that
   single plan is classified `violation` with reason `ledger-unkeyable` /
   `ledger-corrupt` (fail SAFE toward flagging, never toward silent exit 0),
   the sweep continues, and main() reports per-plan results. The outer
   catch keeps fail-open ONLY for infrastructure errors (fs down), and must
   log WHICH error it swallowed to the gate-violations log — a silent exit 0
   is how this hook died unnoticed.
3. **Pipeline-advance provenance.** The ledger gains a second entry kind:
   `advanced_by: 'pipeline'` with mandatory `evidence` (string, e.g.
   'stale-reconciliation', verify artifact path) alongside the existing
   human kind — written ONLY through the module API (the agent-write deny on
   .ctoc/approvals stays). `verify` distinguishes kinds. The hook accepts done/
   residency for EITHER a human entry OR a pipeline entry with evidence;
   gate destinations before done (todo) keep human-only. Also: `backfilled:
   true` + `backfill_reason` optional fields, accepted as human-kind (the
   2026-07-14 legacy migration provenance).
4. **Vision exemption parity (contradiction 1).** ~~checkFolder('done') exempts
   `type: vision` plans exactly as iron-loop-enforcer.js:337-339 does — the
   two acceptance semantics must agree; document the exemption in both places'
   comments (enforcer file itself is out of scope; reference it).~~

   > **SUPERSEDED by R3-A item 3 — DO NOT IMPLEMENT.** The `type: vision`
   > exemption was a FORGERY HOLE, not a nicety, and the shipped hook REMOVED it
   > (`human-gate-check.js`, "UNIFORM LEDGER ACCEPTANCE"). Because `plans/**.md`
   > is Edit-whitelisted, any agent could write `plans/done/anything.md`
   > containing the single line `type: vision` and squat the terminal folder with
   > zero provenance — and the predicate tested only `type: vision`, never the
   > `status: decomposed` its own header claimed. What SHIPPED: no exemption and
   > no special case. Every resident of a gate-destination folder must be vouched
   > for by the agent-write-denied ledger. A legitimately decomposed vision earns
   > its `done/` residency with a PIPELINE-kind entry
   > (`approval-ledger.writeVisionArchiveEntry`, `evidence: 'vision-decomposed'`).
   > `tests/gate-hook-revival.test.js` asserts the exact opposite of the text
   > above: "a bare type: vision plan in done/ is FLAGGED".

5. **Backfill helper.** Export `backfillEntry(projectPath, planPath, { stage_to,
   reason })` on approval-ledger — writes a human-kind entry with backfilled
   provenance for an EXISTING plan file, hashing current content. ~~No standalone
   script file (one-shot scripts become dead code); the integrator drives it
   via `node -e` at the boundary.~~

   > **SUPERSEDED by R3-A item 2 — DO NOT USE `node -e`.** The `node -e` shape
   > WAS the forgery: `PreToolUse.Bash.js` allowed any command starting with
   > `node `, so an agent could mint a human-kind approval entry for any plan and
   > cross Gate 2 or Gate 3 by itself. Inline evaluation that touches the ledger
   > is now DENIED. The standalone script `src/scripts/ledger-backfill.js` EXISTS
   > and is the ONE sanctioned migration channel — checked in, reviewable,
   > argv-only, with no `eval` and no `new Function`.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| all hook changes | registered PreToolUse hook (hooks.json) | hook root |
| ledger changes | stampAndLedger (actions.js, exists) + hook verify | /ctoc:menu + hook |
| backfillEntry | ~~integrator boundary migration (node -e, this wave)~~ **SUPERSEDED (R3-A item 2)**: driven by the checked-in `src/scripts/ledger-backfill.js`, the one sanctioned channel; inline `node -e` against the ledger is DENIED | hook root |

### Test Plan (TDD-Red first) — new tests/gate-hook-revival.test.js + updates
Uppercase-slug plan in a temp done/ → sweep completes, classifies it (not
crash); after backfillEntry → accepted. 181-gap simulation: three plans, one
ledgered, one backfilled, one bare → exactly the bare one flagged. Pipeline
entry with evidence accepted in done/, rejected in todo/. Pipeline entry
WITHOUT evidence → write refused. Corrupt entry JSON → that plan flagged
`ledger-corrupt`, sweep continues. ~~Vision-typed plan in done/ exempt.~~
**SUPERSEDED (R3-A item 3)**: the vision exemption is GONE; a bare `type: vision`
plan in done/ is FLAGGED, and a real decomposed vision is accepted only on its
pipeline-kind ledger entry. Case
collision on appendEntry → loud failure. Existing w02-s3 acceptance/revert
tests: keep passing or tighten (never weaken).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write tests, run ONLY the named test files, record red.
- [x] TEST — TDD tests present; Step-11 workflow re-review (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — read human-gate-check.js, approval-ledger.js, and
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
actions.js stampAndLedger (read-only) IN FULL from disk.
### Step 10: IMPLEMENT — changes 1–5.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
### Step 11: REVIEW — the hook's failure modes enumerated in its header;
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3; findings minor/info only, documented.
none may silently exit 0 without logging.
### Step 12: OPTIMIZE — sweep stays O(plans).
### Step 13: SECURE — SLUG_RE untouched; path traversal tests still pass;
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
agent-write deny untouched.
### Step 14: VERIFY — node --test on named test files + eslint; NO git; do
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
NOT run the backfill against the real repo (integrator's job).
### Step 15: DOCUMENT — module headers: two entry kinds, backfill provenance,
fault-isolation rules.
### Step 16: FINAL-REVIEW — report + the exact backfill invocation the
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
integrator should run. **SUPERSEDED (R3-A item 2)**: that invocation is
`node src/scripts/ledger-backfill.js`, never `node -e`.

## Decisions Taken Under Ambiguity

1. **Boundary canonicalization, not a loosened `SLUG_RE`.** Per the constraint,
   `SLUG_RE` is byte-for-byte unchanged. Lowercasing happens in `ledgerPath`
   (before the regex test) and in `slugFromPlanPath`. Lowercasing cannot introduce
   a `/`, `..`, drive letter, or any other traversal character, so the path-safety
   guard stays exactly as tight — verified: `ledgerPath('../../etc/passwd')` still
   throws (w02-s1 Case 6 green).

2. **Collision guard keyed on `plan_basename`, not on two real files.** macOS's
   default filesystem is case-insensitive, so two basenames differing only by case
   cannot coexist in ONE directory. The guard therefore compares an
   incoming/existing `plan_basename` (original-cased) at the canonical key: a
   genuine difference throws loudly; re-writing the SAME original basename
   (idempotent re-approval / re-backfill) is allowed. Confirmed by scan: ZERO
   case-collisions exist among current `done/` + `todo/` residents today.

3. **New write functions instead of overloading `writeEntry`.** Rather than add a
   `kind` flag to `writeEntry` (used by the out-of-scope `actions.js`
   `stampAndLedger`, which must keep its exact human-kind semantics), pipeline
   provenance ships as a sibling `writePipelineEntry`, and the legacy migration as
   `backfillEntry`. `writeEntry`'s signature and default (`approved_by: 'human'`)
   are untouched, so no out-of-scope caller changes behavior.

4. **`readEntryResult` added alongside `readEntry`, not replacing it.** The sweep
   needs to tell `unkeyable` / `corrupt` / `absent` apart to assign the right
   flag reason; the historical `readEntry` collapses all three to `null` and is
   still relied on by `actions.js` and s5's rollback test, so it is preserved
   verbatim and the discriminated reader is a new export.

5. **`backfillEntry(projectPath, planPath, { stage_to, reason })` signature.** The
   plan fixed this signature. `stage_from` is derived from `stage_to` via the
   gate-source map (`done→review`, `todo→implementation`, `implementation→
   functional`), falling back to the literal `'backfill'` so no required field is
   ever empty. It hashes the plan's CURRENT on-disk content (invalidate-on-edit
   holds immediately after migration).

6. **Fail-SAFE direction is toward FLAGGING.** An un-keyable slug, a corrupt
   entry, or an unreadable plan is classified a violation (never accepted), the
   per-plan fault is isolated so the sweep continues, and `main()`'s outer catch
   now logs the swallowed infrastructure error to the durable gate-violations
   store — the silent exit 0 that killed the hook is eliminated. The SIP1
   exemption was tightened to require a TRUE `absent` status (a corrupt/un-keyable
   entry can no longer be laundered into an exemption).

7. ~~**Vision exemption scoped to `done/` only**, matching `iron-loop-enforcer.js`'s
   `type:\s*vision` check exactly (that file is out of scope and only referenced).
   A `type: vision` archive in `done/` is skipped before classification; every
   non-vision bare plan is still flagged.~~

   > **SUPERSEDED by R3-A item 3.** This decision was WRONG and the exemption it
   > scoped has been DELETED. `plans/**.md` is Edit-whitelisted, so the exemption
   > let any agent squat the terminal `done/` folder with one frontmatter line and
   > zero provenance. What shipped: uniform, ledger-only acceptance with no
   > exemption anywhere. Archives that predate the ledger are migrated with
   > `node src/scripts/ledger-backfill.js --vision`.

8. **Plan file left in `todo/` — no stage move.** The parent's explicit
   constraints ("NO git; leave unstaged"; the INTEGRATOR runs the data migration
   and commit at the wave boundary) override the generic executor's
   in-progress→review move. Shipping the code + helper here and letting the
   integrator sequence the backfill-then-enforce transition IS the plan's design
   ("acceptance must be sequenced with the backfill the integrator runs").

## Integrator boundary migration — SUPERSEDED (R3-A item 2, then Z1)

> **DO NOT RUN THE `node -e` ONE-LINER THAT USED TO BE HERE.** It required
> `./src/lib/approval-ledger` inline and looped `backfillEntry`. That shape WAS the
> forgery R3-A closed: `PreToolUse.Bash.js` allowed any command starting with
> `node `, so an agent could mint human-kind approval entries for arbitrary plans and
> cross Gate 2 or Gate 3 by itself. Inline evaluation touching the ledger is now
> DENIED on the Bash channel. It is removed here rather than left as an example,
> because CTOC agents read full plan ancestry — an archived plan is an active
> instruction surface, not a historical record.

The sanctioned migration, one plan at a time, from the repo root:

```
node src/scripts/ledger-backfill.js --plan plans/<stage>/<plan>.md --stage <stage> --reason "<why>"
```

Archived decomposed visions have their own mode:

```
node src/scripts/ledger-backfill.js --vision
```

Then, once the residency sweep reports nothing un-ledgered, record the migration —
which is what ARMS the sweep's revert for future `no-ledger-entry` violations (Z1):

```
node src/scripts/ledger-backfill.js --mark-migrated
```

`--mark-migrated` is SELF-VERIFYING: it refuses while any un-ledgered resident
remains, and names exactly what blocks it. Until it has been run, the residency
sweep REPORTS un-ledgered residents (surfaced at `/ctoc:menu` → `inbox migration`)
instead of moving them — so a project that predates the ledger can never have its
plan archive rewritten on the first tool call after an update.

**As measured at the time (2026-07-14, read-only)** the sweep against this repo
reported `implementation: 0`, `todo: 7`, `done: 172` flagged (`no-ledger-entry`) —
the ~181 legacy gap minus the then-exempt `type: vision` archives. Those numbers are
the historical record of that moment and are NOT re-measured here.
