---
approved_by: human
approved_at: 2026-07-18T11:12:18.169Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "The residency sweep REPORTS on an unmigrated project — it does not move 172 plans on a user's first tool call"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/gate-migration.js
  - src/hooks/human-gate-check.js
  - src/scripts/ledger-backfill.js
  - src/lib/menu-screens.js
  - plans/review/00008-r2f-gate-hook-revival.md
  - tests/gate-migration.test.js
  - tests/gate-hook-revival.test.js
  - tests/human-gate-check-coverage.test.js
---

# The residency sweep REPORTS on an unmigrated project

## Problem — verified by direct reading, not inference

`.claude-plugin/hooks.json:93-100` registers `src/hooks/human-gate-check.js` under
`PreToolUse` with matcher `"*"` — **every tool call**. On each call `main()`
(`human-gate-check.js:435`) sweeps every gate destination
(`:441` `for (const folder of Object.keys(HUMAN_GATES))` → `implementation`, `todo`,
`done`) and, at `:455`, calls `revertAll(allViolations)` with **no dry-run, no
confirmation, and no first-run check**.

`revertPlan` (`:372-406`) reads each violating plan, appends a
`**⚠️ HUMAN GATE VIOLATION**` note, writes the result into the gate-SOURCE folder,
and unlinks the original. It refuses to overwrite a same-basename plan already at
the destination (`:386-391`), so a colliding plan survives — but **every
non-colliding plan is moved and rewritten**.

`classifyResidency` (`:202-257`) returns `no-ledger-entry` (`:209`) for any resident
with no ledger entry — which is **every pre-ledger `done/` plan in every existing
user project**. This repository survived only because a bulk backfill was run at a
wave boundary. No installed project has that.

I grepped `src/hooks/human-gate-check.js` for
`enforcement|settings|mode|isEnabled|escape|whitelist`: only comment prose at lines
17 and 86, **no code**. There is no enforcement-mode read, no first-run guard, no
opt-out.

CTOC ships from the marketplace. This reaches every user at once and cannot be
recalled.

### Correction to the received brief (verified, and it changes the design)

The brief states the guard should reuse "the `enforcement.mode` setting the
edit-enforcement path honors". **No such reader exists.** I grepped
`enforcement\.mode|settings\.yaml|getEnforcementMode|readEnforcement` across `src/`:
the only `settings.yaml` readers are `stop-test-gate.js`, `regulatory-regime.js`,
`compliance-regime.js`, `deployment.js`, `areas/system.js`, and `project-root.js`.
None reads `enforcement.mode`. `src/hooks/PreToolUse.Task.js:26-28` says so
explicitly:

> ENFORCEMENT MODE. The sibling PreToolUse hooks do not read `enforcement.mode`
> from `.ctoc/settings.yaml` today — no hook does — so this one does not either,
> rather than inventing a knob its siblings do not honor.

`CLAUDE.md`'s "Per-project tuning via `.ctoc/settings.yaml` → `enforcement.mode`"
is documentation drift over an unwired setting. Gating a safety-critical hook on an
unread knob would ship a guard that does nothing. See Decision 1.

## The fix (shape decided by the human — not re-litigated)

The residency sweep must not REVERT until the project is migrated. Until then it
REPORTS. Migration is a **positive, recorded fact**, written only by the sanctioned
`src/scripts/ledger-backfill.js`.

### Why this is NOT "weakening a human gate" — state this argument, a reviewer will challenge it

`tests/environment-mode.test.js` enforces a hard rule: no profile may weaken a human
gate. This change is defensible against that rule on three independent legs, and the
executor must preserve all three:

1. **The withheld action is scoped to exactly ONE violation reason:
   `no-ledger-entry`.** Every other reason — `hash-mismatch`, `wrong-edge`,
   `unknown-provenance`, `pipeline-not-allowed`, `pipeline-no-evidence`,
   `sufficiency-not-allowed`, `sufficiency-no-evidence`, `ledger-corrupt`,
   `ledger-unkeyable`, `unreadable` — means **provenance EXISTS and is WRONG**: a
   tampered hash, a forged kind, a corrupt record. Those are live attack signatures
   and they are reverted **exactly as today, on every project, migrated or not**.
   Enforcement strength is unchanged wherever provenance exists.
2. **`no-ledger-entry` is precisely and only the signature of "provenance was never
   recorded"** — the pre-ledger condition. On an unmigrated project a legacy
   resident and a fresh forgery are *indistinguishable* on this signal. The fail-safe
   direction for a **destructive, irreversible, bulk** action under genuine ambiguity
   is to report, not to move 172 files.
3. **Detection is never withheld.** The violation is still computed, still logged to
   the durable gate-violations store, still printed, and now additionally surfaced in
   the human's inbox with the migration command. The gate still *says no*; it just
   does not *rewrite the archive* on a project whose provenance was never recorded.

The action withheld is a **migration action on an unmigrated project**, not a gate.

### The state machine

| Project state | `no-ledger-entry` violation | Every other reason |
|---|---|---|
| Unmigrated (no marker) | **REPORT** — logged, surfaced in inbox, file untouched | REVERT (unchanged) |
| Migrated (marker present) | REVERT (unchanged) | REVERT (unchanged) |

Marker absent, unreadable, corrupt, or `migrated !== true` → **unmigrated → report**.
Fail safe, never fail open.

Post-migration the marker is what *arms* reverts for future `no-ledger-entry`
violations: the project is known clean as of migration, so a new one is a forgery.
That is the marker's whole non-redundant function.

## Implementation Details

### Dependency Graph

```
src/lib/gate-migration.js  (NEW, leaf — requires only path + safe-fs)
    ├─ required by → src/hooks/human-gate-check.js  (main(): partition before revert)
    ├─ required by → src/scripts/ledger-backfill.js (--mark-migrated)
    └─ required by → src/lib/menu-screens.js        (inbox count + door screen)

tests/gate-migration.test.js       → src/lib/gate-migration.js
tests/gate-hook-revival.test.js    → src/hooks/human-gate-check.js (+ the real hazard test)
tests/human-gate-check-coverage.test.js → unchanged behavior on a migrated project
```

