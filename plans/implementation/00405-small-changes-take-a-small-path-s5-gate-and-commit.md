---
title: "A light change re-measures its real diff, runs the full gate, and commits only on fresh passing evidence"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00404-small-changes-take-a-small-path-s4-open-and-close
priority: high
effort: large
files:
  - src/lib/light-path.js
  - src/scripts/light-path.js
  - src/hooks/PreToolUse.Bash.js
  - tests/light-path-gate-commit.test.js
  # Ratchet file: a new test file moves a documented count, and the shell hook's
  # step gates described in CLAUDE.md gain a second satisfier.
  - CLAUDE.md
---

# A light change re-measures its real diff, runs the full gate, and commits only on fresh passing evidence

Read the parent plan first: "Never lighter than", "The grant" and the shell-hook row of the hook table, "Why the light path does not set the project-wide signed state instead", "When a light change grows", "Human moments", decisions 5, 6 and 7, and criteria 9, 11, 13 and 14.

## The problem in plain words

A light change must never be lighter than the full gate, one read of the diff, and the trust-boundary rule. Two things are missing: a finish step that measures the real diff (so a change that grew beyond its path stops instead of committing), and a commit rule for a change with no plan. Today the shell hook lets `git commit` through only when the project-wide signed state sits at step 15 or later, and lets a writing or might-write command (`npm test`, `node …`) through only with a feature at step 8 or later. A light change has neither; setting them would open the gates for every concurrent full build too.

## What the code does today (read on 2026-09-30)

```js
// src/hooks/PreToolUse.Bash.js, main()
if (isCommitCommand(command)) {               // matches `git commit` AND `git push`
  if (currentStep < MINIMUM_STEP_FOR_COMMIT) { /* deny */ }
  process.exit(0);
}
// … then the write step gate: a feature and step >= 8 for any non-'none' verdict
```

```js
// src/lib/step-13-verify.js — the real verify runner and its evidence store
persistVerifyResult(projectPath, planSlug)  // runs runVerify, writes .ctoc/state/verify/<slug>.json,
                                            // returns { planSlug, timestamp, passed, … }
readVerifyEvidence(projectPath, planSlug)   // parsed artifact or null; never throws
verifyEvidencePath(projectPath, planSlug)   // pure path helper
```

```js
// src/lib/continuation.js — the only machine-readable "keep going"
status(root)   // the batch state { active, remaining, forkPending, … } or null
```

The verify evidence store is denied to every editing tool, but on the shell channel it is a whitelisted `.ctoc/` path: by reading, `echo '{"passed":true}' > .ctoc/state/verify/<slug>.json` is allowed whenever the write step gate is satisfied. That is recorded as a finding in the parent index, not fixed here; this slice's commit rule does not rely on the evidence file alone (decision 2).

## Files and signatures

### Modify `src/lib/light-path.js`

```js
/**
 * Re-measure an open record against the REAL working tree. Never throws.
 * @returns {{ ok: true } | { ok: false, reason: ('diff-unmeasurable'|'grew-beyond-files'|
 *   'trust-boundary'|'exports-changed'|'exports-unmeasured'|'dependency-changed'|
 *   'no-test-in-change'), detail: string }}
 */
function remeasure(root, record) { /* … */ }

/** Is there a valid open record bound to this transcript (the grant's binding rules,
 *  without a target file)? Never throws; any fault is false. */
function hasValidOpenRecord(root, userMessages) { /* … */ }

/**
 * May `git commit` run for a light change? Never throws; any fault is not allowed.
 * @returns {{ allowed: boolean, recordId: (string|null),
 *   reason: ('ready'|'no-record'|'no-gate-run'|'stopped'|'gate-failed'|'evidence-missing'|
 *            'evidence-altered'|'evidence-stale'|'awaiting-human-ok') }}
 */
function commitReadiness(root, userMessages) { /* … */ }
```

