---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T18:00:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 orders "fix them all, do 50
  rounds of hard critique, keep fixing the code" and "fix everything", against
  the Round-5 security critic's findings (two verified by the coordinator's own
  execution: Bash ALWAYS_ALLOWED matches /^\s*node\s+/ first and PreToolUse.Bash
  never mentions .ctoc/approvals; isVisionExempt tests only `type: vision`).
---

---
title: "R3-A — Close ledger forgery for real: Bash parity, vision exemption killed, collision guard live, injection gates"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00011-r2z-boundary-typecheck-zero
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Bash.js"
  - "src/hooks/human-gate-check.js"
  - "src/lib/approval-ledger.js"
  - "src/lib/stale-cleanup.js"
  - "src/lib/actions.js"
  - "src/lib/compliance-regime.js"
  - "src/lib/stale-detector.js"
  - "src/scripts/ledger-backfill.js"
  - "src/commands/menu.md"
  - "tests/ledger-forgery-closed.test.js"
  - "tests/gate-hook-revival.test.js"
  - "tests/hooks-bash.test.js"
  - "tests/stale-cleanup-human-gate.test.js"
  - "tests/compliance-mode.test.js"
  - "tests/stale-detector-cheap.test.js"
---

# R3-A — The ledger's promise made true

The ledger's header claims agent writes to `.ctoc/approvals/` are DENIED. That
is false: the deny lives only in the Edit-family hook. `PreToolUse.Bash.js`
never mentions `.ctoc/approvals`, and its `ALWAYS_ALLOWED` list matches
`/^\s*node\s+/` FIRST (line 50-51, checked at 227) — so
`node -e "require('./src/lib/approval-ledger').writeEntry(...)"` mints a
human-kind entry for any plan and forges Gate 2 or Gate 3. R2 made this worse
by normalizing `node -e` as the sanctioned ledger-write channel. Separately,
`isVisionExempt` (human-gate-check.js:213) tests only `type: vision` while its
own header (line 68) documents `type: vision` AND `status: decomposed`, and
`plans/**.md` is Edit-whitelisted — so one frontmatter line squats in `done/`
with no provenance at all.

Fix the guarantee, not the wording.

## Implementation Details

1. **Bash parity for the ledger (CRITICAL).** In `PreToolUse.Bash.js`, BEFORE
   the `ALWAYS_ALLOWED` short-circuit: deny any command whose text targets
   `.ctoc/approvals` (any quoting/spacing form — normalize whitespace and
   quotes before matching, and match the path segment, not a naive substring),
   AND deny inline evaluation (`node -e`, `node --eval`, `-p`, `--print`,
   `--input-type`, piping a script into `node` via stdin heredoc) that cannot
   be statically cleared — with ONE exception: the sanctioned script in item 2.
   Read the existing deny/log machinery (hook-deny-signal.js, the enforcement
   log) and reuse it; the deny message names the sanctioned path.
   NOTE: this narrows a broad allowlist. Every legitimate `node -e` recipe in
   `src/commands/menu.md` (compliance write, cleanup exec, plan numbering,
   vision-decomposer, etc.) MUST keep working — so the deny targets ONLY
   inline-eval commands that reference `.ctoc/approvals` or `approval-ledger`,
   never `node -e` in general. Verify every menu.md `node -e` recipe still
   passes the hook (test each one).
2. **Sanctioned backfill script (replaces the ad-hoc `node -e`).**
   `src/scripts/ledger-backfill.js` — a checked-in, reviewable entry point
   (argv-driven, no eval) performing the legacy migration; it is the ONLY
   sanctioned ledger writer outside `stampAndLedger`/`stale-cleanup`. Add it to
   `SANCTIONED_SCRIPT_ROOTS` in `src/lib/reachability.js`? NO — reachability.js
   is not in this slice's files. Instead reference it from `src/commands/menu.md`
   (an instruction-surface root, which the fence already honors) so it stays
   reachable. Verify with the fence before finishing.
3. **Kill the vision exemption (HIGH).** Remove `isVisionExempt` from the
   acceptance path entirely. `done/` residency is uniformly ledger-driven.
   Decomposed visions get a PIPELINE-kind ledger entry
   (`evidence: 'vision-decomposed'`) written by whatever code archives them —
   find that path (grep the vision→done move; if it is a menu.md recipe with no
   code, the recipe must call a real function: add `archiveDecomposedVision(root,
   planPath)` to actions.js writing the pipeline entry + moving the plan, and
   point the recipe at it). The boundary migration ledgers the 10 existing
   vision archives as pipeline entries (the integrator runs the backfill script
   with a vision mode — expose it as a flag). Update human-gate-check's header
   to describe uniform ledger acceptance. iron-loop-enforcer's duplicate
   `type: vision` exemption is NOT in this slice (Round 6 deletes that whole
   duplicate check) — note it in the report.