No cycles. `gate-migration.js` requires **only** `path` and `../lib/safe-fs` — it sits
on the every-tool-call hook path, so it must not pull in `approval-ledger`,
`settings`, or any YAML parsing.

---

### File: `src/lib/gate-migration.js`
**Action:** CREATE
**Purpose:** Decide whether a project has been migrated to the approval ledger, split
a violation set into revert-now vs. report-only, and own the durable pending notice
that the menu reads.
**Change Type:** new-module

#### Constants

```js
// The marker lives INSIDE the agent-write-denied ledger directory. Verified:
// PreToolUse.Edit.js:97,385-390 denies agent Edit/Write under `.ctoc/approvals`,
// and PreToolUse.Bash.js:134-192 denies every non-read-only Bash touch of that
// path (including the cd-split shape). So an agent can neither forge the marker
// (arming reverts) nor DELETE it (disarming them). `ledger-backfill.js` reaches it
// because `node src/scripts/ledger-backfill.js` carries no ledger path operand —
// it is the one sanctioned channel, by the same design that R3-A established.
//
// The leading dot makes the name unaddressable as a ledger entry: `ledgerPath`
// (approval-ledger.js:143-152) keys `<slug>.json` and SLUG_RE is
// /^[a-z0-9][a-z0-9-]*$/, which a leading '.' can never match.
const MARKER_REL = path.join('.ctoc', 'approvals', '.migration-complete.json');
const NOTICE_REL = path.join('.ctoc', 'logs', 'gate-migration-pending.json');

// The ONE reason whose revert is withheld on an unmigrated project.
const WITHHELD_REASONS = new Set(['no-ledger-entry']);

const MIGRATION_COMMAND = 'node src/scripts/ledger-backfill.js --mark-migrated';
```

#### Exports

- `isMigrated(projectPath: string)` → `boolean`
  - True **only** when the marker file exists, parses as JSON, and has
    `migrated === true`. Absent / unreadable / corrupt / any throw → `false`.
  - Never throws. Fail-safe direction is toward `false` (report).
- `readMarker(projectPath: string)` → `{migrated: boolean, at: string, mode: 'verified'|'forced', ledgered: number}|null`
  - The parsed marker, or `null` on any failure. Used by the door screen to tell the
    human when and how the project was migrated.
- `partitionViolations(violations: Array<object>, migrated: boolean)` → `{revert: Array, withheld: Array}`
  - Pure. `migrated === true` → `{revert: [...violations], withheld: []}` (today's
    behavior, byte-identical).
  - `migrated === false` → a violation goes to `withheld` iff
    `WITHHELD_REASONS.has(v.reason)`; everything else goes to `revert`.
  - A violation with a missing/`null` reason: `main()` already defaults the display
    to `no-ledger-entry` (`human-gate-check.js:451`), so treat `null`/`undefined`
    reason as `no-ledger-entry` → withheld. Fail-safe.
- `writeMarker(projectPath: string, marker: object)` → `void`
  - `mkdirSync(recursive)` then atomic temp+rename (`safeFs.writeFileSync` to
    `<path>.tmp-<pid>` then `safeFs.renameSync`), mirroring
    `actions.js:1221`'s deploy-ready write. Throws on real failure (the CLI reports
    it loudly).
- `writePendingNotice(projectPath: string, withheld: Array<object>)` → `boolean`
  - **SNAPSHOT, never append.** This runs on every tool call; an appending log would
    grow without bound. Serializes
    `[{plan, folder, reason, at}]` sorted by `folder` then `plan` (stable ordering →
    stable comparison), plus a `command` field carrying `MIGRATION_COMMAND`.
  - **Compare-then-write:** reads the existing file and returns `false` without
    writing when the payload is byte-identical apart from timestamps. Keeps the disk
    quiet across thousands of tool calls. Returns `true` when it wrote.
  - When `withheld` is empty and the file exists, it is REPLACED with `[]` (so a
    stale notice never outlives the condition), and the inbox count drops to 0.
  - Never throws: any failure returns `false`. A hook must not die writing a notice.
  - `at` is stamped once per write, not per entry.
- `readPendingNotice(projectPath: string)` → `Array<{plan, folder, reason, at}>`
  - Fail-open `[]` on missing/corrupt, mirroring `menu-screens.readDeployReady`
    (`menu-screens.js:594-603`) exactly.
- `MIGRATION_COMMAND`, `WITHHELD_REASONS` — exported for the hook banner, the door
  screen, and the tests.

#### Cross-platform
`path.join` for both relative paths; `safe-fs` for every filesystem call; no shell;
no `os.homedir` needed (everything is project-relative).

