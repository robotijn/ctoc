---
iron_loop_verdict: true
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
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.711Z
gate_crossed: implementation → todo
---

# The fresh-slice exemption checks the approval it actually means

## The defect, read on disk

`src/hooks/human-gate-check.js:200-224` (verified current):

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

- the entry records a **legitimate** crossing (human, human-ordered backfill, or the
  sufficiency gate) rather than a pipeline one — the file's own header at `:12-24`
  explains that the ledger is trusted precisely because it distinguishes kinds;
- the entry records a crossing **into `implementation/`** — `stage_to === 'implementation'`
  is the condition the header at `:19-24` states as the intended rule, in those words;
- the entry is not an unrecognised / forged provenance (X5's `'unknown'` kind).

So a parent that was moved by the pipeline, that crossed some other gate entirely, or
that carries an unrecognised `advanced_by` marker, vouches for a slice sitting in
`implementation/`. The comment above the code (`:184-191`) describes the rule the code
does not implement — it says the parent must carry "a real ledger entry ... the same
`readEntryResult(...).status === 'ok'` check the residency sweep uses for a normal
resident." But the sweep has NOT used a bare `status === 'ok'` since `classifyResidency`
was extracted into `src/lib/approval-residency.js`: the sweep's real per-resident check
is kind- and edge-sensitive. The gap between what the comment claims the sweep does and
what the sweep actually does is the whole finding.

### Severity, stated honestly

**This grants no write permission and crosses no gate.** It exempts a plan from the
*residency revert* — the sweep that moves an unapproved plan back to its previous stage.
Its worth is that a forged-parent slice keeps sitting in `implementation/` instead of
being swept back.

It matters for a different reason: it is the **last remaining** place in this codebase
where "has a ledger entry" is used where "has THIS approval" is meant, and the first one
was a real bypass (X5 — `classifyResidency` falling through to `accepted: true` on an
unrecognised kind). A pattern that has already been wrong once, left in place in a second
location, is how it becomes wrong again in a third.

It is fixed at MEDIUM priority, in its own slice, with no claim that it is urgent.

## The fix — delegate to the ONE encoding of "has THIS approval"

The parent-approval test must be the SAME predicate the residency sweep applies to a
normal resident of `implementation/`. That predicate is not a hand-rolled field
comparison — it is `approval-residency.classifyResidency`, already imported into this
file (`:152`) and re-exported by it. So the fix REPLACES the two-line parent check with
one delegation:

```js
// The parent is a valid provenance root iff it would itself be ACCEPTED as a
// legitimate resident of implementation/ — i.e. it genuinely crossed Gate 1 into
// implementation/. classifyResidency is THE single encoding of that question.
return classifyResidency(parentPlan, 'implementation', projectPath).accepted;
```

`classifyResidency(parentPlan, 'implementation', …)` (traced against the current
`approval-residency.js`):

- derives the parent slug internally via `slugFromPlanPath` (robust to a bare slug, a
  `<slug>.md`, or a path — so the existing normalization behaviour is preserved, no
  separate `parentSlug` line needed);
- returns **not accepted** for an `absent` / `unkeyable` / `corrupt` parent entry
  (`no-ledger-entry` / `ledger-unkeyable` / `ledger-corrupt`) — a dangling or unapproved
  parent is not a valid root;
- returns **not accepted** when `entry.stage_to !== 'implementation'` (`wrong-edge`) — a
  parent that crossed into `todo/` or `done/` does not vouch for an `implementation/`
  slice;
- **accepts** a `human`, `backfilled`, or `sufficiency` (with evidence) crossing into
  `implementation/` — every legitimate way a functional plan reaches `implementation/`;
- **rejects** a `pipeline` entry at `implementation/` (`pipeline-not-allowed`, valid only
  at `done/`) and an `unknown` provenance (`unknown-provenance`);
- performs **NO content-hash check** at `implementation/`, because `implementation` is
  not a `HASH_SENSITIVE_FOLDER` (only `todo`/`done` are). This is not an omission — it is
  the deliberate rule the file's header derives (`:19-24`): a plan legitimately edited in
  `implementation/` cannot refresh its own hash, because the ledger is agent-write-denied.
  Delegating to `classifyResidency` PRESERVES that rule through the single encoding
  rather than re-stating it locally, and Case 18 pins it so a later reader does not
  "complete" the fix by adding a hash check.

**Why delegate rather than hand-roll a broadened check.** A local
`entryKind === 'human' || 'backfilled' || 'sufficiency'` comparison would be a FOURTH
encoding of the approval predicate — the exact "has an entry ≡ has this approval"
substitution this slice removes, re-created one condition wider. Two (or four) encodings
of an approval predicate can diverge; a divergence in an approval predicate is a forgery
surface, which is precisely why `classifyResidency` was extracted to be the ONE encoding
(`approval-residency.js:4-19`). The naive `entryKind === 'human'` sketch would also
regress every slice whose functional parent crossed Gate 1 via the sufficiency gate (X6)
or a human-ordered backfill — both legitimate, agent-unforgeable crossings the sweep
already accepts. Delegation gives the correct security property AND does not over-reject.

## Implementation Details

### File: `src/hooks/human-gate-check.js`
**Action:** MODIFY — the last two lines of `isFreshSip1Slice`, plus its doc comment

Replace lines `:222-223`:

```js
  const parentSlug = ledger.slugFromPlanPath(parentPlan);
  return ledger.readEntryResult(parentSlug, projectPath).status === 'ok';
```

with the single delegation (`classifyResidency` is already destructured from
`approvalResidency` at `:152`, so no new require is added):

```js
  // The parent is a valid provenance root iff classifyResidency — THE single
  // encoding the sweep uses for a normal resident — would accept it as a legitimate
  // resident of implementation/, i.e. it genuinely crossed Gate 1 into implementation/.
  // Accepts a human / backfilled / sufficiency crossing into implementation/; rejects a
  // pipeline entry (valid only at done/), an unknown provenance, a wrong-edge entry, and
  // a missing / corrupt / un-keyable one. No content-hash check, because implementation
  // is not a HASH_SENSITIVE_FOLDER — the deliberate no-hash rule, preserved through the
  // one encoding.
  return classifyResidency(parentPlan, 'implementation', projectPath).accepted;
```

The slice's own `absent` requirement at `:210-215` (via `ledger.readEntryResult(...).status
!== 'absent'`) is a genuine "does this slice have ANY entry" question and is UNTOUCHED —
a slice that ever crossed a gate is not "fresh". The `ledger` require at `:210` stays for
that check.

The doc comment at `:174-199` is corrected so it states the rule the code now implements.
Its fourth bullet (`:184-191`) is rewritten:

```
 *   - its `parent_plan` resolves to a parent that would ITSELF be ACCEPTED as a
 *     legitimate resident of `implementation/` by `approval-residency.classifyResidency`
 *     — the SAME single predicate the residency sweep applies to a normal resident. That
 *     accepts a human, backfilled, or sufficiency crossing INTO `implementation/` and
 *     rejects a pipeline entry (valid only at `done/`), an unknown provenance, a
 *     wrong-edge entry, and a missing / corrupt / un-keyable one. A bare
 *     `readEntryResult(...).status === 'ok'` — "has ANY entry" — was NOT that claim: it
 *     was the last place in this codebase where "has a ledger entry" stood in for "has
 *     THIS approval". Without this leg the exemption was a Gate-1 residency HOLE: because
 *     `plans/**.md` is Edit-whitelisted, an agent could Write `plans/implementation/x.md`
 *     carrying a lone `parent_plan:` line pointing at any ledgered parent and squat the
 *     Gate-1 destination.
 *
 *     The parent's CONTENT HASH is deliberately NOT checked: `implementation` is not a
 *     `HASH_SENSITIVE_FOLDER`, and a plan legitimately edited in `implementation/` cannot
 *     refresh its own hash (the ledger is agent-write-denied). Delegating to
 *     `classifyResidency` preserves that rule through the one encoding; do not "complete"
 *     the check by adding a hash comparison here.
```

`classifyResidency` is documented "NEVER throws" (`approval-residency.js:115-118`) and is
fault-isolated, so the delegation cannot throw — simpler than wrapping `entryKind`. The
function stays return-never-throw in effect. **Confirm at Step 9** that `classifyResidency`
returns a non-accepted verdict (never throws) for `unkeyable` / `corrupt` / a directory
plan path; if any path can throw, the caller already treats a non-`true` result as
not-exempt, which is the fail-safe direction the header calls for.

### File: `tests/fresh-slice-exemption-parent-approval.test.js`
**Action:** CREATE — `node:test`

Fixture: a temp project with `plans/implementation/`, a parent plan, a slice plan
carrying `parent_plan:`, and ledger entries written through the ledger's OWN writers
(`writeEntry` for human, `backfillEntry` for backfilled, `writeSufficiencyEntry` for
sufficiency, `writePipelineEntry` for pipeline) — a hand-written entry may fail the
provenance guards the scanner found sound. The two cases whose entry the sanctioned
writer refuses to mint (an evidence-less sufficiency entry; an unknown-provenance entry)
are written as raw JSON directly into `.ctoc/approvals/`, exactly the crafted-forgery
shape the predicate must reject.

The exemption test proves the exemption DELEGATES to `classifyResidency` and that its OWN
logic (folder guard, `parent_plan` extraction, slice-absent check) is intact — it does
NOT re-test every internal branch of `classifyResidency` (that matrix lives in
`approval-residency`'s own suite). Cases 2, 5 and 7 are the representative kinds proving
the delegation distinguishes provenance; the rest guard the exemption's own structure.

| # | Parent's ledger entry / setup | Expected | Today |
|---|---|---|---|
| 1 | human crossing into `implementation` | exempt — **true** | GUARD (green→green): the legitimate case; guard that the fix does not break it |
| 2 | pipeline entry into `implementation` | **not exempt** | **RED today** — the defect: a pipeline crossing is not valid at `implementation/` |
| 3 | human entry into `todo` | **not exempt** | **RED today** — wrong edge |
| 4 | human entry into `done` | **not exempt** | **RED today** — wrong edge |
| 5 | **sufficiency entry (with evidence) into `implementation`** | exempt — **true** | GUARD (green→green): pins that the fix ACCEPTS a legitimate X6 sufficiency crossing — the case a naive `entryKind === 'human'` check would wrongly reject |
| 6 | **backfilled entry into `implementation`** | exempt — **true** | GUARD (green→green): a human-ordered migration is a legitimate crossing |
| 7 | **unknown-provenance entry into `implementation`** (raw JSON, e.g. `advanced_by: 'sufficiency-gate'`, or an entry with no marker) | **not exempt** | **RED today** — an unrecognised provenance must not vouch |
| 8 | **sufficiency entry WITHOUT evidence into `implementation`** (raw JSON — the sanctioned writer refuses it) | **not exempt** | **RED today** — `sufficiency-no-evidence` |
| 9 | no entry at all (`absent`) | not exempt | GUARD — `status ≠ ok` already |
| 10 | corrupt parent entry | not exempt, no throw | GUARD |
| 11 | un-keyable parent slug | not exempt, no throw | GUARD |
| 12 | the **slice itself** already has an entry | not exempt regardless of the parent | GUARD — slice's own `absent` check |
| 13 | the slice is in `todo/` | not exempt | GUARD — the exemption cannot fire outside `implementation/` |
| 14 | the slice is in `done/` | not exempt | GUARD |
| 15 | no `parent_plan` key | not exempt | GUARD |
| 16 | empty / quoted-empty `parent_plan` | not exempt | GUARD |
| 17 | `parent_plan` as a bare slug, as `<slug>.md`, and as a path | all three resolve identically | GUARD — the `slugFromPlanPath` normalization must survive delegation |
| 18 | a **parent edited after approval** (content changed since its entry was written) | **still exempt** | GUARD (green→green): pins the deliberate no-hash decision (`implementation` is not hash-sensitive) so a later "improvement" that adds a hash check fails loudly here |
| 19 | **end to end** | run the real sweep over a fixture containing case 2's shape and assert the slice **is** reported as a violation; then case 1's shape and assert it is **not** | **RED today** — the exemption measured through its caller, not its predicate |
| 20 | never throws | every case through a wrapper asserting no exception, plus a fixture with a zero-byte ledger file, a ledger entry that is an array, and a plan file that is a directory | GUARD |

Cases 5 and 6 are the load-bearing guards for the decision this fix makes *not* to
narrow: they are green today (today accepts any `ok` entry) and must STAY green, so a
future refactor to a hand-rolled `entryKind === 'human'` check — which would silently
break every slice under a sufficiency-crossed or backfilled functional parent — fails
here instead. Case 18 pins the deliberate no-hash-check decision.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `isFreshSip1Slice` | `checkFolder` at `human-gate-check.js:245`, defined at `:235`, reached by the sweep in `main()` (`:342-343`) | the registered `PreToolUse` hook with matcher `"*"` |

The sweep runs on every tool call. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/fresh-slice-exemption-parent-approval.test.js`. Cases 2, 3, 4, 7, 8 and
19 are the defect (RED today); cases 1, 5, 6, 17 and 18 are the guards against the fix
over-reaching into the legitimate path or being "completed" into breaking it.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 4, 7, 8 and 19 must be RED. Record
case 2's red verbatim: a pipeline-kind parent vouching for a slice is the sentence that
justifies this slice.

### Step 9: PREPARE
Read from disk: `human-gate-check.js:1-100` (the header stating the intended rule) and
`:174-260`; `src/lib/approval-residency.js` **in full** — the exact contract of
`classifyResidency` (its return shape `{ accepted, reason, kind }`, the folders it
hash-checks via `HASH_SENSITIVE_FOLDERS`, the `PRE_BUILD_GATES` set that admits a
sufficiency entry at `implementation/`, and that it never throws); and
`src/lib/approval-ledger.js` for `readEntryResult`, `entryKind`, and `slugFromPlanPath`.
**Where the code disagrees with this plan, THE CODE WINS.** Grep every other caller of
`readEntryResult` and check whether any makes the same "has an entry" ≡ "has this
approval" substitution — **report every instance.** (This slice's own audit found the
other live callers are legitimate: `human-gate-check.js:213` is the slice's own
"has ANY entry" freshness check, `ledger-backfill.js:162` is a backfill idempotency
check, and `approval-residency.js:163` is the correct kind- and edge-sensitive predicate.
Re-confirm at Step 9; if a new caller has since appeared, report it.)