`remeasure`, in order:
1. Changed set: `git diff --name-only HEAD` together with `git ls-files --others --exclude-standard`, each through `execFileSync('git', [...], { cwd: root, maxBuffer: <explicit> })`; any failure (no repository, no commit, overflow) → `diff-unmeasurable`.
2. A changed file that is neither listed in the record nor whitelisted infrastructure (`isWhitelisted` from the edit hook, required lazily — the same predicate the edit hook uses) → `grew-beyond-files`.
3. Any changed file on the trust boundary → `trust-boundary`.
4. Exports, when `exports_before` is not null: per listed file, the keys added and removed since `open`, from `analyzeExports`. Direct: added and removed counts must be equal in every file (a rename pairs one out with one in). Quick: a removal must be paired with an addition in the same file. Otherwise → `exports-changed`. A direct record with `exports_before` null → `exports-unmeasured`.
5. `package.json` in the changed set: compare `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` between `git show HEAD:package.json` and the working tree; a name added, or a version change that is not patch-level (same major and minor, higher patch, all three numeric) → `dependency-changed`.
6. Quick: the changed set contains no test file (the intake classifier's definition) → `no-test-in-change`.

`commitReadiness`: for each valid open record — `gate` present and `stopped` null; `gate.passed` true; the evidence at `verifyEvidencePath(root, 'light-path-' + id)` exists, its sha256 equals `gate.evidence_sha256`, and it says `passed: true`; its `timestamp` is later than the modification time of every listed file that exists; and for quick, `ack.at` at or after `gate.finished_at`, or an active continuation batch (`active`, `remaining > 0`, no pending fork). The first record that satisfies all of this allows the commit.

### Modify `src/scripts/light-path.js` (add `gate`)

```
gate <id>
```

1. `remeasure`; on a failure write `stopped: { reason, at }` into the record, print the plain reason and the next step ("file the scope-growth question naming this record, or ask the human to plan it"), exit 4. No verify run.
2. `persistVerifyResult(root, 'light-path-' + id)` — the same runner the build loop's verify step uses (lint, type check, the whole suite with the coverage floor read from `.ctoc/coverage-baseline.json`, the last-mile entry-point check).
3. Write `gate: { passed, evidence_sha256, finished_at }` into the record, where `evidence_sha256` is the sha256 of the evidence file's bytes as written and `finished_at` its `timestamp`.
4. Print the verify summary; exit 0 when passed, 5 when not.

### Modify `src/hooks/PreToolUse.Bash.js`

- Read the transcript once near the top of `main` (after the payload reader, before the first state-dependent gate) and extract the human-typed items with the edit hook's `extractUserTypedMessages`.
- Commit gate: split `git push` from `git commit` (`resolveGitSubcommands`, already in the file). A push is decided exactly as today; a light record never satisfies it. A commit below step 15 is allowed when `commitReadiness(root, items).allowed`; otherwise it is denied with today's banner plus the readiness reason in plain words.
- Write step gate: a command that fails today's feature-and-step test is allowed when `hasValidOpenRecord(root, items)`. Determinate targets still go through the coverage stage, where only the record's exact files (or an approved plan's) are granted.
- No mention of the mode in any form (case 27 of `tests/enforcement-mode.test.js`).

## Tests to write first (each run and seen failing before any code)

In `tests/light-path-gate-commit.test.js`, in a scratch CTOC project initialised as a git repository with one commit and a `package.json` whose `test` script is a one-line node program the test controls; records are created with the real `open`; the hook runs as a child process with a signed state that names no feature:

1. Criterion 14: `git commit` with an open record and no gate run → denied (`no-gate-run`); after a failing gate → denied (`gate-failed`); after a passing gate followed by a touch of a listed file → denied (`evidence-stale`); after a passing gate → allowed; `git push` under the same record → denied as today. Red: no readiness check.
2. Criterion 9: a failing `test` script → `gate` exits 5, the record stays open with `gate.passed` false, the commit is refused.
3. The evidence file rewritten after a passing gate → the commit is refused (`evidence-altered`).
4. Quick: passing gate, no acknowledgement → refused (`awaiting-human-ok`); after `ack` → allowed; with an active continuation batch and no acknowledgement → allowed.
5. Criterion 11 (finish half): a direct record whose change adds an export → `gate` exits 4 with `exports-changed`; an unlisted changed file → `grew-beyond-files`; a new dependency in `package.json` → `dependency-changed`; a quick change without a test file → `no-test-in-change`; after any stop the commit is refused (`stopped`).
6. The write step gate: `npm test` and `node x.js` with a valid open record are allowed; without one, denied as today; with a record superseded by a human-typed "plan it", denied.
7. Criterion 13 (shell half): with a valid open record, every deny that runs before the step gates (unreadable payload, ledger forgery, irreversible commands, raw plan moves, opaque decoders) still denies.

## Where the new code is reached from

`remeasure` is called by the script's `gate`; `hasValidOpenRecord` and `commitReadiness` by the shell hook's `main`, registered for Bash. `persistVerifyResult` is the existing verify runner, now also reached from the script.

## Acceptance scenarios

- A direct rename: the session runs `gate`; the whole suite runs; on a pass it commits with the project's patch bump; on a fail it reports the failing evidence in plain words and nothing is committed.
- A quick change: after a passing gate the human is asked "finished?" with the diff summary; the commit goes through only after the session relays the human's yes with `ack`, or under an active keep-going batch.
- A change that quietly grew a new export stops at `gate` and asks.

## Security review

- The commit rule trusts the evidence only through the hash the sanctioned script recorded in the protected record, so a rewritten evidence file is refused.
- A light record never satisfies a push; push remains the human's decision.
- A valid open record lifts the write step gate for indeterminate commands, as an active full-path build state does today; determinate writes are still limited to the record's exact files. A typed escape phrase never lifted the step gate at all, so for indeterminate commands the record is wider than a typed phrase. This is the parent's settled design ("for writes once the record is open"), stated plainly so it is seen at the approach decision.
- The continuation batch state lives under the `.ctoc/` whitelist and is agent-writable; the quick path's acknowledgement is therefore no stronger than the existing relayed approvals, which the parent states.

## Out of scope

Protecting the verify evidence store on the shell channel (a finding for the human, parent index). Any per-task signed state. The recipe text (next slice).

## CLAUDE.md

In "Mandatory Pipeline Use (v7)", state that the shell hook's two step gates accept a valid open light-path record as a second satisfier (writes once the record is open; a commit only on fresh passing evidence recorded by the script; never a push), and update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **The light path reuses the build loop's verify runner and evidence store**, under the slug `light-path-<id>`, instead of a new evidence format. One runner, one reader.
2. **The trust anchor is the evidence hash the script writes into the protected record.** Not chosen: adding a shell-channel deny for the verify store, which would change gate logic beyond what the human approved in the parent ("nothing wider"); it is recorded as a finding instead.
3. **Freshness compares the evidence timestamp with the listed files only, and the patch bump runs after `gate`.** Files the release sync rewrites are outside the record, so a bump after `gate` neither counts as growth nor makes the evidence stale. The consequence, stated rather than hidden: a light change that LISTS a file the release sync also rewrites cannot keep its evidence fresh through the bump. In this repository the release sync rewrites the version in `package.json`, so a dependency bump here cannot finish on a light path; it takes the full path.
4. **Infrastructure paths the edit hook whitelists do not count as growth**, through the edit hook's own predicate.
5. **A rename is read as one removed and one added export in the same file.** No source counts callers (parent, decision 5); the full gate is the detector for a caller the rename missed.