#### Error handling
Every read is `try/catch` → safe default. `writeMarker` is the ONE function allowed
to throw, because it runs in the CLI where a silent no-op migration would be the
defect (matches `ledger-backfill.js`'s `{ok:false,error}` + exit 1 contract).

---

### File: `src/hooks/human-gate-check.js`
**Action:** MODIFY
**Purpose:** Withhold the destructive revert on an unmigrated project; report instead.

#### Changes

- **Import** at the top requires block (after the `durable-log` require, line ~94):
  `const gateMigration = require('../lib/gate-migration');`
- **Modify `main()`** (`:435-515`). Between the violation sweep (`:441-443`) and
  `revertAll` (`:455`), insert the partition. The exact new shape:

```js
const migrated = gateMigration.isMigrated(projectPath);
const { revert: toRevert, withheld } =
  gateMigration.partitionViolations(allViolations, migrated);

// The notice is written on EVERY sweep (snapshot + compare-then-write), so it
// self-clears the moment the project is migrated or the residents are ledgered.
gateMigration.writePendingNotice(projectPath, withheld);
```

  - The existing `console.error` violation listing at `:446-452` stays, but each line
    now says whether the plan was reverted or reported.
  - `revertAll(toRevert)` replaces `revertAll(allViolations)` at `:455`. Everything
    downstream (`:457-488`) is untouched — the reverted/failed logging is unchanged.
  - After the revert block, when `withheld.length > 0`, print the report banner to
    stderr and log **one** durable entry per withheld plan with
    `action: 'REPORTED (project not migrated to the approval ledger)'` and
    `status: 'migration_pending'`. New status value; the existing store is
    schema-free JSONL so no reader breaks.
  - Guard the durable logging against churn: the hook runs on every tool call, and
    `logViolation` appends. **Only log withheld plans when `writePendingNotice`
    returned `true`** (i.e. the pending set actually changed). This is the difference
    between one entry per real change and one per keystroke.
- **Update the module header** (the block at `:41-50` already names this migration as
  an open decision): replace it with the resolved behavior — the report-until-migrated
  state machine, the three-leg "this is not a gate weakening" argument, and the
  marker's location/forgery-resistance.
- **Update `module.exports`** (`:517-528`) — no new exports needed; the hook's own
  surface is unchanged. `main` stays the entry point.

#### Called By
`.claude-plugin/hooks.json:93-100` — the registered `PreToolUse` matcher `"*"` hook.
**This is the live root; no new wiring is required for the hook side.**

#### Data flow
```
every tool call → main() → checkFolder × 3 → allViolations
  → isMigrated(root) → partitionViolations
  → writePendingNotice(root, withheld)   [snapshot]
  → revertAll(toRevert)                  [unchanged path]
  → logViolation × (reverted ∪ failed ∪ withheld-if-changed)
  → exit 0
```

---

### File: `src/scripts/ledger-backfill.js`
**Action:** MODIFY
**Purpose:** Give the human the one sanctioned, argv-driven way to record migration.

#### Changes

- **Add** `--mark-migrated` and `--force` to `parseArgs` (`:74-92`), in the existing
  `switch`: `case '--mark-migrated': opts.markMigrated = true; break;` and
  `case '--force': opts.force = true; break;`. An unknown flag stays an error.
- **Add** `markMigrated(root, opts)` after `backfillOnePlan` (`:186`):

```js
/**
 * Record that this project's approval provenance has been migrated, which ARMS the
 * residency sweep's revert for `no-ledger-entry` violations. Self-verifying: it
 * refuses unless the sweep is already clean, so the marker can never be written
 * prematurely and re-arm a bulk revert over legacy plans.
 *
 * @param {string} root
 * @param {{force?: boolean, dryRun?: boolean}} opts
 * @returns {{ok: boolean, ledgered: string[], skipped: Array<object>, error?: string, marker?: object}}
 */
function markMigrated(root, opts) { ... }
```

  - Enumerate the pending set by calling `gate.checkFolder(folder, root)` for
    `['implementation', 'todo', 'done']` and keeping violations whose reason is in
    `gateMigration.WITHHELD_REASONS`.
    **Requires `require('../hooks/human-gate-check')` — safe: that module is guarded
    by `require.main === module` (`:533-535`), so importing it never runs the sweep
    or calls `process.exit`.**
  - Non-empty and `!opts.force` → `{ok: false, error: <count + the first 20 plans +
    the two remedies>}`. Exit 1, loud, listing exactly what blocks the marker and both
    ways forward (`--plan/--stage` each one, or `--force`).
  - Empty, or `opts.force` → `writeMarker(root, {migrated: true, at: ISO,
    mode: force ? 'forced' : 'verified', ledgered: <count of files in the ledger dir>,
    pending_at_mark: <withheld count>})`.
  - `--dry-run` reports the verdict and writes nothing.
- **Wire into `run()`** (`:197-213`): after the `--vision`/`--plan` mutual-exclusion
  check, add `--mark-migrated` as a third mutually-exclusive mode; `--force` is only
  meaningful with it (`--force` alone → error, never a silent ignore).
- **Update `USAGE`** (`:53-63`) with the new mode and a one-line statement that it
  arms the revert.
- **Update the module header** (`:4-44`) to name the third mode and its purpose.

#### Called By / Reachability (Lesson 16)
`src/commands/menu.md` already documents this script as the migration recipe (per its
own `REACHABILITY` note at `:19-20`). The new mode is reachable the same way, **and**
the door screen below prints the exact invocation to the human. Add the
`--mark-migrated` line to the `menu.md` recipe **only if** reading that file at Step 9
shows the backfill recipe there; if it is absent, record that in
`## Decisions Taken Under Ambiguity` rather than editing an out-of-scope file.

---

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** Make the report **human-visible**, following the deploy-ready precedent
exactly. A report path with no reader is the same defect R3-D fixed.

#### Changes

- **Import**: `const gateMigration = require('./gate-migration');` alongside the
  existing requires.
- **Dashboard inbox** (`:243-286`), mirroring `readDeployReady` at `:250` line-for-line:

```js
const migrationPending = gateMigration.readPendingNotice(root).length;
const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting
  + stale + escalations + deployReady + migrationPending;
```

  and inside the `inboxTotal > 0` block, after the `deployReady` line (`:273-275`):

```js
if (migrationPending > 0) {
  out += `  ⛔ ${migrationPending} plan${migrationPending === 1 ? '' : 's'} would be reverted — approval ledger not migrated · view: inbox migration\n`;
}
```

  **Zero pending adds zero output** — the dashboard is byte-identical for a migrated
  or clean project, so no existing dashboard substring or count assertion regresses.
- **Add `inboxMigrationScreen(projectPath)`** modeled on `inboxEscalationsScreen`
  (`:618-674`), returning the same `{text, ask, actions}` shape:
  - Header `Inbox ▸ Approval-ledger migration (N)`.
  - Plain-language explanation: these plans reside in a gate destination with no
    recorded approval provenance; CTOC is **not** moving them; enforcement is fully
    active for every other violation kind.
  - Up to `INBOX_DOOR_MAX_ROWS` rows: `folder/plan` + age via `_inboxAge`.
    **Every attacker-influenceable field through `stripCtl`**, exactly as the
    escalations screen does (`:638-643`).
  - The two remedies, verbatim and copy-pasteable:
    `node src/scripts/ledger-backfill.js --plan plans/done/<x>.md --stage done --reason "<why>"`
    and `node src/scripts/ledger-backfill.js --mark-migrated`.
  - Read-only. It opens nothing and crosses nothing.
- **Route `inbox migration`** to the new screen wherever `inbox escalations` /
  `inbox questions` are routed. Find that dispatch at Step 9 by grepping
  `'inbox escalations'` across `src/`; add the sibling case there.
- **Export** `inboxMigrationScreen` in `module.exports` alongside
  `inboxEscalationsScreen`.

#### Called By
`src/commands/menu.js` → the dashboard render (the live root a human reaches with
`/ctoc:menu`). **This is the slice's reachability leg — the report path is reachable
by a human in the same unit of work that creates it.**

---

### File: `plans/review/00008-r2f-gate-hook-revival.md`
**Action:** MODIFY
**Purpose:** Stop the archive from teaching future agents the forgery shape and a
deleted bypass. CTOC agents read full plan ancestry, so a stale archived plan is an
active instruction surface, not a historical record.

Verified stale sections (line numbers read from disk; re-read before editing):

1. **`:155-182` — the `node -e` migration runbook.** A multi-line inline eval that
   requires `./src/lib/approval-ledger` and loops `backfillEntry`. This is *exactly*
   the shape `approval-ledger.js:532-535` and `PreToolUse.Bash.js` now DENY as the
   forgery.
   **Replace** with the sanctioned invocation:
   `node src/scripts/ledger-backfill.js --plan <path> --stage <stage> --reason "..."`
   per plan, then `--mark-migrated`. Keep the measured result line (`:184-187`,
   `todo: 7`, `done: 172`) as the historical record it is, relabeled "as measured at
   the time" — do **not** invent new numbers.
2. **`:53-56` (change 4) and `:143-146` (Decision 7) — the `type: vision` exemption
   in `done/`.** The shipped hook deliberately REMOVED it as a forgery hole
   (`human-gate-check.js:71-83`), and `tests/gate-hook-revival.test.js:195-203`
   asserts the exact opposite ("a bare type: vision plan in done/ is FLAGGED").
   **Rewrite both** as SUPERSEDED-by-R3-A notes recording what was originally decided,
   why it was wrong, and what shipped — matching the style the test file already uses
   at `:185-193`.
3. **`:60-61` (change 5)** — "No standalone script file …; the integrator drives it
   via `node -e`". Superseded: `src/scripts/ledger-backfill.js` exists and is the one
   sanctioned channel.
4. **`:69` (the Wiring table row)** — "backfillEntry | integrator boundary migration
   (node -e, this wave)". Same replacement.
5. **`:77` (Test Plan)** — "Vision-typed plan in done/ exempt". Superseded.
6. **`:95-96` (Step 16)** — "exact `node -e` backfill invocation". Superseded.

Marking rather than deleting preserves the audit trail while removing the
instruction. Every edit is a SUPERSEDED annotation plus the corrected text; no history
is erased.

**Note:** this file is in `plans/review/`, whitelisted for edits
(`plans/*.md` per the enforcement hook's Step-1 whitelist), and editing it moves no
plan and crosses no gate.

---

### Test Plan

**Framework:** `node:test` (`describe`/`it`/`test` + `node:assert/strict`), temp
sandboxes via `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, torn down in
`afterEach` — the established shape in `tests/gate-hook-revival.test.js:32-46`.

#### `tests/gate-migration.test.js` — CREATE

1. **Happy path — unmigrated:** `isMigrated(sandbox)` → `false` on a fresh project.
2. **Happy path — migrated:** after `writeMarker(root, {migrated: true, ...})`,
   `isMigrated` → `true`.
3. **Fail safe — corrupt marker:** write `{` into the marker → `isMigrated` → `false`.
4. **Fail safe — `migrated: false`:** a marker with `migrated: false` → `false`.
5. **Fail safe — `migrated: "true"` (string):** → `false` (strict `=== true`).
6. **Partition, migrated:** `partitionViolations([a,b,c], true)` → all three in
   `revert`, `withheld` empty.
7. **Partition, unmigrated — reason scoping (the load-bearing case):** given
   violations with reasons `no-ledger-entry`, `hash-mismatch`, `wrong-edge`,
   `unknown-provenance`, `ledger-corrupt`, `pipeline-not-allowed` → **only**
   `no-ledger-entry` in `withheld`; the other five in `revert`. This is the test that
   proves enforcement is not weakened where provenance exists.
8. **Partition, unmigrated — null reason** → withheld (fail safe).
9. **Notice snapshot, not append:** write the same withheld set 3× → the file holds
   exactly N entries, and the 2nd and 3rd calls return `false` (no write).
10. **Notice self-clears:** write a 2-entry notice, then `writePendingNotice(root, [])`
    → `readPendingNotice` returns `[]`.
11. **Notice fail-open:** corrupt the notice file → `readPendingNotice` → `[]`, no throw.
12. **Marker path is not a ledger slug:** assert the marker basename cannot satisfy
    `approval-ledger`'s slug rule — `assert.throws(() => ledger.ledgerPath('.migration-complete', root))`
    — so the marker can never be addressed as an entry.

#### `tests/gate-hook-revival.test.js` — MODIFY (add, never weaken existing assertions)

13. **THE HAZARD, end to end — a fixture project with an unledgered `done/` plan is
    REPORTED and NOT MOVED.** This is the test the whole slice exists for:
    - Build a sandbox with `plans/{review,done}/` and `.ctoc/approvals/`.
    - Write `plans/done/legacy-plan.md` with **no** ledger entry (the pre-ledger shape).
    - Capture the file's content and its `mtimeMs`.
    - Run the sweep through the real `main()` path (see the note below), with `cwd`
      set to the sandbox.
    - Assert **all** of:
      - `fs.existsSync(plans/done/legacy-plan.md)` is `true`;
      - `fs.readFileSync(...)` is **byte-identical** to the original (no
        `HUMAN GATE VIOLATION` note appended);
      - `fs.existsSync(plans/review/legacy-plan.md)` is `false` (not moved);
      - `gateMigration.readPendingNotice(sandbox)` contains `legacy-plan`.
14. **Same project, after migration, is enforced normally.** In the same sandbox:
    `gateMigration.writeMarker(sandbox, {migrated: true, ...})`, re-run the sweep, then
    assert the plan **is** moved to `plans/review/`, the moved file **does** contain
    the `HUMAN GATE VIOLATION` note, and the original path no longer exists.
15. **A tampered plan is reverted even on an UNMIGRATED project.** Write
    `plans/done/tampered.md`, ledger it with `writeEntry` + a matching hash, then
    append a byte to the file (→ `hash-mismatch`). Sweep unmigrated → the plan **is**
    reverted. Proves leg 1 of the not-a-gate-weakening argument at the integration
    level, not just the unit level.
16. **Mixed set, unmigrated:** one `no-ledger-entry` plan and one `hash-mismatch` plan
    in `done/` → exactly one moved, exactly one reported.

**Note on driving `main()`:** `main()` calls `process.exit(0)` and reads
`process.cwd()`. At **Step 9** determine which of these the existing tests already
solve — `tests/human-gate-check-coverage.test.js` exercises `main()` and its
technique is the one to reuse. If it spawns a child process (`process.execPath` +
the hook file, `cwd` set to the sandbox), reuse that. Do **not** refactor `main()`'s
signature to make it testable: changing the hook's entry contract is out of scope and
risks the registration. If no in-process technique exists, drive the child process —
it is the more faithful test regardless, because it exercises the exact path
`hooks.json` invokes.

#### `tests/human-gate-check-coverage.test.js` — MODIFY

17. **No regression on a migrated project.** Every existing test in this file must
    keep passing. Add the marker to whatever sandbox setup those tests use so their
    behavior is explicitly the migrated path — **or**, if they assert on reasons other
    than `no-ledger-entry`, leave them untouched and record that in the plan's
    decisions. Read the file in full at Step 9 before deciding; **never weaken an
    assertion to make it pass** (Lesson 14).

#### Coverage targets
Line and branch coverage ≥ 80% on `src/lib/gate-migration.js` (it is small, pure, and
fully exercisable — aim for 100%). Every `catch` branch is reached by tests 3, 5, 11.
The repository floor in `.ctoc/coverage-baseline.json` (**99**, scoped to `src/**`)
must not drop.

---

### Security Review

- [x] **Path traversal** — every path is built with `path.join` from the caller's
  `projectPath`; no user string is interpolated into a path. Plan slugs reaching the
  notice come from `path.basename` in the sweep, never from user input.
- [x] **Input validation** — `isMigrated` demands `migrated === true` (strict); a
  string, `1`, or a truthy object does not migrate a project.
- [x] **No secrets** — the marker and notice hold plan names, folders, reasons, and
  timestamps only.
- [x] **Safe file operations** — writes target exactly `.ctoc/approvals/.migration-complete.json`
  and `.ctoc/logs/gate-migration-pending.json`, both derived from `projectPath`.
- [x] **Forgery resistance** — the marker sits in the agent-write-denied ledger
  directory (Edit deny `PreToolUse.Edit.js:385-390`; Bash deny
  `PreToolUse.Bash.js:134-192`). An agent can neither create it (to arm a bulk
  revert of a human's archive) nor delete it (to disarm enforcement).
- [x] **Premature-marking resistance** — `--mark-migrated` self-verifies against the
  live sweep and refuses while `no-ledger-entry` residents remain; `--force` is an
  explicit, human-typed act recorded in the marker as `mode: 'forced'`.
- [x] **Error messages** — no stack traces, no absolute paths beyond the plan-relative
  names the human already sees in the dashboard.
- [x] **Prototype pollution** — the marker and notice are parsed with `JSON.parse` and
  read by fixed property access only; no merge, no dynamic key assignment.
- [x] **Command injection** — no `exec`, no `execSync`, no shell anywhere in this
  slice. The migration command is a *displayed string*, never executed by CTOC.
- [x] **Control characters** — every attacker-influenceable field in the door screen
  passes through `stripCtl`, matching `inboxEscalationsScreen`.
- [x] **Denial of service** — the notice is a bounded snapshot with compare-then-write,
  so a hook firing thousands of times per session does not grow a file or thrash the
  disk.

---

## Execution Plan

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Write `tests/gate-migration.test.js` (cases 1–12) and the new cases in
`tests/gate-hook-revival.test.js` (13–16) FIRST. Run **only** those two files
(`node --test tests/gate-migration.test.js tests/gate-hook-revival.test.js`) and
record the RED output verbatim in the plan. Case 13 must fail by demonstrating the
real hazard — the legacy plan gets moved. Do not write implementation code in this
step.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Read IN FULL from disk, read-only: `src/hooks/human-gate-check.js`,
`src/scripts/ledger-backfill.js`, `src/lib/approval-ledger.js`,
`src/lib/menu-screens.js`, `src/lib/safe-fs.js`,
`tests/human-gate-check-coverage.test.js`, `src/commands/menu.md`, and
`plans/review/00008-r2f-gate-hook-revival.md`. Resolve the three open items the
blueprint defers: (a) how existing tests drive `main()`; (b) where `inbox escalations`
is routed, so `inbox migration` joins it; (c) whether `menu.md` carries the backfill
recipe. Confirm nothing enumerates `.ctoc/approvals/` with `readdirSync` in a way the
dot-prefixed marker would disturb (grep `ledgerDir` across `src/`). Record each answer
in the plan. Create no directories at runtime beyond `mkdirSync(recursive)` inside the
writers.

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
One step, files as sub-items, in dependency order:
- `src/lib/gate-migration.js` (CREATE)
- `src/hooks/human-gate-check.js` (MODIFY — partition + report + header)
- `src/scripts/ledger-backfill.js` (MODIFY — `--mark-migrated` / `--force`)
- `src/lib/menu-screens.js` (MODIFY — inbox count, door screen, route, export)
- `plans/review/00008-r2f-gate-hook-revival.md` (MODIFY — six superseded sections)

No stubs, no TODOs. Any ambiguity → a documented choice under
`## Decisions Taken Under Ambiguity`, appended to THIS file.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Enumerate every failure mode of the new path and confirm each fails toward REPORT:
marker absent, unreadable, corrupt, wrong-typed, partially written; notice
unwritable; `gate-migration` require failing. Confirm no path can revert MORE than
today. Confirm the dashboard renders byte-identically when `migrationPending === 0`.
Confirm the marker is unaddressable as a ledger slug. Re-verify the three-leg
not-a-gate-weakening argument holds against the shipped code.

### Step 12: OPTIMIZE
The hook is on the every-tool-call path. Confirm: `gate-migration` requires only
`path` + `safe-fs`; `isMigrated` is one `existsSync` + one small read;
`writePendingNotice` does zero writes in the steady state (compare-then-write);
`partitionViolations` is O(violations) with no allocation beyond the two arrays. No
new work is added to the migrated/clean path beyond a single `existsSync`.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Walk the Security Review checklist above against the shipped code. Additionally
verify by test or by reading the deny logic that an agent Edit/Write to
`.ctoc/approvals/.migration-complete.json` is BLOCKED, and that
`node src/scripts/ledger-backfill.js --mark-migrated` is NOT blocked by the Bash
ledger deny (it carries no ledger path operand). If the deny does block the script,
that is a real finding — report it, do not weaken the deny.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Run the **FULL** gate: `npm test` (which runs `src/scripts/test-gate.js`, enforcing
the `src/**`-scoped coverage floor of **99** from `.ctoc/coverage-baseline.json` and
the zero-skipped gate). `node --test tests/*.test.js` is **NOT** sufficient — it
bypasses both gates. Required: `# fail 0`, 0 skipped, coverage ≥ floor. Also run
lint. If the coverage floor moves, it may only RATCHET UP.

### Step 15: DOCUMENT
JSDoc on every exported function in `gate-migration.js`. Update the
`human-gate-check.js` module header (replacing the now-resolved "Migration
open-decision" block at `:41-50`) and the `ledger-backfill.js` header. Update
`CLAUDE.md` **only** if Step 9 confirms it states something now false about
`enforcement.mode` — and if so, correct it to say the setting has no reader today
rather than describing behavior that does not exist. Add the `--mark-migrated` line
to `src/commands/menu.md` if the backfill recipe lives there.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Verify every Quality Bar item. Report: the exact test output for cases 13–16, the
full `npm test` summary, the six superseded sections in the archived plan, and the
exact command a user runs to migrate. Confirm the plan crosses no gate and moves no
plan file.

---

## Acceptance Criteria Mapping

| Criterion | Implemented in | Test |
|---|---|---|
| An unmigrated project's unledgered `done/` plan is NOT moved | `gate-migration.partitionViolations` + `human-gate-check.main` | case 13 |
| …and IS reported | `writePendingNotice` + `main`'s banner | case 13 |
| The report is human-visible in the menu | `menu-screens` inbox count + `inboxMigrationScreen` | cases in the menu-screens suite; manual dashboard render |
| A migrated project behaves exactly as today | `partitionViolations(v, true)` returns all in `revert` | cases 6, 14, 17 |
| Enforcement unchanged where provenance exists | `WITHHELD_REASONS` scoped to `no-ledger-entry` | cases 7, 15, 16 |
| Undeterminable migration state → report | `isMigrated` strict `=== true`, all catches → `false` | cases 3, 4, 5 |
| The migration path is discoverable | door screen prints the exact command; `--mark-migrated` in USAGE | door-screen assertion |
| Idempotent | snapshot + compare-then-write; self-verifying marker | case 9 |
| The archive stops teaching the forgery shape | `00008` sections 1, 3, 4, 6 rewritten | reviewed at Step 16 |
| The archive stops mandating the deleted vision bypass | `00008` sections 2, 5 rewritten | reviewed at Step 16 |

## Risk Mitigations

| Risk | Mitigation | Where |
|---|---|---|
| The guard reads as "weakening a human gate" and is rejected at review | Three-leg argument stated explicitly and PROVEN by cases 7, 15, 16 | this plan + `human-gate-check.js` header |
| This repo loses enforcement (it has no marker; it was backfilled via `node -e`) | Run `--mark-migrated` here after the slice lands; it self-verifies the sweep is clean. If it is not clean, that is a REAL finding about this repo, reported, not forced | Step 16 |
| The notice file thrashes the disk on every tool call | Snapshot + compare-then-write; steady state writes zero bytes | `writePendingNotice`, Step 12 |
| The durable violation log floods with repeated withheld entries | Log withheld plans only when the pending set CHANGED | `main()` |
| An agent forges or deletes the marker | It lives in the agent-write-denied ledger directory (both Edit and Bash channels) | Step 13 |
| `--mark-migrated` is run prematurely and re-arms the bulk revert | Self-verifying against the live sweep; refuses while residents remain; `--force` is explicit and recorded | `markMigrated` |
| Requiring the hook from the script triggers the sweep | The hook is `require.main === module` guarded (`:533-535`) — verified | Step 9 |
| A dashboard test regresses | Zero pending adds zero output | Step 11 |

## Decisions Taken Under Ambiguity

1. **The opt-in is a marker file written by `ledger-backfill.js`, NOT an
   `enforcement.mode` setting.** The brief specified enforcement mode, but I verified
   no hook reads it — `PreToolUse.Task.js:26-28` states this and refuses to invent an
   unhonored knob for exactly this reason. Gating a safety-critical hook on an unread
   setting would ship a guard that never fires. The marker additionally lives in the
   agent-write-denied ledger directory, which a `settings.yaml` key does not
   (`plans/**` and `.ctoc/*` are edit-whitelisted), so it is strictly the safer
   mechanism. **This is a deviation from the brief and the human should confirm it.**
2. **Migration is a positive recorded fact, not a heuristic.** "The ledger has ≥1
   entry" was rejected: an installed project with 172 legacy `done/` plans that
   legitimately crosses one gate after the update would immediately arm the bulk
   revert — the exact hazard, one gate crossing later.
3. **`--vision` does not mark a project migrated.** It ledgers only vision archives;
   a project could run it and still hold 170 unledgered non-vision plans.
4. **The withheld set is scoped to `no-ledger-entry` alone**, not to all violations.
   This is what makes the change defensible as withholding a migration action rather
   than weakening a gate, and it is asserted by tests, not just documented.
5. **A `null`/missing reason is treated as `no-ledger-entry` (withheld).** `main()`
   already displays that default at `:451`; fail-safe agrees.
6. **The notice is a snapshot, not an append-only durable log** — unlike
   `gate-violations.json`. The hook fires on every tool call; an append would be
   unbounded. The durable log still records the withheld condition, rate-limited to
   real changes.
7. **This slice is at the upper bound of the ~1–3-file rule (4 source files + 1
   archived plan + 3 test files).** Splitting was rejected: shipping the hook guard
   without the menu reader would produce a report path with no reader — the exact
   defect R3-D fixed — and Lesson 16 requires reachability in the same unit of work.
   The hazard is not shippable in pieces.
8. **The archived plan `00008` is annotated SUPERSEDED, not deleted.** Deleting would
   erase the audit trail; annotating removes the instruction while keeping the record.

## Open question for the human (do not guess — Lesson 15)

**Decision 1 is a deviation from the brief's specified mechanism.** The brief said to
gate on `enforcement.mode`; I found that setting has no reader anywhere in `src/`,
and chose an agent-write-denied marker file instead. If the intent was specifically a
`settings.yaml` knob, this needs a second decision — whether to ALSO wire a real
`enforcement.mode` reader across the PreToolUse hooks, which is a materially larger
slice and would be its own plan. The marker mechanism is complete and shippable on its
own either way.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Wrote `tests/gate-migration.test.js` (cases 1-12) and cases 13-16 in
      `tests/gate-hook-revival.test.js` BEFORE any implementation existed.
- [x] Tested error conditions: corrupt marker, `migrated: false`, `migrated: "true"`,
      null reason, corrupt notice, unwritable notice, unreadable sweep.
- [x] Ran them and saw RED. Two pieces of red evidence were recorded:
      1. `node --test tests/gate-migration.test.js tests/gate-hook-revival.test.js`
         → `pass 0 / fail 2`, `Error: Cannot find module '../src/lib/gate-migration'`.
      2. That red only proves the module is absent, so THE HAZARD ITSELF was
         demonstrated against the SHIPPED code with a throwaway probe: a sandbox with
         `plans/done/legacy-plan.md` and no ledger entry, swept through the real
         `main()` in a child process. Output:
             done/legacy-plan.md still exists : false
             review/legacy-plan.md exists     : true
             byte-identical                   : false
         The archive was moved AND rewritten — exactly what case 13 forbids.

### Step 9: PREPARE
- [x] No new dependencies (the module requires only `path` + `safe-fs`).
- [x] Read in full, read-only: `human-gate-check.js`, `ledger-backfill.js`,
      `approval-ledger.js`, `menu-screens.js`, `safe-fs.js`,
      `human-gate-check-coverage.test.js`, `gate-hook-revival.test.js`, `00008`.
- [x] Resolved the three open items:
      (a) `main()` is driven by `spawnSync(process.execPath, ['-e',
          "require(<hook>).main();"], {cwd: sandbox})` — the technique in
          `human-gate-check-coverage.test.js:78`. REUSED verbatim; the hook's entry
          contract was NOT refactored.
      (b) `inbox escalations` is routed in `menu-screens.route()`'s `case 'inbox'`.
          `inbox migration` was added as the sibling case there.
      (c) `src/commands/menu.md` DOES carry the backfill recipe — but it is owned by
          a concurrently-running executor (00066-x9), so it was NOT edited. See
          Decision Z-3.
- [x] Confirmed by grep that NOTHING in `src/` or `tests/` enumerates the ledger
      directory with `readdirSync`, so the dot-prefixed marker disturbs no reader.
      (`ledger-backfill.countLedgerEntries`, added by this slice, is the first such
      reader and explicitly filters dot-files.)
- [x] No directories created at runtime beyond `mkdirSync(recursive)` inside writers.

### Step 10: IMPLEMENT
- [x] `src/lib/gate-migration.js` (CREATE) — `isMigrated`, `readMarker`,
      `writeMarker`, `partitionViolations`, `writePendingNotice`,
      `readPendingNotice`, `MIGRATION_COMMAND`, `WITHHELD_REASONS`.
- [x] `src/hooks/human-gate-check.js` (MODIFY) — partition before revert,
      `revertAll(toRevert)`, per-plan disposition line, report banner, durable
      `migration_pending` entries rate-limited to real changes, header rewritten.
- [x] `src/scripts/ledger-backfill.js` (MODIFY) — `--mark-migrated` / `--force`,
      self-verifying `markMigrated`, mutual exclusion, USAGE + header.
- [x] `src/lib/menu-screens.js` (MODIFY) — inbox count, `inboxMigrationScreen`,
      `inbox migration` route.
- [x] `plans/review/00008-r2f-gate-hook-revival.md` (MODIFY) — all six sections
      annotated SUPERSEDED; the runnable `node -e` forgery one-liner is GONE.
- [x] Error handling: every read fails safe toward "unmigrated / report";
      `writeMarker` is the only function allowed to throw (it runs in the CLI).
- [x] Wired: the hook is the registered `PreToolUse` root; the report is reachable
      by a human at `/ctoc:menu` → `inbox migration` in this same slice.

### Step 11: REVIEW
- [x] Every failure mode of the new path fails toward REPORT: marker absent,
      unreadable, corrupt, wrong-typed, an array, partially written, or
      `migrated !== true` → `isMigrated` returns `false`.
- [x] No path can revert MORE than today: `partitionViolations` only ever removes
      items from the revert set, and only when `migrated !== true`.
- [x] The dashboard is byte-identical when `migrationPending === 0` (asserted by
      `theDashboardSurfacesTheWithheldCount_andIsUnchangedWhenThereIsNone`).
- [x] The marker is unaddressable as a ledger slug (asserted against the real
      `ledger.ledgerPath`, which throws `Invalid slug` on a leading dot).
- [x] The three-leg not-a-gate-weakening argument holds against the SHIPPED code and
      is proven by tests 7, 15 and 16, not merely documented.

### Step 12: OPTIMIZE
- [x] `gate-migration.js` requires only `path` + `safe-fs` — no ledger, no settings,
      no YAML on the every-tool-call path.
- [x] `isMigrated` = one `existsSync` + one small `readFileSync`.
- [x] `writePendingNotice` writes ZERO bytes in the steady state (compare-then-write
      over a timestamp-free key), asserted by the snapshot test.
- [x] `partitionViolations` is O(violations) with no allocation beyond two arrays.

### Step 13: SECURE
- [x] Path traversal: every path is `path.join` from the caller's `projectPath`; no
      user string is interpolated into a path.
- [x] Input validation: `isMigrated` demands strict `=== true`.
- [x] No secrets: the marker and notice hold plan basenames, folders, reasons, timestamps.
- [x] Safe file operations: `safe-fs` throughout, atomic temp+rename for both writers.
- [x] Forgery resistance: verified by reading the deny logic — `PreToolUse.Edit.js:97`
      (`LEDGER_DIR = '.ctoc/approvals'`) denies the Edit/Write channel, and
      `PreToolUse.Bash.js:134-192` denies non-read-only Bash touches of that path.
      An agent can neither forge the marker (arming a bulk revert) nor delete it
      (disarming enforcement). `node src/scripts/ledger-backfill.js --mark-migrated`
      carries no ledger path operand and is NOT blocked — verified by running it
      against this repo, which reached the refusal message (so the script executed).
- [x] Control characters: every attacker-influenceable field in the door screen goes
      through `stripCtl`.
- [x] No `exec`/`execSync`/shell anywhere; `MIGRATION_COMMAND` is a displayed string.
- [x] Prototype pollution: `JSON.parse` + fixed property access, no merge.
- [x] Denial of service: bounded snapshot with compare-then-write.

### Step 14: VERIFY
- [x] Lint: `npx eslint` over all five changed source/test files — clean, no output.
- [x] Typecheck: my files contribute ZERO `tsc --checkJs` errors (the 7 they first
      introduced were fixed at the source by widening two JSDoc typedefs in
      `ledger-backfill.js`, never by a cast or a suppression).
- [x] FULL gate `npm test`: `[CTOC test-gate] coverage 99.05% (threshold 99%),
      skipped 0, failed 0` → `[CTOC test-gate] PASS`.
- [x] Coverage on the new module: `gate-migration.js 100.00%` lines, 100% functions.
      `ledger-backfill.js` 99.43%, `human-gate-check.js` 100.00%.
- [x] 0 skipped, 0 flaky.

### Step 15: DOCUMENT
- [x] JSDoc on every exported function in `gate-migration.js`.
- [x] `human-gate-check.js` module header: the resolved report-until-migrated state
      machine replaces the old "Migration open-decision" block.
- [x] `ledger-backfill.js` header + USAGE document the third mode.
- [x] `CLAUDE.md` / `README.md`: module and test-file counts corrected to live disk.
      The `enforcement.mode` documentation drift was deliberately NOT touched — see
      Decision Z-4.

### Step 16: FINAL-REVIEW
- [x] Steps 8-15 complete.
- [x] All quality checks passed.
- [x] Manual verification: ran `--mark-migrated --dry-run` against THIS repo. It
      REFUSED, reporting 37 un-ledgered `implementation/` residents (todo: 0,
      done: 0 — the 2026-07-14 backfill holds). Not forced: that is a REAL finding
      about this repository and a scheduling decision for the human. See Decision Z-5.
- [x] Crosses no gate; moves no plan file.
- [ ] Ready for human review (Gate 3).

## Decisions Taken Under Ambiguity (Z1 execution)

**Z-1. `inboxMigrationScreen` is NOT exported.** The plan said to export it
"alongside `inboxEscalationsScreen`" — but `inboxEscalationsScreen` is NOT exported;
`menu-screens.js:2140` carries an explicit note that exporting it solely so a test
could call it directly "would add a dead export on the very day the dead-export fence
shipped". The plan was stale on that fact. The new screen follows the real precedent:
reached through `route(['inbox','migration'])`, driven in tests the way a human
reaches it. This satisfies the export-reachability fence instead of fighting it.

**Z-2. Test-scope widened, deliberately and NOT silently.** Four test files outside
the plan's declared `files:` needed a one-line PRECONDITION, never a weakened
assertion. `tests/e2e-enforcement-and-gates.test.js` and
`tests/security-gate-bypass.test.js` drive `main()` against sandboxes holding
`no-ledger-entry` plans and assert the full revert; their `makeProject` factories now
write the migration marker, stating explicitly that they assert the ARMED,
post-migration enforcement. Every assertion in both files is unchanged and still
demands the revert. `tests/cache-freshness.test.js` received a WHITELIST entry (the
mechanism its own failure message prescribes: `gate-migration.js` writes only
`.ctoc/approvals/.migration-complete.json` and `.ctoc/logs/gate-migration-pending.json`,
never a counted plan/vision/inbox file; it is broad-flagged because its header PROSE
explains the hazard). `tests/readme-numbers.test.js` had hardcoded module-count pins
bumped to the live disk count. The alternative — rewording the module's own
documentation to dodge a regex heuristic — would have been gaming the guard.

**Z-3. `src/commands/menu.md` was NOT edited, by concurrency rule.** It carries the
backfill recipe and would naturally gain the `--mark-migrated` line, but a
concurrently-running executor (00066-x9) owns that file. Editing it would risk
clobbering in-flight work. The `--mark-migrated` mode is reachable without it: it is
in the script's own `--help`/USAGE, in the hook's stderr banner, and printed verbatim
on the `inbox migration` door screen. RECOMMEND adding the one-line recipe to
`menu.md` after 00066-x9 lands.

**Z-4. The `enforcement.mode` documentation drift was left alone.** The plan's Step 15
allowed correcting `CLAUDE.md` if it states something now false. It does — no code in
`src/` reads `enforcement.mode`. But `plans/implementation/00069-e1-enforcement-mode-honored-with-a-gate-floor.md`
now exists and proposes WIRING that setting for real. Rewriting the documentation to
say "it has no reader" while a plan to give it one is in flight would create churn and
a likely conflict. The drift is real and stays reported, not silently patched here.

**Z-5. `--mark-migrated` was NOT forced against this repository.** The command
self-verified and REFUSED: 37 plans in `plans/implementation/` have no ledger entry
(`todo: 0`, `done: 0`). Forcing would arm the sweep to revert all 37 to `functional/`.
Per this plan's own Risk Mitigations, an unclean sweep "is a REAL finding about this
repo, reported, not forced". This repository therefore ships in REPORT-ONLY mode for
`no-ledger-entry` until the human decides: ledger the 37, or accept the reverts. That
is a scheduling decision and it belongs to the human, not to this executor.

**Z-6. Both marker and notice are written atomically (temp + rename).** The plan
specified this for `writeMarker` only; the notice writer uses the same shape, because
it is rewritten on the every-tool-call path and a torn write would be read back as
corrupt (which fails open to `[]` and would silently drop the report).