### Step 10: IMPLEMENT
- `src/hooks/human-gate-check.js` — replace the two-line `status === 'ok'` parent check
  with the single `classifyResidency(parentPlan, 'implementation', projectPath).accepted`
  delegation; correct the doc comment including the explicit no-hash-check rationale.
- `tests/fresh-slice-exemption-parent-approval.test.js` — the twenty cases.
- `CLAUDE.md` — the test-file count row is a GENERATED tally (`computeDocCounts`, plan
  00215); declaring `CLAUDE.md` here is what lets this count-moving plan cross Gate 2
  (the count-mover declaration fence, `plan-declares-count-moving-ratchets.test.js`) and
  lets `release.js` update the generated number. No hand-edit of the literal is required
  beyond what `release.js` regenerates; do NOT assert a stale literal.

### Step 11: REVIEW
Confirm the exemption cannot be reached from any folder but `implementation/`. Confirm
every fault resolves to not-exempt (delegation returns non-`true`). Confirm no
content-hash check was added at `implementation/`. Confirm the slice's own `absent`
requirement is untouched. Confirm the parent check is a single delegation to the one
encoding, not a re-hand-rolled field comparison.

### Step 12: OPTIMIZE
One `classifyResidency` call per candidate plan — the same single ledger read the old
code performed, now routed through the shared predicate. For an `implementation/` parent
no content read occurs (not hash-sensitive). No new filesystem access.

