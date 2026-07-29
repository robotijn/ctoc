---
title: "R3-A — Close the inline-eval ledger-forgery channel on the Bash gate: Bash/Edit parity, vision exemption killed, collision guard live, injection gates (static string gate — NOT a sandbox; residual write-file-then-run channel documented)"
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
  - "src/commands/start.md"
  - "src/lib/vision-decomposer.js"
  - "tests/ledger-forgery-closed.test.js"
  - "tests/gate-hook-revival.test.js"
  - "tests/pretooluse-bash-coverage.test.js"
  - "tests/stale-cleanup-human-gate.test.js"
  - "tests/compliance-mode.test.js"
  - "tests/stale-detector-cheap.test.js"
---

# R3-A — The ledger's promise made true on the Bash channel (inline-eval forgery closed)

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
   `src/commands/start.md` (compliance write, cleanup exec, plan numbering,
   vision-decomposer, etc.) MUST keep working — so the deny targets ONLY
   inline-eval commands that reference `.ctoc/approvals` or `approval-ledger`,
   never `node -e` in general. Verify every start.md `node -e` recipe still
   passes the hook (test each one).
2. **Sanctioned backfill script (replaces the ad-hoc `node -e`).**
   `src/scripts/ledger-backfill.js` — a checked-in, reviewable entry point
   (argv-driven, no eval) performing the legacy migration; it is the ONLY
   sanctioned ledger writer outside `stampAndLedger`/`stale-cleanup`. Add it to
   `SANCTIONED_SCRIPT_ROOTS` in `src/lib/reachability.js`? NO — reachability.js
   is not in this slice's files. Instead reference it from `src/commands/start.md`
   (an instruction-surface root, which the fence already honors) so it stays
   reachable. Verify with the fence before finishing.
