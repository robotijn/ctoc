---
title: "The fresh-slice exemption checks the approval it actually means — having a ledger entry stops standing in for having crossed the gate"
type: implementation
parent_plan: none
depends_on: none
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/human-gate-check.js"
  - "tests/fresh-slice-exemption-parent-approval.test.js"
---

# The fresh-slice exemption checks the approval it actually means

## The defect, read on disk

`src/hooks/human-gate-check.js:200-224`:

```js
function isFreshSip1Slice(filePath, folderName, projectPath = process.cwd(), content = null) {
  if (folderName !== 'implementation') return false;
  …
  const m = region.match(/^\s*parent_plan\s*:\s*(.+?)\s*$/m);
  if (!m) return false;
  const parentPlan = m[1].replace(/^["']|["']$/g, '').trim();
  if (parentPlan === '') return false;
  const ledger = require('../lib/approval-ledger');
  if (ledger.readEntryResult(ledger.slugFromPlanPath(filePath), projectPath).status !== 'absent') {
    return false;
  }
  const parentSlug = ledger.slugFromPlanPath(parentPlan);
  return ledger.readEntryResult(parentSlug, projectPath).status === 'ok';
}
```

The final line is the defect. `status === 'ok'` means **a readable ledger entry exists
for the parent**. It does not mean:

- the entry records a **human** crossing rather than a pipeline one — the file's own
  header at `:14-24` explains that the ledger is trusted precisely because it
  distinguishes kinds, and `approval-ledger` exposes `entryKind` for that purpose;
- the entry records a crossing **into `implementation/`** — `stage_to === 'implementation'`
  is the condition the header at `:20-22` states as the intended rule, in those words;
- the entry still matches the parent's **content**.

So a parent that was moved by the pipeline, or that crossed some other gate entirely,
vouches for a slice sitting in `implementation/`. The comment above the code describes
the rule the code does not implement:

> because the ledger is agent-write-denied, an agent that legitimately edits a plan in
> `implementation/` cannot refresh the hash, so acceptance there binds to the **FACT of
> the Gate-1 crossing (a ledger entry whose `stage_to === 'implementation'` exists)**

The gap between the comment and the code is the whole finding.

### Severity, stated honestly

**This grants no write permission and crosses no gate.** It exempts a plan from the
*residency revert* — the sweep that moves an unapproved plan back to its previous stage.
Its worth is that a forged-parent slice keeps sitting in `implementation/` instead of
being swept back.

It matters for a different reason: it is the **second** place in this codebase where
"has a ledger entry" is used where "has THIS approval" is meant, and the first one was a
real bypass. A pattern that has already been wrong once, left in place in a second
location, is how it becomes wrong again in a third.

It is fixed at MEDIUM priority, in its own slice, with no claim that it is urgent.

## The fix

The parent's entry must satisfy all three conditions the comment already states:

```js
const parent = ledger.readEntryResult(parentSlug, projectPath);
if (parent.status !== 'ok') return false;
const entry = parent.entry;
return ledger.entryKind(entry) === 'human'
  && entry.stage_to === 'implementation';
```

**The content hash is deliberately NOT checked**, and that is not an omission — it is the
rule the file's header derives at `:18-24`: a plan legitimately edited in
`implementation/` cannot refresh its own hash, because the ledger is agent-write-denied.
Requiring a hash match there would revert every parent whose slices were being written,
which is the normal case. The header's reasoning is followed rather than overridden, and
this plan states that explicitly so a later reader does not "complete" the fix by adding
the third check and breaking the normal path.

Field and function names above are **provisional**. Step 9 reads `approval-ledger.js`
and uses whatever it actually exposes; where this plan and the module disagree, the
module wins.

## Implementation Details

### File: `src/hooks/human-gate-check.js`
**Action:** MODIFY — the last three lines of `isFreshSip1Slice`, plus its doc comment

The doc comment at `:174-199` gains the specific rule:

```
 * The parent must have a ledger entry that is (a) readable, (b) a HUMAN crossing, and
 * (c) a crossing INTO `implementation/`. `status === 'ok'` alone was "has any entry",
 * which is not the same claim — the second place in this codebase where "has a ledger
 * entry" stood in for "has THIS approval".
 *
 * The parent's CONTENT HASH is deliberately NOT checked. Per this file's header, a plan
 * legitimately edited in `implementation/` cannot refresh its own hash (the ledger is
 * agent-write-denied), so a hash requirement here would revert every parent whose slices
 * are being written — the normal case. Do not "complete" this check by adding it.
```

Everything else in the function is unchanged: the folder guard, the `parent_plan`
extraction via `extractFrontmatterRegion`, and the slice's own `absent` requirement all
stay exactly as they are.

The function is already return-never-throw in effect — `readEntryResult` returns a status
rather than throwing, per the fault-isolation design at `:79-89`. **Confirm that at Step
9**; if `entryKind` can throw on a malformed entry, wrap it so the fault resolves to
`false` (not exempt), which is the evaluate-normally direction the header calls fail-safe.

### File: `tests/fresh-slice-exemption-parent-approval.test.js`
**Action:** CREATE — `node:test`

Fixture: a temp project with `plans/implementation/`, a parent plan, a slice plan
carrying `parent_plan:`, and ledger entries written through the ledger's own writer (a
hand-written entry may fail its provenance guards, which the scanner found sound).

| # | Parent's ledger entry | Expected |
|---|---|---|
| 1 | human crossing into `implementation` | exempt — **true**. The legitimate case, and the guard against the fix breaking it |
| 2 | **a pipeline-kind entry into `implementation`** | **not exempt** — RED today |
| 3 | **a human entry into `todo`** | **not exempt** — RED today |
| 4 | **a human entry into `done`** | not exempt — RED today |
| 5 | no entry at all (`absent`) | not exempt — unchanged |
| 6 | a corrupt entry | not exempt — unchanged, and no throw |
| 7 | an un-keyable parent slug | not exempt — unchanged, no throw |
| 8 | the **slice itself** already has an entry | not exempt regardless of the parent — unchanged |
| 9 | the slice is in `todo/` | not exempt — the exemption cannot fire outside `implementation/` |
| 10 | the slice is in `done/` | not exempt |
| 11 | no `parent_plan` key | not exempt |
| 12 | empty / quoted-empty `parent_plan` | not exempt |
| 13 | `parent_plan` as a bare slug, as `<slug>.md`, and as a path | all three resolve identically — the existing `slugFromPlanPath` behaviour must survive |
| 14 | **a parent edited after approval** | parent's content changed since its entry was written → **still exempt**. This pins the deliberate no-hash-check decision so a later "improvement" that adds it fails loudly here |
| 15 | **end to end** | run the real sweep over a fixture containing case 2's shape and assert the slice **is** reported as a violation; then case 1's shape and assert it is **not**. The exemption measured through its caller, not its predicate |
| 16 | never throws | every case through a wrapper asserting no exception, plus a fixture with a zero-byte ledger file, a ledger entry that is an array, and a plan file that is a directory |

Case 14 is the load-bearing guard for the decision this plan makes *not* to fix
something. Without it, the next reader adds the hash check and reverts every parent
under active development.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `isFreshSip1Slice` | `checkFolder` at `human-gate-check.js:235`, reached by the sweep in `main()` | the registered `PreToolUse` hook with matcher `"*"` |

