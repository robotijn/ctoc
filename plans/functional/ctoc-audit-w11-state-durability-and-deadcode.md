---
title: "W11 — State Durability and Dead-Code Removal"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
status: stub
depends_on: none
---

# W11 — State Durability and Dead-Code Removal

## Problem

CTOC's persistent state is written unsafely and its codebase carries dead, misleading
paths that make the map disagree with the territory:

- **Audit logs are racy and lossy.** `enforcement.json`, `gate-violations.json`, and
  `transition-log.json` are each a read-modify-write of a whole JSON array wrapped in
  `catch { log = [] }`. A truncated or concurrent write is caught and the entire
  enforcement / violation / transition history is silently discarded — the exact records
  that prove the gates fired. (M1, M14, M15)
- **The agent lock is check-then-act.** `startAgent` checks for a lock and then writes one
  with no `wx` (exclusive-create) flag, so two near-simultaneous `startAgent` calls both
  "acquire" the lock and two plans run concurrently — violating the sequential-plan rule. (M2)
- **`setSetting` erases config.** It round-trips the schema-only merged view and writes it
  back, so any non-schema category — the `deployment` and `sync` config blocks — is erased
  on the next settings write. (M16)
- **Queue reorder is a no-op.** Reordering sorts by birthtime and "swaps" two entries via
  `utimesSync`, which cannot change a file's birthtime — so the queue order never actually
  changes. (H10)
- **Dead and misleading code.** Three tab modules (`implementation`, `progress`, `todo`)
  have zero live mounts; seven exported agent-init functions have zero call sites; legacy
  tabs still carry one-keystroke, un-validated gate crossings; and a hooks-installer writes
  a git hook pointing at a non-existent `<root>/hooks/post-commit.js`. (B1, B2, B3, L7, L8, L9)

## Scope

- Make audit logs **atomic and append-only**: JSONL append (or temp-write-then-rename) with
  a corrupt-file quarantine instead of a silent `catch { log = [] }` that discards history.
- Replace the agent lock with a **`wx` exclusive-create lock carrying an owner token**, so a
  second concurrent `startAgent` fails to acquire rather than silently double-running.
- Make `setSetting` **read and write the raw sparse settings**, preserving non-schema
  categories (`deployment`, `sync`) instead of overwriting with the schema-only view.
- Give the queue a **real ordering key** — an explicit `queue_pos` field or a consistently
  mutable timestamp (`mtime`) — so reorder actually reorders.