### Step 13: SECURE
Confirm no plan content or absolute path reaches a log or a message. Re-attack: a parent
plan whose `parent_plan` value contains a traversal, a slug colliding with another
plan's, a `stage_to` of the right string in the wrong case, and an entry with
`advanced_by` set to a near-miss of `'sufficiency'`. Report each result; the
`slugFromPlanPath` normalization and `entryKind`'s presence-guard are the things under
test.

### Step 14: VERIFY
`node --test` on the new file plus every existing `human-gate-check`, `approval-ledger`,
`approval-residency` and SIP1 test, then the full gated run `npm test`. Lint at
`--max-warnings 0`. No git operations. **Report whether any plan currently in
`plans/implementation/` loses its exemption under the new rule — that is the blast radius,
and a plan that loses it is either genuinely unapproved or evidence that the rule is too
strict. Say which, per plan.** (Expected: a parent that crossed Gate 1 legitimately via
human/backfill/sufficiency keeps its slices' exemption; only a slice whose parent has a
pipeline / unknown / wrong-edge / missing entry loses it.)

### Step 15: DOCUMENT
Correct the fresh-slice exemption description in `human-gate-check.js`'s header if Step 9
finds it states the rule the code did not implement, so the header and the code agree.
The documented test-file count in `CLAUDE.md` is a generated tally regenerated by
`release.js` (`computeDocCounts`); do not hand-edit the literal — declaring `CLAUDE.md`
in `files:` is what admits the generated bump.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the Step 9 list of other `readEntryResult` callers
making the same substitution (expected: none new), the Step 14 per-plan blast radius, and
every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** check the parent's content hash, deliberately — `implementation` is not
  a `HASH_SENSITIVE_FOLDER`, for the reason the file's own header derives. Case 18 pins
  that. Delegation to `classifyResidency` preserves it without a local special-case.