3. **Kill the vision exemption (HIGH).** Remove `isVisionExempt` from the
   acceptance path entirely. `done/` residency is uniformly ledger-driven.
   Decomposed visions get a PIPELINE-kind ledger entry
   (`evidence: 'vision-decomposed'`) written by whatever code archives them —
   find that path (grep the vision→done move; if it is a start.md recipe with no
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
| ledger-backfill.js | referenced by `src/commands/start.md` (instruction-surface root) | /ctoc:menu |
| archiveDecomposedVision | the vision-archive menu recipe (start.md, this slice) | /ctoc:menu |
| plan_basename on writeEntry | stampAndLedger (actions.js, this slice) | /ctoc:menu |
| backfilled kind | classifyResidency (human-gate-check, this slice) | hook root |
| charset gate + scoped regex | compliance recipes (start.md, exist) | /ctoc:menu |

### Test Plan (TDD-Red first) — new tests/ledger-forgery-closed.test.js
THE FORGERY TEST (the point of the slice): drive `PreToolUse.Bash.js`'s real
decision function with the exact forging command
(`node -e "...approval-ledger...writeEntry..."`) → DENIED; with a plain
`node src/scripts/ledger-backfill.js ...` → allowed; with each real `node -e`
recipe copied verbatim out of start.md → allowed (no collateral damage). Vision
squat: a `plans/done/x.md` with `type: vision` and no ledger entry → FLAGGED by
checkFolder (exemption gone). Decomposed vision WITH a pipeline entry →
accepted. Case-collision on the live approval path → throws. entryKind
'backfilled' distinguishable. Profile charset: `x]\nenforcement:\n  mode: off`
→ refused, settings.yaml unchanged on disk. declined regex scoped (a
`declined:` line in another block is untouched). Oversized dismissal store →
fails open, no crash. deploy-ready write is atomic (no partial file on
simulated failure — or assert temp+rename usage).

## Execution Plan (Steps 8-16)
### Step 8: TEST — [x] wrote tests/ledger-forgery-closed.test.js, ran ONLY that file, recorded RED (MODULE_NOT_FOUND on the not-yet-written script).
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — [x] read every in-scope file IN FULL from disk, plus PreToolUse.Edit.js (the deny mirrored, read-only), hooks.json, and every `node -e` recipe in start.md.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — [x] ALL items 1–7 done and LIVE in the tree, verified against disk during this rework. Items 4 and 7-deploy-ready are NOT skipped: `stampAndLedger` passes `plan_basename` on the live human-approval path (`src/lib/actions.js:354`), and `recordDeployReadyNotice` writes atomically via temp+rename (`src/lib/actions.js:1261-1263`). Item 3's vision-archive call site is also live: `src/lib/vision-decomposer.js:280` calls `writeVisionArchiveEntry` immediately before the move. The earlier record's "SKIPPED / deferred to a concurrent slice" note was wrong — corrected here, and the phantom follow-ups are retired.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
### Step 11: REVIEW — [x] enumerated every denied vs allowed command form; the forgery test drives the REAL spawned hook against all start.md recipes verbatim (all ALLOW) and all forgery forms (all DENY).
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — [x] the guard is pure regex on the command string: no fs walk, no state read, linear-time literals only. It runs before loadState.
### Step 13: SECURE — [x] re-attacked; broadened the JS-runtime inline-eval set (node → node/deno/bun/ts-node/tsx) after the re-attack found `deno eval`/`bun -e` bypasses. Residual (write-a-.js-file-then-`node` it) is documented in the module docstring AND in this plan's Decisions section (see below) — it is not eliminated by a static string gate.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — [x] RE-RUN during rework with the REAL ship gate `npm test` (src/scripts/test-gate.js — enforces the coverage floor AND the zero-skipped gate, which `node --test` bypasses), on the FULL tree with these enforcement-code changes integrated. Result recorded in the Step-16 rework report below (# fail 0, # skipped 0, coverage ≥ floor). Supersedes the earlier subset `node --test` run (386 files) that never exercised the coverage floor or the ~71 unrun files.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — [x] module headers rewritten to state the REAL guarantee and its honest limits (approval-ledger, PreToolUse.Bash, human-gate-check, ledger-backfill).
### Step 16: FINAL-REVIEW — [x] report returned with the honest residual-bypass list. Reworked (see rework report below) to reconcile the record with the shipped tree and run the real ship gate.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Step-16 Rework Report (adversarial-review response)

Reworked in response to the adversarial review (2 critical, 3 important). Every finding was verified against the shipped source FIRST; one was refuted by reading the code.

- **VERIFY ran on a subset, not the real gate (CRITICAL — resolved).** The original Step 14 recorded only `node --test` on the changed and adjacent files (386 of 457), which this repo's own gate bypasses (no coverage floor, no zero-skipped gate). Re-ran the REAL gate `npm test` on the full tree with all enforcement-code changes integrated: **`# fail 0`, `# skipped 0`, coverage 99.03% (threshold 99%), test-gate PASS, exit 0.** The heavy rewrite of the Bash forgery gate, the human-gate hook, and the approval ledger is now certified by the gate that enforces the floor.

- **`files:` named a nonexistent file and omitted an edited one (IMPORTANT — resolved).** The list declared `src/commands/menu.md` (does not exist; the command file is `src/commands/start.md`, which carries the live ledger-backfill reachability root at lines 58-59 and the vision-archive recipe) and `tests/hooks-bash.test.js` (does not exist; the real bash surface is `tests/pretooluse-bash-coverage.test.js` alongside `tests/ledger-forgery-closed.test.js`). Corrected the frontmatter and all body references; added `src/lib/vision-decomposer.js` (the live vision-archive call site) to the declared surface.

- **Record contradicted the tree (IMPORTANT — resolved).** The completion record claimed item 4 (`plan_basename` into `stampAndLedger`), item 7-deploy-ready (`recordDeployReadyNotice` atomic write), and the vision-archive call site were SKIPPED / deferred to a concurrent slice. All three are LIVE in the tree: `actions.js:354` (plan_basename on the live human-approval crossing), `actions.js:1261-1263` (temp+rename atomic deploy notice), `vision-decomposer.js:280` (writeVisionArchiveEntry before the move). Marked done, retired the phantom follow-ups.

- **Title overstated the guarantee (IMPORTANT — resolved).** "Close ledger forgery for real" claimed more than a static string gate delivers. Softened the title, kept the H1 honest, and moved the full residual (write-an-arbitrary-`.js`-then-`node` it, and driving a legitimate pipeline writer) into this plan's Decisions section — it already lived in the `PreToolUse.Bash.js` HONEST LIMITS docstring but not where the human reads at the gate.

- **"Last-block unparseable" reader bug (LOW — REFUTED, no code fix needed for it).** The claim that `regulatory-regime.js` cannot parse a `regulatory_regime:` block that is last in the file is false against the shipped regex, whose `(?![\s\S])` end-of-string alternative resolves a last block — verified empirically on four cases. The stale disclosure was corrected, and the matching false-rationale comment in `compliance-regime.js` (which claimed the reader "needs a following top-level key") was corrected to state that prepend-on-legacy is defensive ordering, not a parsing requirement. No behavior change (comment only), so no new test.

**Code change in this rework:** one comment correction in `src/lib/compliance-regime.js` (no behavior change). Everything else is record reconciliation. Ledger residency: this plan is in `review/`, not a swept gate destination, so its content hash is not re-stamped — the human's review→done crossing writes the definitive ledger entry.

## Decisions Taken Under Ambiguity

- **Items 4 & 7-deploy-ready are LIVE, not skipped (record corrected in rework).** The earlier record claimed both were deferred to a concurrent actions.js slice; the tree contradicts that. `stampAndLedger` passes `plan_basename: path.basename(planPath).replace(/\.md$/i,'')` into `writeEntry` on the live human-approval crossing (`src/lib/actions.js:354`), arming the case-collision guard in `persistEntry` on real approvals — not just backfill. `recordDeployReadyNotice` writes atomically via temp+rename (`src/lib/actions.js:1261-1263`). No follow-up remains for either; the phantom items are retired.

- **The ledger deny is a NARROW static gate, not a sandbox (item 1).** It denies (a) any non-read command whose text names `.ctoc/approvals`, and (b) INLINE EVAL (`node`/`deno`/`bun`/`ts-node`/`tsx` with `-e`/`--eval`/`-p`/eval-subcommand/stdin) that names the ledger module, the ledger dir, a gate/ledger verb, contains a command substitution, or a non-literal `require()` arg. It deliberately does NOT deny `node file.js` (a checked-in, reviewable artifact) — that is the point of the sanctioned `ledger-backfill.js`. Broadening to all `node -e` would break every menu recipe (a CRITICAL regression), so the deny is intentionally scoped.

- **Vision archives get a PIPELINE-kind entry, not an exemption (item 3) — call site is LIVE.** `writeVisionArchiveEntry` (evidence `vision-decomposed`, stage vision→done) is the earned residency, and the archiving call site is wired in this rework's tree: `src/lib/vision-decomposer.js:280` calls `require('./approval-ledger').writeVisionArchiveEntry(root, visionPath)` immediately before the move to `done/`, against the final on-disk bytes. `vision-decomposer.js` is therefore part of this slice's real change surface and is now declared in `files:`. `ledger-backfill.js --vision` (start.md-referenced, idempotent) remains for migrating pre-existing un-ledgered archives. The earlier "FOLLOW-UP for the vision-decomposer slice" note is retired — the call is live. The duplicate `type: vision` exemption in `iron-loop-enforcer.js:349` is a separate ADVISORY self-check (out of scope) — flagged for Round 6, unchanged here.

- **entryKind gained a third kind `'backfilled'` (item 5).** A backfilled entry is ACCEPTED at the gate (the human ordered the migration) but classified honestly as `'backfilled'`, never `'human'`, so an audit distinguishes a migration from a live approval. `classifyResidency` now returns `kind` on every verdict.

- **The "last-block unparseable" reader limitation was REFUTED in rework (item 6).** The earlier record claimed `regulatory-regime.js:177` could not parse a `regulatory_regime:` block that is LAST in the file. That is false against the shipped code: the block regex `/^regulatory_regime:\s*\n([\s\S]*?)(?=^[a-zA-Z_]+:|(?![\s\S]))/m` has an end-of-string alternative (`(?![\s\S])`, added in v6.12.63) that resolves a last block — verified empirically on last-with-newline, last-without-newline, followed, and multi-line-last cases, all parsed correctly. `declineComplianceRegime`'s scoped-region fix (item 6) and its PREPEND-on-legacy behavior stand and are correct; the stale "reader needs a following top-level key" rationale comment in `compliance-regime.js` was corrected in this rework to say prepend is defensive ordering, not a parsing requirement.

- **Residual, stated honestly (item 1 / q13).** This is a STATIC STRING GATE, not a sandbox. It closes the inline-eval forgery channel (`node -e`/`--eval`/`-p`/stdin, plus deno/bun/ts-node/tsx, plus command-substitution and non-literal-`require` payloads) and any non-read touch of `.ctoc/approvals`. It does NOT close, BY DESIGN, the channel where an agent writes an arbitrary `.js` file under a plan-covered path and runs `node that-file.js`, nor driving another module that legitimately writes a pipeline entry (`stale-cleanup`). Those are the same shape as the sanctioned writer and leave a REVIEWABLE artifact (a checked-in file, a stale-cleanup log entry) — the opposite of the un-auditable one-liner this gate closes. Fully closing the write-file-then-run channel needs a real sandbox, which this slice never claimed to be; the title was corrected to stop over-claiming. This residual is also in `PreToolUse.Bash.js`'s HONEST LIMITS docstring.