The sweep runs on every tool call. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/fresh-slice-exemption-parent-approval.test.js`. Cases 2, 3, 4 and 15
are the defect; cases 1, 13 and 14 are the guards against the fix over-reaching into the
legitimate path or being "completed" into breaking it.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 4 and 15 must be RED. Record case 2's
red verbatim: a pipeline-kind parent vouching for a slice is the sentence that justifies
this slice.

### Step 9: PREPARE
Read from disk: `human-gate-check.js:1-100` (the header stating the intended rule) and
`:174-260`, and `src/lib/approval-ledger.js` **in full** — the exact shape of
`readEntryResult`'s result, the exact name and semantics of `entryKind`, the exact field
holding the destination stage, and whether either can throw. **Where the code disagrees
with this plan, THE CODE WINS**; the names in this plan are provisional. Grep for every
other caller of `readEntryResult` and check whether any of them makes the same
"has an entry" ≡ "has this approval" substitution — **report every instance found, even
though this slice fixes only one.** That list is the real value of this finding.

### Step 10: IMPLEMENT
- `src/hooks/human-gate-check.js` — the three-condition check; the doc comment including
  the explicit no-hash-check rationale.
- `tests/fresh-slice-exemption-parent-approval.test.js` — the sixteen cases.

### Step 11: REVIEW
Confirm the exemption cannot be reached from any folder but `implementation/`. Confirm
every fault resolves to not-exempt. Confirm no content-hash check was added. Confirm the
slice's own `absent` requirement is untouched.

### Step 12: OPTIMIZE
Two field reads added per candidate plan, on an entry the function already loaded. No new
filesystem access.

### Step 13: SECURE
Confirm no plan content or absolute path reaches a log or a message. Re-attack: a parent
plan whose `parent_plan` value contains a traversal, a slug colliding with another
plan's, a `stage_to` of the right string in the wrong case. Report each result; the
`slugFromPlanPath` normalization is the thing under test.

### Step 14: VERIFY
`node --test` on the new file plus every existing `human-gate-check`, `approval-ledger`
and SIP1 test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No git
operations. **Report whether any plan currently in `plans/implementation/` loses its
exemption under the new rule — that is the blast radius, and a plan that loses it is
either genuinely unapproved or evidence that the rule is too strict. Say which, per
plan.**

### Step 15: DOCUMENT
Correct the fresh-slice exemption description in `human-gate-check.js`'s header if Step 9
finds it states the rule the code did not implement, so the header and the code agree.
Update the documented test-file count from disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the Step 9 list of other `readEntryResult` callers
making the same substitution, the Step 14 per-plan blast radius, and every decision taken
under ambiguity.

## What this plan does NOT fix

- It does **not** check the parent's content hash, deliberately, for the reason the
  file's own header derives. Case 14 pins that.
- It does **not** fix the other places Step 9 may find making the same "has an entry" ≡
  "has this approval" substitution. It **reports** them. Fixing each one blind, in a
  slice sized for one, is how a targeted fix becomes an untested sweep.
- It does **not** grant or revoke any write permission. The exemption governs the
  residency revert only.
- It does **not** change the ledger's provenance guards, its specification hash, or the
  fact that its declared file list is inside the digest — the scanner found all three
  sound and they are not re-planned here.
- It does **not** change the migration reporting path at `:41-77`.

## Decisions Taken Under Ambiguity

1. **Kind and destination are both required.** Either alone leaves the other half open,
   and both are named in the file's own header as the intended rule.
2. **The content hash is deliberately NOT required, and that decision is pinned by a
   test.** The header derives why: a plan legitimately edited in `implementation/` cannot
   refresh its own hash. An unpinned deliberate omission reads as an oversight and gets
   "fixed" into a regression.
3. **The names in this plan are provisional and the module wins.** Guessing an API in a
   plan and then implementing the guess is how a plan produces confidently wrong code;
   Step 9 reads the real one first.
4. **The other instances are reported, not fixed.** The value of this finding is the
   pattern, and a list of instances with evidence is worth more than one blind sweep. The
   human schedules the rest.
5. **Every fault resolves to not-exempt.** Evaluating a plan normally is the fail-safe
   direction the file already established at `:83-88`; laundering an unreadable ledger
   into an exemption is the opposite.
6. **MEDIUM, not CRITICAL.** It grants no write permission and crosses no gate. Calling
   it critical because it is adjacent to critical things is the kind of inflation that
   makes a severity scale useless.