- **Delete the dead code:** the 3 unmounted tab modules, the 7 uncalled agent-init exports,
  and the legacy tabs' one-keystroke un-validated gate crossings; fix or remove the
  hooks-installer's broken `post-commit.js` path. **Each deletion removes its own tests too**
  (per W6's truthful-tests principle — a test that only exercises dead code is a false green).

**Does NOT touch:** the enforcement-hook exit-code / block semantics (W1), the human-gate
provenance ledger or revert-loop isolation (W2), release/metadata sync (W9), or the menu
router and task-plane commands (W10). The gate crossings removed here are *legacy-tab
one-keystroke* crossings only — the real four human gates and their approval semantics are
W2's, and are strengthened, never weakened.

## Story Map

### Goal: CTOC's persistent state survives concurrency and crashes without losing history, and the codebase contains no dead or misleading paths.
- **Actor:** The CTOC maintainer relying on audit history, the sequential-plan lock, and
  saved settings; and any contributor reading the code to understand what runs.
- **Impact:** Audit history is never silently truncated, two plans never run at once, a
  settings save never erases config, the queue actually reorders, and every module/export
  in the tree is reachable — so the maintainer trusts the state and the code map.
- **Success metric:** All twelve findings (M1, M2, M14, M15, M16, H10, B1, B2, B3, L7, L8,
  L9) have a test that fails on current `main` and passes after the fix; grep for the deleted
  symbols returns zero references (code and tests).

### Activity 1: Persist audit records durably under concurrency
- `[MVP]` As a maintainer, I want each audit record appended atomically (JSONL append or
  temp+rename), so that a truncated or concurrent write never discards the existing history.
- As a maintainer, I want a corrupt log file quarantined rather than reset to `[]`, so that
  a bad file is preserved for inspection instead of silently wiping the record.

### Activity 2: Serialize plan execution and preserve config
- `[MVP]` As a maintainer, I want the agent lock created with `wx` and an owner token, so
  that a second concurrent `startAgent` fails to acquire and only one plan runs at a time.
- `[MVP]` As a maintainer, I want `setSetting` to preserve non-schema config blocks
  (`deployment`, `sync`), so that saving one setting never erases another category.
- As a maintainer, I want the queue to reorder via a real ordering key, so that moving an
  item actually changes the processing order.

### Activity 3: Remove dead and misleading code
- `[MVP]` As a contributor, I want the 3 unmounted tab modules and the 7 uncalled
  agent-init exports deleted along with their tests, so that the code map matches what runs.
- As a maintainer, I want the legacy tabs' one-keystroke un-validated gate crossings
  removed, so that no path crosses a gate without the real approval flow.
- As a maintainer, I want the hooks-installer's `post-commit.js` path fixed or removed, so
  that installation never writes a git hook pointing at a non-existent file.

## Rough acceptance criteria (Given/When/Then — each a behavior a test can DRIVE)

1. **Atomic audit append (M1, M14, M15).** Given an audit log with existing records, When a
   new record is written concurrently (or a write is interrupted mid-flight), Then all prior
   records survive and the new record is present — a test drives two overlapping writes and
   asserts no record loss.
2. **Corrupt-file quarantine (M1).** Given a truncated/corrupt log file, When a write occurs,
   Then the corrupt file is quarantined (renamed aside) and a fresh log continues — the test
   asserts the corrupt bytes are preserved, NOT silently replaced with `[]`.
3. **Exclusive agent lock (M2).** Given no active agent, When two `startAgent` calls race,
   Then exactly one acquires the `wx` lock (with its owner token) and the other fails to
   acquire — a test drives two near-simultaneous acquisitions and asserts a single winner.
4. **Config preserved on setSetting (M16).** Given settings containing `deployment` and
   `sync` blocks, When `setSetting` writes an unrelated schema key, Then `deployment` and
   `sync` are still present and unchanged on re-read.
5. **Queue actually reorders (H10).** Given a queue of three items, When an item is moved,
   Then reading the queue back returns the new order — a test asserts the order changed
   (birthtime-based no-op would fail this).
6. **Dead code gone (B1, B2, B3).** Given the checkout after the fix, When the test greps
   for the 3 tab modules and 7 agent-init exports, Then there are zero references in `src/`
   AND zero tests exercising them — deletion and its test-removal verified together.
7. **No legacy one-keystroke gate crossing (L7, L8).** Given a legacy tab, When a
   gate-crossing keystroke is attempted, Then no un-validated crossing occurs — a test
   asserts the legacy one-keystroke path is gone.
8. **Installer path valid (L9).** Given the hooks-installer runs, When it writes a git hook,
   Then the referenced hook file exists (or the hook write is removed) — a test asserts the
   installed hook points at a real file.

## Findings addressed

M1, M2, M14, M15, M16, H10, B1, B2, B3, L7, L8, L9.

## INVEST status (per story)

| Story | I | N | V | E | S | T | Notes |
|-------|---|---|---|---|---|---|-------|
| atomic append (M1/M14/M15) | Y | Y | Y | Y | Y | Y | Foundation for log durability; independently valuable. |
| corrupt-file quarantine (M1) | ~ | Y | Y | Y | Y | Y | Builds on the atomic-append story; small addition. |
| `wx` agent lock (M2) | Y | Y | Y | Y | Y | Y | Independent; concurrency test drives it. |
| preserve config on setSetting (M16) | Y | Y | Y | Y | Y | Y | Independent; small round-trip fix. |
| queue ordering key (H10) | Y | Y | Y | Y | Y | Y | Independent; ordering test drives it. |
| delete dead tabs + exports (B1/B2/B3) | Y | Y | Y | Y | Y | Y | Independent; verified by grep + test-removal. |
| remove legacy gate crossings (L7/L8) | Y | Y | Y | Y | Y | Y | Independent; strengthens, never weakens, the real gates. |
| fix installer path (L9) | Y | Y | Y | Y | Y | Y | Independent; installer test drives it. |

All stories are Small (≤3 days) and Testable. Only the corrupt-file quarantine story depends
on the atomic-append foundation (dependency depth 2, within the ≤3 limit). No circular
dependencies. Each story is a vertical slice delivering an observable behavior change.

## Decisions Taken Under Ambiguity

- **No canvas / no Business Model Canvas (N/A).** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation vision;
  a Business Model Canvas is not applicable. Proceeded with vision-only extraction rather
  than kicking back.
- **JSONL vs temp+rename for logs.** The vision offers both ("atomic append-only JSONL
  logs (or temp+rename with corrupt-file quarantine)"). Left the exact mechanism to the
  Product Owner / implementation planner — both satisfy the acceptance criteria (no record
  loss, corrupt-file preserved). Did not pick one to avoid over-specifying the "how" (INVEST
  Negotiable).
- **Queue ordering key: `queue_pos` vs `mtime`.** The vision names both options. Kept the
  story at the behavior level ("reorder actually reorders") so either key satisfies it; the
  implementation planner chooses. `queue_pos` is the more explicit and less filesystem-
  dependent option and is the likely recommendation, but that is a technical detail, not a
  stub-level decision.
- **Dead-code test removal is in scope here.** The launch brief notes W6 owns the
  truthful-tests principle, but deleting a module while leaving its test behind creates a
  false green (or a broken build). So each deletion story explicitly removes its own tests;
  this does not overlap W6, which owns the *cross-file invariant* tests, not these specific
  dead-code tests.
