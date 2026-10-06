---
iron_loop_verdict: true
iron_loop: true
title: "Finished plans are not sent back after an update"
type: functional
status: functional
created: 2026-10-06
priority: high
effort: medium
depends_on: none
files:
  - src/lib/approval-ledger.js
  - src/lib/approval-residency.js
  - src/lib/gate-migration.js
  - src/hooks/human-gate-check.js
  - tests/approval-method-change.test.js
  - tests/fixtures/approval-method-change/**
  - CLAUDE.md
revision: 2
rejection_reason: "Parked: no path outside the hidden hooks sends plans back (runtime check on a 470-plan copy, 31 comm"
tag: rejected
---
# REVISION 2

## Rejection Feedback

Parked: no path outside the hidden hooks sends plans back (runtime check on a 470-plan copy, 31 commands, 3 versions); needed only before the hooks are ever turned on.

---

# REVISION 1

## Rejection Feedback

Parked: no path outside the hidden hooks sends plans back (runtime check on a 470-plan copy, 31 commands, 3 versions); needed only before the hooks are ever turned on.

---


# Finished plans are not sent back after an update

## Problem Statement

The owner, 2026-10-06: "fix now". Since CTOC 6.14.60, the gate check sends approved plans
back the first time it runs after an update. It hits every plan that has a
`## Deferred Questions` section and whose approval was recorded by 6.12.92 to 6.14.59:
- finished plans go from `done/` to `review/`;
- plans waiting to be built go from `todo/` to `implementation/`, then on to `functional/`.

Version 6.14.60 added that section to the sections the approval fingerprint leaves out. So
an unchanged plan now gets a different fingerprint, and the check reads the difference as an
edit made after approval. On a copy of a real 470-plan project, one run of the check moved
136 plans, 131 of them for this reason alone. The owner would lose his record of finished
work and have to approve 131 plans again.

The gate check is registered to run before every tool call, but Claude Code does not load
CTOC's hooks today (claim 14). So in users' sessions it has not been running. Whether any
user has already been hit depends on whether a path outside the hooks does the same sweep;
Step 9 answers that by running it. Either way this fix must land before the hooks are turned
on, or the first gate check in every upgraded project sends approved plans back.

Fixed means three things:
- an approval recorded under the older method still matches;
- every new approval records which method made its fingerprint, so the next change to the
  list cannot repeat this;
- plans already sent back are returned to `done/` or `todo/` once, automatically, and only
  when the approval record proves they are unchanged.

## Scope

This plan changes the approval ledger, one comment in the residency check, the migration-state
module and the gate-check hook. It adds one test file with its captured fixtures and changes
two parts of `CLAUDE.md`. `src/lib/approval-ledger.js`, `src/lib/approval-residency.js` and
`src/hooks/**` are on CTOC's protected list (`src/lib/protected-paths.js`). The edit hook
therefore refuses them unless the owner's own click approves this plan to be built.

It does not change `src/scripts/ledger-backfill.js`: that script writes through
`backfillEntry` → `writeEntry` → `resolveHash`, so it gains the stamp with no edit of its
own (claim 12). It does not change which violation reasons are held back
(`gate-migration.WITHHELD_REASONS`), and it does not change the format of the gate-violations
log. The benchmark result goes to `.ctoc/audit/speed-and-size/benchmarks/`, which is audit
output the edit hook already allows, so it is not in `files:`. Turning the hooks on is a
separate plan (`plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`), which
must build after this one.

Written by the implementation planner on 2026-10-06. I hold no shell, so I ran nothing.
Claims carry one of four labels:
- **read**: I read the code that does it.
- **audit**: measured by running in the earlier investigation,
  `.ctoc/audit/speed-and-size/plans-revert-after-update.md`, and not re-run here.
- **coordinator**: stated as verified by the coordinator; not checked by me beyond what is
  noted.
- **to verify**: Step 9 or Step 14 runs it.

## What was verified

1. **6.14.60 added the seventh row.** **Read** in `src/lib/approval-ledger.js`, lines
   298-317: `EXECUTION_SECTION_PRODUCERS` gains `deferred questions`, with a comment dated
   2026-09-03 (plan 00255). Line 549 of the git reference log `.git/logs/HEAD` records commit
   `cf2e1348`, "… the exempt table gains its seventh row by the human's ruling (v6.14.60)",
   and its parent `4a1373d0` is v6.14.59. The audit names the same change `df8ab9b4`, after a
   later history rewrite. That hash does not appear in the reference log; **to verify** at
   Step 9.
2. **Before that change the list had six rows.** **Read** in two places:
   - the table's comment at line 287 says the rows are unchanged "from the six bare strings
     this replaced";
   - the parent index of plan 00255,
     `plans/implementation/the-done-gate-reads-the-record-the-executor-wrote.md` (dated
     2026-09-01), quotes exactly those six.

   That the list stayed the same from 6.12.92 through 6.14.59: **audit** (a comparison
   across five versions), and **to verify** at Step 9.
3. **No method version is recorded.** **Read:** `resolveHash` (line 643) returns only
   `content_sha256` and `hash_scope`. The record literals in `writeEntry` (701),
   `writePipelineEntry` (737) and `writeSufficiencyEntry` (790) hold nothing else about the
   method.
4. **No migration ever shipped.** **Read:** the comment at 305-315 says the 35 moved
   fingerprints were re-recorded "on this repository".
   - Every writer records the bytes in front of it: the five writer functions, called from
     `actions.stampAndLedger`, `streaming-gate`, `stale-cleanup`, `vision-decomposer` and
     `ledger-backfill.js`.
   - Only the human-run `ledger-backfill.js --plan` re-records an entry.
   - So that comment's "no plan is left holding a digest under the old semantics" is true
     only of CTOC's own repository.
5. **How the move happens when the check runs.** **Read:**
   - `.claude-plugin/hooks.json` registers `human-gate-check.js` before every tool call
     (matcher `*`). Whether Claude Code loads that file is claim 14.
   - Its `main()` calls `checkFolder`, then `approval-residency.classifyResidency`, then
     `ledger.contentMatches`. That last call hashes with today's list only (line 610), and
     a difference is reported as `hash-mismatch`.
   - `gate-migration.partitionViolations` holds back only `no-ledger-entry`, so
     `revertAll` runs.
   - `revertPlan` appends a violation note and moves the plan to the gate's source folder.
6. **`contentMatches` is the only comparison.** **Read:** its two callers are `verify`
   (line 1115) and `classifyResidency`. A text search for `computeSpecHash`,
   `contentMatches` and `diagnoseSpecMismatch` across `src/` found no other comparator, and
   every hit was read in context.
7. **The fallback opens no way to fake an approval**, by reading `computeSpecHashWith`
   (427-504). It leaves out a section from its heading up to the next heading of the same or
   a higher level. Take the older list, which is a subset of today's, and compare the two
   passes line by line. Whenever the older list is leaving a line out, today's list is too,
   at a level no deeper:
   - an older-method section ends only at a heading that also ends today's;
   - every heading that starts an older-method section also starts, or sits inside, one of
     today's.

   So, for any file, the lines today's method keeps are a subset of the lines the older
   method keeps. Both methods hash the frontmatter, including `files:`, the same way. That
   gives two results:
   - **Older entries.** A match under the older method requires every line that today's
     method protects to equal the approved bytes.
   - **Unstamped entries written by 6.14.60 or later.** These hold a fingerprint made with
     today's method. Content can match such a fingerprint under the older method only if its
     older-method lines equal the approved today-method lines. Those lines hold no live
     Deferred Questions heading, so the content has none either. Its today-method
     fingerprint is then the same, and it would already match without the fallback.

   The fallback therefore accepts nothing that today's check does not already accept. Step 8
   checks both results by running (test 5).
8. **What the 136 moves were.** All four points below are **audit**:
   - 131 match the 6.14.59 method exactly and never today's;
   - 5 were changed after approval;
   - 1 is a duplicate plan;
   - one run of today's hook, started directly on a copy, moved 136 and printed "Revert
     sweep INCOMPLETE" for the duplicate.

Findings that change the brief:

9. **The log can neither show the reason nor keep the lines.** **Read:**
   - The hook's log entry (`human-gate-check.js` lines 395-403) records only the plan,
     "Moved to done/ without approval", "REVERTED to review/" and a status. It does not
     record the reason.
   - `logViolation` keeps the last 100 lines (`durable-log.appendEntry` with
     `maxEntries: 100`, lines 231-234).
   - One sweep logged 136 reverts (**audit**), so 36 lines were dropped at once.
   - The duplicate plan's revert is refused by the collision guard, so it adds one "REVERT
     FAILED" line on every later run of the check. Within about 100 runs every revert line
     is gone.

   The restore therefore takes its evidence from the plan file and the ledger.
   `revertPlan` appends a fixed note naming both folders (line 315), and the ledger proves
   that the bytes under the note are what the owner approved. See Decision 1.
10. **Plans in the build queue are sent back twice.** **Read:**
    - A plan approved into `todo/` by those versions also carries the section, because
      `appendDeferredQuestions` runs before `stampAndLedger` takes the fingerprint (comment
      at lines 305-309).
    - It reverts to `implementation/` for `hash-mismatch`.
    - On the next run, its `todo` entry no longer fits `implementation/`. That gives
      `wrong-edge`, which is not held back.
    - So it moves on to `functional/` with a second note.

    The audit's copy had none of these. The restore returns them too (Decision 3).
11. **No migration runs at session start.** **Read:**
    - `src/hooks/SessionStart.js` runs no migration. Its one job that is needed only once,
      the plan-index rebuild, is handed to a detached process.
    - The approval-ledger migration state lives in `src/lib/gate-migration.js`. The gate
      check calls it on every run.
    - Beside it is the human-run `ledger-backfill.js --mark-migrated`.

    The restore goes into `gate-migration.js`. See Decision 2.
12. **`ledger-backfill.js` needs no edit.** **Read:** `--plan --hash-scope specification`
    calls `backfillEntry` → `writeEntry` → `resolveHash`. Stamping in `resolveHash` therefore
    stamps the script's entries too, and test 4 drives the script to prove it.
13. **The shared benchmark harness is not on disk yet.** **Read:** nothing exists under
    `.ctoc/audit/speed-and-size/benchmarks/` on 2026-10-06. The coordinator describes it as
    `bench.js`, which takes `--before` and `--after` trees and a label, and appends to
    `results.json` and `RESULTS.md`. Its flags are **to verify** at Step 9.
14. **Claude Code does not load CTOC's hooks today.** **Coordinator:** the plugin
    documentation loads hooks only from `hooks/hooks.json` at the plugin root or from a
    `hooks` field in the manifest. **Read**, in support:
    - `.claude-plugin/plugin.json` contains no `hooks` field (an exact search for the
      string `hooks` in that file finds nothing);
    - no `hooks/hooks.json` exists at the repository root.

    The loading rule itself I did not check. Consequences:
    - in users' sessions neither the gate check nor session start has been running;
    - whether any user was already hit depends on a path outside the hooks that sweeps and
      reverts plans.

    By reading, two candidates outside the hooks exist, but neither settles it:
    - `iron-loop-enforcer.checkGateDestinationsApproved` reports offenders and moves
      nothing;
    - `stale-cleanup.revertPlan` moves a plan only when the human picks a cleanup action.

    The answer comes from running them (Step 9), not from reading. The restore stays in
    scope either way, because it costs nothing where nobody was hit. Its live call site is
    the gate check, so it runs before the first sweep the moment the hooks are turned on
    (Decision 9).

## Implementation Details

### `src/lib/approval-ledger.js`

1. **The method tables**, beside `EXECUTION_SECTIONS`:

   ```js
   // The excluded-section list used from 6.12.92 to 6.14.59: the six rows before
   // `deferred questions` joined at 6.14.60. FROZEN: approvals in users' projects were
   // fingerprinted with it, and an entry is never re-hashed.
   const SPEC_SECTIONS_V1 = Object.freeze([
     'execution record', 'execution log', 'step 16 final-review report',
     'decisions taken during execution', 'verification evidence',
     'decisions taken under ambiguity',
   ]);
   const CURRENT_SPEC_VERSION = 2;
   const SPEC_METHODS = new Map([[1, SPEC_SECTIONS_V1], [CURRENT_SPEC_VERSION, EXECUTION_SECTIONS]]);
   ```

   A rule goes into the comment above `EXECUTION_SECTION_PRODUCERS`: **a new row is a new
   method.** To add one:
   - freeze today's list as `SPEC_SECTIONS_V2`;
   - map it in `SPEC_METHODS`;
   - raise `CURRENT_SPEC_VERSION`;
   - never edit a frozen list.

   The comment at 305-315 is corrected to say that the 2026-09-03 re-record covered this
   repository only, and that the method table is the shipped migration.
2. **The section list becomes a parameter.** The two signatures become
   `isExecutionHeading(title, sections = EXECUTION_SECTIONS)` and
   `computeSpecHashWith(content, extraExcluded, sections = EXECUTION_SECTIONS)`, and the walk
   passes `sections` through. With the defaults, `computeSpecHash` and
   `diagnoseSpecMismatch` produce the same bytes as today, and the golden digest in
   `tests/source-stays-searchable.test.js` does not move.
3. **The stamp.**
   - `resolveHash`'s specification branch returns `spec_version: CURRENT_SPEC_VERSION` as
     well.
   - The whole-file branch is unchanged, because a whole-file fingerprint has only one
     method.
   - The three record literals add `spec_version`, directly after `hash_scope`, when it is
     present.
   - Nothing else needs a change: `backfillEntry` and `writeVisionArchiveEntry` reach those
     literals, and the override merge in `stampAndLedger` spreads the stored record (read).
4. **`contentMatches`, specification branch:**

   ```js
   const stamped = Object.prototype.hasOwnProperty.call(entry, 'spec_version');
   const versions = stamped ? [entry.spec_version] : [CURRENT_SPEC_VERSION, 1];
   for (const v of versions) {
     const sections = Number.isInteger(v) ? SPEC_METHODS.get(v) : undefined;
     if (!sections) return { match: false, scope, reason: 'spec-method-unknown', sections: [] };
     const res = computeSpecHashWith(content, null, sections);
     if (!res.ok) break;
     if (entry.content_sha256 === res.hash) return { match: true, scope, reason: null, sections: [] };
   }
   ```

   After the loop, the existing diagnosis runs unchanged, and the return shape does not
   change. Today's method is tried first:
   - an entry that matches today costs one pass, as it does now;
   - only a mismatch on an unstamped entry costs a second pass.

   `CURRENT_SPEC_VERSION` is not exported, because no caller outside this file needs it yet.

### `src/lib/approval-residency.js`

A comment change only: the list of reasons on `classifyResidency` gains
`spec-method-unknown`. That reason means an entry stamped with a method this code does not
know, and it rejects.

### `src/lib/gate-migration.js`: the one-time restore

`restoreMethodChangeReverts(projectPath)` returns
`{ ran, restored: Array<{plan, to}>, left: Array<{plan, reason}> }` and never throws. It
loads `approval-ledger`, `approval-residency` and `actions` lazily, inside the function, so
the module's cost on every run of the check stays at one existence check, as its header
requires.

1. **Guard.** `.ctoc/approvals/` must exist, and so must at least one of `plans/review/`,
   `plans/implementation/` and `plans/functional/`. Otherwise the function returns and
   writes nothing: a directory with no ledger cannot have been hit, and writing into it
   would make a `.ctoc/` folder nobody asked for.
2. **Lock and once-only marker**, `.ctoc/approvals/.method-change-restore.json`. It sits in
   the folder agents cannot write to, beside `.migration-complete.json`, and its leading dot
   means no plan slug can address it.
   - A marker with status `complete` means the function returns.
   - With no marker, it writes one exclusively (`{ flag: 'wx' }`; read: `safe-fs` passes
     the options through) with status `running`.
   - A `running` marker older than five minutes is renamed aside, so only one process wins,
     and then written exclusively.
   - In every other case the function returns.

   The lock exists because parallel tool calls run the gate check at the same time.
3. **Candidates and their destinations.** A candidate is a plan whose bytes end with the
   notes `revertPlan` writes, in this order. The notes are stripped from the end, one at a
   time:

   | Folder | Notes at the end, oldest first | Destination |
   |---|---|---|
   | `plans/review/` | one or more done → review | `done/` |
   | `plans/implementation/` | todo → implementation | `todo/` |
   | `plans/functional/` | todo → implementation, then implementation → functional | `todo/` |

   Each note is matched by one literal pattern, anchored at the end; there are three, all
   built on this one:

   ```js
   const DONE_TO_REVIEW_NOTE = /\r?\n\r?\n---\r?\n\*\*⚠️ HUMAN GATE VIOLATION\*\*\r?\nThis plan was moved to done\/ without human approval\.\r?\nAutomatically reverted to review\/ at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\r?\n---\r?\n$/;
   // TODO_TO_IMPLEMENTATION_NOTE and IMPLEMENTATION_TO_FUNCTIONAL_NOTE: the same, with
   // the folder names `todo/` → `implementation/` and `implementation/` → `functional/`.
   ```

   A plan in `functional/` that carries only the implementation → functional note is not a
   candidate: it was not sent back from `todo/`.
4. **The test for each candidate.** `D` is its destination, `done` or `todo`. Each
   candidate runs in its own `try`. It is returned only if every condition below holds;
   otherwise it stays where it is, with the first reason that failed:

   | Condition | Reason when it fails |
   |---|---|
   | no plan of the same name in `D/` | `already-in-destination` |
   | `readEntryResult` is `ok` | `no-ledger-entry` or `ledger-unreadable` |
   | the entry's `stage_to` is `D` | `wrong-entry` |
   | the entry has `hash_scope: 'specification'` and no `spec_version` | `not-this-defect` |
   | on the stripped bytes, `contentMatches({ ...entry, spec_version: 1 })` matches and `contentMatches({ ...entry, spec_version: 2 })` does not | `changed-after-approval` if neither matches, `not-this-defect` if today's does |
   | `classifyResidency(planPath, D, root, stripped).accepted` | `not-accepted` |
   | a failure while reading or moving | `read-failed` or `move-failed` |

   The last rule but one hands the decision on entry kind and evidence to the one residency
   predicate, so there is no second encoding of approval. That predicate already accepts
   only human, backfilled or sufficiency entries in `todo/`.
5. **The move.**
   - Write the stripped bytes over the plan file (temporary file, then rename).
   - Call `actions.movePlan(planPath, D, root)`.
   - If the move throws, write the original bytes back and record `move-failed`.
   - Set the file's modified time to the entry's `approved_at` with `safeFs.utimesSync`.
     Otherwise the "while you were away" feed, which reads modified times, would report the
     returned plans as newly shipped.

   The stripped bytes are exactly the bytes from before the first revert: `revertPlan` only
   appended to them.
6. **Every candidate is logged:** one line each in `.ctoc/logs/approval-method-restore.json`,
   written through `durable-log.appendEntry` with no cap. Each line is
   `{ at, plan, from, to, outcome: 'restored' | 'left', reason }`. It carries the plan's base
   name, folder names and a fixed reason, never an error message, which can carry paths. The
   log is uncapped because the gate-violations log keeps only 100 lines.
7. **Finish.**
   - The marker becomes `{ status: 'complete', at, restored, left }` (temporary file, then
     rename).
   - If any `move-failed` occurred, the marker is removed instead, so the next run retries.
     The conditions above make a second run move nothing twice.

   The module header gains a section that describes the restore.

### `src/hooks/human-gate-check.js`

In `main()`, before the folder sweep, add
`const restore = gateMigration.restoreMethodChangeReverts(projectPath);`. Running before the
sweep means the sweep already sees the returned plans, and a plan in `implementation/` is
returned to `todo/` before the sweep could push it on to `functional/`. When the restore
returned or left anything, the hook does two things:
- it adds one line to the gate-violations log through the existing `logViolation`, with
  status `restored`;
- it prints this to standard error:

  ```
  CTOC returned N finished plan(s) to done/ and M approved plan(s) to todo/. Version
  6.14.60 had moved them back by mistake: their approval was recorded with an older
  fingerprint method. K plan(s) stay where they are because they changed after you
  approved them. Every plan is listed in .ctoc/logs/approval-method-restore.json.
  ```

The header gains a paragraph on the one-time restore.

### `CLAUDE.md`

1. A new paragraph, after "Only approved plans grant write access", titled "The approval
   fingerprint carries its method version". It says:
   - what the fingerprint covers;
   - that `spec_version` is stamped on every new entry;
   - that an unstamped entry matches under today's method or the method of 6.12.92 to
     6.14.59;
   - that a new excluded section means a new method version, pinned by a test;
   - that a one-time restore returns plans to `done/` and `todo/`, and where its record is
     kept.
2. The two test-file counts each go up by one, for the new test file.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| `contentMatches` with method versions | `verify`; `approval-residency.classifyResidency` | the gate-check hook; the write-permission check in `PreToolUse.Edit.js` and `PreToolUse.Bash.js`; `iron-loop-enforcer.checkGateDestinationsApproved` |
| `spec_version` stamp | `resolveHash`, from `writeEntry`, `writeSufficiencyEntry`, `backfillEntry` | approving a plan in `/ctoc:start` (`approvePlan` → `stampAndLedger`); `streaming-gate`; `ledger-backfill.js` (a `start.md` recipe) |
| `restoreMethodChangeReverts` | `main()` in `src/hooks/human-gate-check.js` | the gate-check hook registered in `.claude-plugin/hooks.json`, which Claude Code does not load today (claim 14); it becomes live when the hooks plan lands |

The hooks are registered but not loaded, so every hook root above runs today only when
started directly, as the tests and Step 14 do. No new source file and no new export besides
`restoreMethodChangeReverts`.

## Test plan (Step 8, written first)

One new file, `tests/approval-method-change.test.js`. Its fixtures are captured at Step 9
from this repository's own history, byte for byte, in the golden-corpus style, into
`tests/fixtures/approval-method-change/`. There are two real pairs, each a plan carrying
`## Deferred Questions` and its specification-scope entry as a version from 6.12.92 to
6.14.59 recorded it:
- a `done` pair;
- a `todo` pair;
- plus a `manifest.yaml` naming the commit and the source paths of each file.

Derived variants (one edited line, a changed `stage_to`) are made inside the tests and
labelled as derived. Every case builds a temporary project. "The real hook" means
`src/hooks/human-gate-check.js` started as a child process from that project.

1. **An unstamped older entry does not revert.** Each captured plan sits in its destination
   with its entry.
   - `verify` returns true.
   - `checkFolder` is empty for that folder.
   - The real hook leaves the plan where it is, byte-identical.

   Red today.
2. **A genuinely changed plan still reverts.** As above, with one specification line changed:
   once a `files:` entry, once a line of Scope prose. `checkFolder` reports `hash-mismatch`,
   and the real hook moves the plan back. **Green today by design.** This test guards that
   the fix does not accept too much, so it cannot be red first.
3. **A stamped entry is checked only under its own method.**
   - `{ ...captured, spec_version: 1 }` matches. Red today: the stamp is ignored and today's
     method is used.
   - `{ ...captured, spec_version: 2 }` does not match.
   - `spec_version` set to `3`, `'2'` or `null` gives no match and the reason
     `spec-method-unknown`. Red today: the reason is `hash-mismatch`.
4. **New entries are stamped.** Each of these carries `spec_version: 2`:
   - `writeEntry` given `content`;
   - `writeSufficiencyEntry` given `content`;
   - `require('../src/scripts/ledger-backfill').run(['--plan', p, '--stage', 'todo', '--hash-scope', 'specification', '--root', tmp])`.

   `--hash-scope file`, and `writePipelineEntry` given only `content_sha256`, carry no
   stamp. Red today.
5. **No way to fake an approval, by running.** The variants of each captured plan are:
   - each line deleted;
   - each line replaced;
   - each heading moved one level up, and one level down;
   - a `## Scope` heading plus one line inserted after each line.

   For every variant, two properties must hold:
   - if it matches the captured older fingerprint under the older method, it also matches,
     under today's method, today's fingerprint of the original;
   - for an unstamped entry that holds today's fingerprint of the original, a match under
     the older method implies a match under today's method.

   The expected count of counterexamples is zero. The two properties must not pass vacuously,
   so two things must match the captured fingerprint under the older method:
   - the unchanged plan;
   - every variant that only changes a line inside an excluded execution section.

   Today the older method is never used, so that check is red. If a counterexample ever
   appears, it is a way to fake an approval: the build stops and goes back to the owner.
6. **The next change cannot repeat this.** `ledger.EXECUTION_SECTIONS` deep-equals the seven
   literal headings. The failure message reads: "changing this list changes the fingerprint
   of every plan that has the section; freeze the current list as a new method version in
   approval-ledger.js instead". It passes today, because it is a pin.
7. **The restore moves exactly the right plans.** The damage is produced with the real
   `revertPlan`, exported from the hook, in a temporary project with `.ctoc/approvals/`:

   | Plan | Expected outcome |
   |---|---|
   | (a) the captured `done` plan, in `review/` | returned to `done/` |
   | (b) a changed copy, under its own name, with a copy of the entry | left: `changed-after-approval` |
   | (c) a copy in `review/` whose entry has `stage_to: todo` | left: `wrong-entry` |
   | (d) a copy whose name is already in `done/` | left: `already-in-destination` |
   | (e) a copy whose entry is stamped | left: `not-this-defect` |
   | (f) a plan in `review/` with no note | not a candidate, not logged |
   | (g) the captured `done` plan reverted twice, under another name | returned to `done/` |
   | (h) the captured `todo` plan, reverted once, in `implementation/` | returned to `todo/` |
   | (i) the captured `todo` plan, reverted twice, in `functional/`, under another name | returned to `todo/` |
   | (j) a plan in `functional/` with only the implementation → functional note | not a candidate, not logged |

   Plans (a), (g), (h) and (i) must end byte-identical to the bytes before the first revert,
   with their modified time equal to `approved_at`. Every other plan is left untouched, byte
   for byte. The restore log holds exactly one line per candidate, with these outcomes, and
   the marker reads `complete`. Red today.
8. **It runs once and changes nothing the second time.**
   - A second call returns `ran: false` and writes nothing.
   - With the marker deleted, a third call moves nothing and logs the same "left" lines.
9. **No ledger, no write.** A directory with `plans/review/` but no `.ctoc/` ends with
   nothing written.
10. **The lock holds.**
    - A `running` marker with a fresh modified time: the restore returns `ran: false` and
      moves nothing.
    - A `running` marker whose modified time is set ten minutes back: the restore runs.
11. **The real hook on a damaged project.** In the temporary project from test 7:
    - the first run returns (a), (g), (h) and (i), prints the notice and adds one `restored`
      line to the gate-violations log;
    - (h) is in `todo/` after that run, not pushed on to `functional/`;
    - a second run prints nothing about the restore.

## Security review

- **No new way to fake an approval.** Claim 7 explains why, and test 5 checks it. A method
  this code does not know never matches.
- **The restore writes no ledger entry.** It moves a plan only into `done/` or `todo/`, and
  only when the one residency predicate accepts it there. The ledger, which agents cannot
  write, is what decides. The notes are used only to find which bytes to strip.
- **The marker sits in the folder agents cannot write to.** An agent can neither write a
  fake "complete" marker to suppress the restore nor delete the marker to make it run again.
  Running again would be harmless anyway.
- **The patterns are safe.** They are literal and anchored at the end of the file, with no
  nested repetition, and they match bytes the hook itself wrote.
- **The logs hold no paths.** They record base names, folder names and fixed reasons, never
  error text.
- **The committed benchmark record holds no project name, path or user name.** It goes into
  a public repository.
- **No new process, no shell and no network.**

## Acceptance Criteria

1. An approval recorded by 6.12.92 to 6.14.59, for an unchanged plan with a Deferred
   Questions section, is accepted in `done/` and in `todo/` by `verify`, by
   `classifyResidency` and by the write-permission check.
2. A plan changed after approval still reverts with `hash-mismatch`, whichever method
   recorded its approval.
3. Every specification entry written from now on carries `spec_version: 2`. That includes
   entries written through `ledger-backfill.js`. A stamped entry is checked only under its
   own method, and an unknown method never matches.
4. The test of every variant (test 5) finds zero counterexamples and passes its check that
   the properties are not vacuous.
5. Changing the excluded-section list fails a test that names the remedy: add a new method
   version.
6. The restore returns exactly the plans that meet all its conditions: from `review/` to
   `done/`, and from `implementation/` or `functional/` to `todo/`. A second run moves
   nothing. Every candidate is logged with its outcome. A directory without
   `.ctoc/approvals/` gets nothing written.
7. **On a fresh copy of a real 470-plan project**, one run of the fixed hook marks 6 plans for
   revert, where today's hook marks 137. It moves 5, where today's moves 136; the duplicate is
   refused by the existing collision guard both times. `done/` goes from 309 to 304, not to
   173.
8. **On a copy first damaged by today's hook**, one run of the fixed hook returns 131 plans
   to `done/`. Afterwards:
   - `done/` and `review/` hold the same file names as the copy in criterion 7;
   - every returned plan is byte-identical to its twin in that copy;
   - a second run moves nothing.
9. **Step 9's runtime check has an answer, recorded in two places:** the Execution Record
   and `RESULTS.md`. The answer says whether running `/ctoc:start`'s command and the other
   slash-command paths on a copy of the real project moves any plan, and if so, which path
   and which plans.
10. The golden digest in `tests/source-stays-searchable.test.js` is unchanged. `npm test`
    passes with fail 0, skipped 0, and coverage at or above the enforced floor.
11. `CLAUDE.md` describes the method version and the restore.
12. **The improvement and its quality are measured and stored.** `RESULTS.md` and
    `results.json` under `.ctoc/audit/speed-and-size/benchmarks/` hold a section labelled
    "finished plans are not sent back after an update". It contains:
    - the gate check's time before and after;
    - the quality table (tests, failures, skipped, coverage) before and after;
    - the revert counts from criterion 7 (137 before, 6 after);
    - the answer from criterion 9.

    It names no project, path or user name.

## Decisions Taken Under Ambiguity

1. **The evidence for "reverted from done" is the plan's own note plus the ledger, not the
   gate-violations log.** The brief asks for the log to show a revert from done for
   `hash-mismatch`. The log never records the reason, and it drops all but its last 100
   lines (claim 9). The restore re-derives the mismatch instead: the note names both
   folders, and the bytes under the note match the entry by the older method and not by
   today's, which is exactly this defect's `hash-mismatch`. Requiring the log would leave
   most hit users unrestored.
2. **The restore runs in the gate check, through `gate-migration.js`, not at session start.**
   No migration path exists at session start (claim 11). The gate check is the code that
   moved the plans, and the migration state already lives in `gate-migration.js`. Running
   the restore at session start would also add work to a hook that the owner trimmed on
   2026-10-06 (`plans/todo/ctoc-does-no-unasked-work-at-session-start-or-stop.md`, which owns
   `SessionStart.js`).
3. **The restore also returns plans that were sent back from `todo/`, to `todo/`, under the
   same proof.** Decided by CTO Chief on 2026-10-06 as a quality decision: the restore
   returns what a human approved, under the same proof. This covers plans the check sent
   back once (now in `implementation/`) and plans it sent back twice (now in `functional/`).
4. **No edit to `ledger-backfill.js`** (claim 12). Test 4 proves it gains the stamp.
5. **An unknown method version never matches, and it reverts like any other mismatch.**
   Holding it back would mean changing `WITHHELD_REASONS`, and the comments call that
   weakening a human gate. See "Neighbours".
6. **The restore's record is its own uncapped log, plus one summary line in the
   gate-violations log.** The "pending_reapproval" lines left from the original reverts are
   not rewritten. The only code that reads that status is `violation-tracker.markResolved`,
   which runs on a re-approval (read), and the restore is not a re-approval.
7. **One new test file**, so the documented test-file count moves by one. The fixtures come
   from CTOC's own history, not from the real project, so nothing from that project is
   committed.
8. **The benchmark uses the shared harness as described by the coordinator**, and is not in
   `files:`. If at Step 9 the harness does not exist, or its flags differ from that
   description, the executor records what it found and asks before Step 14. It does not
   write a harness of its own.
9. **The restore's only call site is the gate check, though the hooks are not loaded
   today.** It is needed at the moment the hooks are turned on, and it runs first in that
   check. If Step 9 finds a path outside the hooks that moves plans, the restore must also
   run at the start of that path. That file is not in `files:`, so the executor files a
   scope-growth request (`src/lib/scope-growth.js`) before Step 10 and waits for the
   answer. It does not edit the file.
10. **The `todo` fixture pair is captured from history like the `done` pair.** If no
    version from 6.12.92 to 6.14.59 left a `todo` entry for a plan carrying the section,
    the executor records that. It then asks before deriving one, because a fixture
    fingerprinted by the code under test proves nothing.

## Neighbours (seen, not built here; the owner schedules)

- **Turning the hooks on**, in
  `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`, must build after this
  plan. Otherwise the first gate check in every upgraded project sends approved plans back.
- **The gate check's verdict cache** is a separate plan and builds after this one. Its cache
  key must include the method version: the entry's `spec_version` or the absence of one,
  together with the running code's `CURRENT_SPEC_VERSION`. Otherwise a cached verdict could
  outlive a change of method.
- **Going back to an older version still reverts.** Versions up to 6.14.59 ignore the stamp,
  so they revert entries made with today's method (the audit's 43 plans). A future version
  that stamps `3` would make this code answer `spec-method-unknown` and revert. Holding that
  reason back is a change to a human gate, and it is the owner's to schedule.
- **The hook's log line still does not record the reason.** Adding `reason: v.reason` would
  make the next investigation's log readable.
- **The restore record is not shown in the menu.** It is printed by the hook and written to
  `.ctoc/logs/approval-method-restore.json`.
- **Until a plan is approved again, each unstamped older-method plan costs a second
  fingerprint pass on every run of the check.** That is 131 plans in the real project. The
  verdict cache removes the cost.
- **`plans/functional/the-approval-re-record-script-cannot-write-an-approval-nobody-gave.md`**
  changes `ledger-backfill.js` and the contract of `backfillEntry`. Whichever of the two
  plans builds second re-reads `approval-ledger.js`.

## Execution Plan

### Step 8: TEST
- [ ] Write tests 1 to 11 into `tests/approval-method-change.test.js` against the fixtures captured in Step 9.
- [ ] Run the file; expect RED on 1, 3, 4, 5, 7, 8, 9, 10 and 11, and GREEN on 2 and 6 (a guard and a pin); record the failing lines.

### Step 9: PREPARE
- [ ] Find the 6.14.60 change on `main` with `git log --oneline -S "'deferred questions'" -- src/lib/approval-ledger.js`; record its hash beside `cf2e1348` and `df8ab9b4`.
- [ ] Run `git log -L` on the excluded-section list in `src/lib/approval-ledger.js`, from the commit that introduced `hash_scope: 'specification'` to HEAD; it must show exactly one change, the seventh row. A second change means a third method: stop and return to the owner.
- [ ] Run `git log -L` on the note in `revertPlan` in `src/hooks/human-gate-check.js`; confirm its text has not changed since 6.14.60, because the three note patterns depend on it.
- [ ] Capture the fixtures: a `done` pair and a `todo` pair, each a specification-scope entry whose plan carries `## Deferred Questions`, from a commit between 6.12.92 and 6.14.59.
  - In a scratch worktree of that commit, prove by running that each fingerprint equals the recorded value and that today's code does not.
  - Check that no file holds an email address, a home path or a user name.
  - Copy each byte for byte with `git show`, and write the manifest (Decision 10).
- [ ] Make three copies of a real 470-plan project, `plans/` and `.ctoc/` only, with `cp -c` into fresh folders under the session scratchpad. The session that starts this build gives the project's location in its brief; never write that location into a committed file, and never run anything inside the real project.
- [ ] On copy B, run today's hook once from that copy's folder. Record the violations, the moves and the folder counts (expected from the audit: 137 marked, 136 moved, `done/` 309 → 173, `review/` 63 → 199), and how many "REVERTED" lines survive in its gate-violations log.
- [ ] **Runtime check: has any user already been hit without the hooks?** On copy C, run each of the following from that copy's folder, with today's code. Before and after each, record the file list of every stage folder.
  - The command `/ctoc:start` runs (`node <ctoc>/src/commands/start.js`, as `src/commands/start.md` gives it), and each numbered screen of the dashboard that reads plans.
  - `node <ctoc>/src/commands/push.js --dry-run`, which runs the checks without pushing.
  - The `/ctoc:update` path changes the installed plugin, not the project, so it is not run. Instead, read its script and record whether it touches `plans/` or calls the gate check.

  Name every plan that moved, the path that moved it and the direction. Write the answer into this plan's Execution Record and into the `RESULTS.md` section. If any path moved plans, follow Decision 9 before Step 10.
- [ ] Add a git worktree of the commit before this fix under the session scratchpad, for the benchmark's `--before`.
- [ ] Confirm that `.ctoc/audit/speed-and-size/benchmarks/bench.js` exists, and read its flags and its output format. If it is missing or differs from the coordinator's description, record what was found and ask before Step 14.
- [ ] Record the dead-export, false-green and unreachable-file counts before the change.

### Step 10: IMPLEMENT
- [ ] `src/lib/approval-ledger.js`: the method tables and rule, the section parameter, the stamp in `resolveHash` and the three record literals, the method-aware `contentMatches`, the corrected comment.
- [ ] `src/lib/approval-residency.js`: the reason list.
- [ ] `src/lib/gate-migration.js`: `restoreMethodChangeReverts`, with both destinations, and its header section.
- [ ] `src/hooks/human-gate-check.js`: the call before the sweep, the notice, the summary log line, the header paragraph.
- [ ] `CLAUDE.md`: the paragraph and the two counts.
- [ ] Run the test file; expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff, with three questions:
  - Does the subset argument in claim 7 hold, and does test 5 cover heading-level edits?
  - Does the restore return a plan whose entry or bytes are not exactly the owner's approval, on either destination?
  - Is any lock or rollback path wrong?

### Step 12: OPTIMIZE
- [ ] Measure the hook on copy A before and after; the extra cost must be only the second pass on unstamped mismatches and one existence check for the marker. Record the numbers.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff, covering four points:
  - the fallback;
  - the marker's location;
  - the anchored patterns;
  - that the logs hold no paths and no error text.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`; the golden digest in `tests/source-stays-searchable.test.js` is unchanged.
- [ ] Lint the changed source files: zero warnings.
- [ ] On copy A, never hit before, run the fixed hook once. Expect 16 violations: 6 marked for revert (5 `hash-mismatch` and 1 `wrong-edge`) and 10 held back as `no-ledger-entry`. Expect 5 plans moved and 1 refused by the collision guard; `done/` 309 → 304, `review/` 63 → 68. Today's hook gives 137 and 136 here.
- [ ] On copy B, already damaged at Step 9, run the fixed hook once. Expect 131 plans returned to `done/` and 5 left as `changed-after-approval`. Expect `done/` and `review/` to hold the same file names as copy A, and every returned plan to be byte-identical to its twin in copy A. Run it again: nothing moves.
- [ ] The real project's copies have no plan sent back from `todo/` (audit), so the `todo` destination is proven by tests 7 and 11 only; record that in the Execution Record.
- [ ] Run the restore against a scratch copy of this repository's `plans/` and `.ctoc/`, and list what it would return. Believed to be none, because the 35 were re-recorded on 2026-09-03; show any result in full.
- [ ] Run the shared benchmark harness `.ctoc/audit/speed-and-size/benchmarks/bench.js` with `--before` the Step 9 worktree and `--after` the fixed tree, labelled "finished plans are not sent back after an update". It must record the gate check's time and the quality table: tests, failures, skipped, coverage.
- [ ] Write into the same section of `RESULTS.md`:
  - the revert counts on the copy of a real 470-plan project: before, 137 marked and 136 moved; after, 6 marked and 5 moved; on the already-damaged copy, 131 returned;
  - the answer of the Step 9 runtime check.

  Call the project only "a real 470-plan project". Before saving, confirm by reading the section that it holds no project name, no path and no user name, because the file is committed to a public repository.
- [ ] Dead-export, false-green and unreachable-file counts unchanged from Step 9.

### Step 15: DOCUMENT
- [ ] `CLAUDE.md` matches the built behaviour; JSDoc on `restoreMethodChangeReverts`, the changed `contentMatches` and `computeSpecHashWith`.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full, the Step 14 output of both copies: today's hook against the fixed hook, the restore log, the folder counts, the Step 9 runtime answer and the benchmark section.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

**Step 9 runtime check, 2026-10-06 — answer: no path outside the hooks moves a plan back or flags one as unapproved. Build stopped before Step 8, as the brief directs; nothing under `files:` was edited.**

Method. A pristine copy-on-write clone of a real 470-plan project (`plans/` and `.ctoc/`; `done/` 309, `review/` 63, no gate-violations log), with the home folder redirected to a scratch folder. Every plan file was fingerprinted before and after each command. 31 commands ran from the clone's folder with today's working tree (6.14.93), and the same 31 again on fresh clones with the installed plugin versions 6.14.65 and 6.14.67:
- the menu command `/ctoc:start` runs, with no arguments (the streaming gate screen), and the screens `dashboard`, `menu commands`, `browse` of all eight stages, `inbox` questions, decisions, gates, escalations, migration, verify, stale, cleanup and cleanup category, `tasks`, `section` business, implementation and execution, `plan` and `validate` on a finished plan that today's gate check would revert for a fingerprint mismatch, plus `plan` on an implementation, a review and a todo plan;
- `push.js --dry-run` (the checks without pushing; it stopped at "not pushing" because the clone has no linter).

`/ctoc:update` was not run: it replaces the installed plugin and edits the project's CLAUDE.md, and its script neither reads `plans/` nor loads the gate check (read).

Result, identical on all three versions:
- `done/` stayed 309 and `review/` stayed 63. None of the 136 finished plans the gate check would mark for a fingerprint mismatch moved, and no screen's output mentioned a violation, an unapproved plan or a mismatch. The approval-ledger migration screen reports nothing pending, because only the gate check writes its pending file.
- The only plans that moved were 2 plans in `in-progress/`, returned to `todo/` by the dashboard's orphan recovery (`plan-recovery.js`) on the second dashboard render: their builder is no longer running, the first render quarantines them and the second re-queues them. That is the scheduler's designed behaviour, it does not read the approval ledger, and it is not this defect.
- For contrast, today's gate check's own sweep (`checkFolder` + `partitionViolations`, read-only) on another fresh clone marks 137 plans for revert: 136 `hash-mismatch` and 1 `wrong-edge`, all in `done/`, with 10 held back as `no-ledger-entry`.

The two other non-hook candidates were settled by reading where they are called: `iron-loop-enforcer.checkGateDestinationsApproved` runs only from the session-start hook and `src/scripts/run-self-check.js`, and `stale-cleanup.revertPlan` runs only on a cleanup the human picks. Neither is reached by the commands above.

Conclusion: with the hooks not loaded, these commands did not send a single approved plan back in the three versions run (6.14.65, 6.14.67 and 6.14.93); the versions 6.14.60 to 6.14.64 were not run. The fix is still needed before the hooks are turned on (`plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`); the main session decides whether to park this plan. The same answer is recorded in `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