- It does **not** hand-roll a broadened `entryKind` comparison. That would be a fourth
  encoding of the approval predicate — the exact substitution this slice removes — and it
  would diverge from the one encoding the sweep uses. It delegates instead.
- It does **not** fix any other place a `readEntryResult` caller might make the same
  substitution. Step 9 re-audits and **reports**; the current audit found none beyond
  this one.
- It does **not** grant or revoke any write permission. The exemption governs the
  residency revert only.
- It does **not** change the ledger's provenance guards, its specification hash, or the
  fact that its declared file list is inside the digest — the scanner found all three
  sound and they are not re-planned here.
- It does **not** change the migration reporting path at `:41-77`.

## Decisions Taken Under Ambiguity

1. **The parent check delegates to the single canonical predicate.** The rebase replaces
   the plan's original hand-rolled `entryKind === 'human' && stage_to === 'implementation'`
   sketch with `classifyResidency(parentPlan, 'implementation', projectPath).accepted`.
   The sketch predated the extraction of `classifyResidency` into `approval-residency.js`
   as the ONE encoding of "is this resident approved", and predated the X6 sufficiency
   gate and the backfilled kind — so it would have re-created the very "has an entry ≡ has
   this approval" substitution one condition wider AND regressed every slice under a
   sufficiency-crossed or backfilled functional parent. The intent is unchanged (the
   parent must have genuinely crossed Gate 1 into `implementation/`); only the route is
   corrected to the shipped, non-diverging predicate.