4. **Collision guard live on the human path (MEDIUM).** `stampAndLedger`
   (actions.js) passes `plan_basename` into `writeEntry`, so the case-collision
   guard in `persistEntry` covers live approvals, not just backfill. Verify the
   guard actually fires (test two case-differing plans).
5. **Backfilled ≠ human at the gate (MEDIUM).** `entryKind` gains a third kind
   `'backfilled'`; the gate accepts it (the human ordered the migration) but
   the classification is HONEST and auditable — `classifyResidency` returns the
   real kind in its reason/detail so a future audit can tell a migrated entry
   from a live human approval. Do not weaken acceptance; make it truthful.
6. **Charset gate on compliance profiles (MEDIUM).** `writeActiveProfiles`
   rejects any profile name not matching `/^[a-z0-9][a-z0-9-]*$/` (return
   `{ok:false, error}`) — the "closed enum" invariant becomes code-enforced,
   not prose-enforced. Also scope `declineComplianceRegime`'s `declined:` regex
   to the `regulatory_regime:` block region (it currently matches the first
   `declined:` line anywhere in the file).
7. **Store hardening (LOW).** Size-gate the stale-dismissals read (mirror
   `MAX_PLAN_BYTES`); make `recordDeployReadyNotice`'s write atomic
   (temp + rename, like stale-cleanup).

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| Bash ledger deny | registered PreToolUse.Bash hook (hooks.json) | hook root |
| ledger-backfill.js | referenced by `src/commands/menu.md` (instruction-surface root) | /ctoc:menu |
| archiveDecomposedVision | the vision-archive menu recipe (menu.md, this slice) | /ctoc:menu |
| plan_basename on writeEntry | stampAndLedger (actions.js, this slice) | /ctoc:menu |
| backfilled kind | classifyResidency (human-gate-check, this slice) | hook root |
| charset gate + scoped regex | compliance recipes (menu.md, exist) | /ctoc:menu |

### Test Plan (TDD-Red first) — new tests/ledger-forgery-closed.test.js
THE FORGERY TEST (the point of the slice): drive `PreToolUse.Bash.js`'s real
decision function with the exact forging command
(`node -e "...approval-ledger...writeEntry..."`) → DENIED; with a plain
`node src/scripts/ledger-backfill.js ...` → allowed; with each real `node -e`
recipe copied verbatim out of menu.md → allowed (no collateral damage). Vision
squat: a `plans/done/x.md` with `type: vision` and no ledger entry → FLAGGED by
checkFolder (exemption gone). Decomposed vision WITH a pipeline entry →
accepted. Case-collision on the live approval path → throws. entryKind
'backfilled' distinguishable. Profile charset: `x]\nenforcement:\n  mode: off`
→ refused, settings.yaml unchanged on disk. declined regex scoped (a
`declined:` line in another block is untouched). Oversized dismissal store →
fails open, no crash. deploy-ready write is atomic (no partial file on
simulated failure — or assert temp+rename usage).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the named files, record red.
### Step 9: PREPARE — read every file in scope IN FULL from disk, plus
src/hooks/PreToolUse.Edit.js (the deny it mirrors, READ-ONLY), hooks.json, and
EVERY `node -e` recipe in src/commands/menu.md (they must all survive).
### Step 10: IMPLEMENT — items 1–7.
### Step 11: REVIEW — enumerate every command form the new deny blocks and
every one it must still allow; a false-positive that breaks a menu recipe is a
CRITICAL regression.
### Step 12: OPTIMIZE — hook stays fast (regex only, no fs walk).
### Step 13: SECURE — the deny is the security surface: re-attack it yourself
(quoting, `env node -e`, `/usr/bin/node -e`, `node  -e` double space, heredoc,
`bash -c 'node -e ...'`, base64 payload) and either block or DOCUMENT each
bypass honestly in the report. Do NOT claim closure you did not achieve.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
### Step 15: DOCUMENT — module headers state the REAL guarantee (which tools
are denied, which paths are sanctioned); no absolute claims the code can't keep.
### Step 16: FINAL-REVIEW — report; include the honest residual-bypass list.

## Decisions Taken Under Ambiguity
(Executor fills in.)