2. **Kind and destination are both required — and enforced by the one encoding, not
   restated locally.** `classifyResidency` already tests `stage_to === folderName` and the
   entry kind, so delegating gets both for free without a second predicate.
3. **The content hash is deliberately NOT required, and that decision is pinned by a
   test.** `implementation` is not a `HASH_SENSITIVE_FOLDER`, so delegation performs no
   hash check — the header's rule (a plan legitimately edited in `implementation/` cannot
   refresh its own hash) is honoured through the one encoding. Case 18 pins it.
4. **`CLAUDE.md` is declared in `files:`.** The plan creates a new `tests/*.test.js`,
   which is a documented-count-moving artifact; the count-mover declaration fence
   (`plan-declares-count-moving-ratchets.test.js`) BLOCKS such a plan at Gate 2 unless it
   also declares `CLAUDE.md`. The test-file count is a generated tally (plan 00215), so
   `release.js` regenerates the literal; declaring `CLAUDE.md` is what admits that bump.
5. **The other instances are reported, not fixed.** The value of this finding is the
   pattern; a list of instances with evidence is worth more than one blind sweep. The
   current audit found no other live substitution. The human schedules any further work.
6. **Every fault resolves to not-exempt.** Evaluating a plan normally is the fail-safe
   direction the file already established; `classifyResidency` never throws and returns a
   non-accepted verdict for `unkeyable` / `corrupt` / `absent`, which the caller treats as
   not-exempt.
7. **MEDIUM, not CRITICAL.** It grants no write permission and crosses no gate. Calling it
   critical because it is adjacent to critical things is the kind of inflation that makes a
   severity scale useless.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
