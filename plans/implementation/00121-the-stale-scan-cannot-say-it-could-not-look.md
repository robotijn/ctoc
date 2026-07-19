---
title: "The stale scan cannot say it could not look — four silent skips report an unread backlog as a clean one, and its loudest signal fires on every plan that has not been built yet"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/stale-detector.js"
  - "tests/stale-scan-says-when-it-could-not-look.test.js"
---

# The stale scan cannot say it could not look

> **PROVENANCE.** The human found a backlog of 44 plans of which 37 were dead — 34
> already built, 3 killed by a later plan — and nothing had detected it. He reported
> it as "rot with no detector" and proposed building one.
>
> **A detector already exists and is live.** `src/lib/stale-detector.js` is 900+ lines,
> is called on the menu hot path by `src/lib/inbox.js:241` and `:302` and by
> `src/lib/menu-screens.js:1126` and `:1234`, and already carries a git-evidence
> classifier. It is not missing. It has two specific defects that made it quiet, and
> this slice fixes those rather than building a second detector beside the first.
>
> **This changes what the work is.** Building a new checker next to a live one would
> have produced a second encoding of the same rule — the hazard being removed across
> this whole batch.

## Defect one — four silent skips, and no channel to report them

`scanCheapCandidates` (`src/lib/stale-detector.js:794`) walks the gate-source stages
and drops a plan from the scan at four points, each a bare `continue`:

| Line | Condition | What is dropped |
|---|---|---|
| `:823-825` | `readdirSync` on a stage directory throws | **the entire stage** — every plan in it |
| `:855-857` | `lstatSync` on a plan throws | that plan |
| `:859` | plan exceeds `MAX_PLAN_BYTES` (1 MiB) | that plan |
| `:864-866` | `readFileSync` on a plan throws | that plan |

Each individual skip is defensible: a file that vanished mid-scan should not crash
the menu. **The defect is that the return value has nowhere to put them.**
`CheapScanResult` is `{ candidates, count }` and `count === candidates.length`, so a
scan that read nothing returns `{ candidates: [], count: 0 }` — **byte-identical to a
scan that read every plan and found the backlog clean.**

Follow it to the surface: `inbox.js:241` returns `.candidates` straight to the menu's
nag count. **An unreadable `plans/review/` directory therefore renders as "no stale
plans" on the dashboard.** The human's constraint for this batch names this exact
outcome — "a staleness checker that reports 'nothing stale' because it could not read
the plans would be the ninth instance of the defect this year, inside the fix for
it." It is not a hypothetical. It is line 824, shipped, on the hot path.

The `:823` skip is the severe one. One unreadable directory removes a third of the
backlog from the scan and the count still prints with confidence.

Note what the module already gets right, because the fix should match it rather than
invent a new convention: `verifyStaleCandidate` returns explicit `gitAvailable: false`
plus an `error` string when git is unavailable, and `classifyStaleCandidate` maps that
to `inconclusive` with a null action. **The cold path already distinguishes "I could
not look" from "I looked and found nothing." The hot path does not.** This slice
carries the discipline that already exists in the same file across to the scan.

## Defect two — the loudest signal fires on every plan that has not been built yet

The human tried three signals and reported the first as worthless:

> *"the plan's declared files do not exist" — MEANINGLESS. An unbuilt plan ALWAYS shows that. This was my loudest output and it was noise.*

He is right, and the code shows precisely why. Two constants disagree:

```js
const GATE_SOURCE_STAGES = Object.freeze(['functional', 'implementation', 'review']);   // :88
const NOT_STARTED_STAGES = Object.freeze(new Set(['vision', 'canvas', 'functional']));  // :100
```

`NOT_STARTED_STAGES` exists for exactly this reason — the module's header says a
missing-files signal at those stages "means the plan is UNBUILT (not started), never
abandoned." **`implementation` is scanned but is not in that set.**

Per `CLAUDE.md`'s own pipeline model — *"Pre-todo is context-building. Todo+ is
execution"* — a plan at the implementation stage sits **before Gate 2**, has never
entered the todo queue, and has therefore never been executed. Its declared files are
the files it intends to create. **They are supposed to be missing.** Every
implementation-stage plan with a CREATE target emits `missing-files` and is marked
`actionable: true` by the cheap pass, and that is the loud noise the human waded
through.

Two further points, both established by reading rather than assumed:

- The module's header states that stage polarity is applied **downstream in
  `classifyStaleCandidate`**, deliberately keeping the cheap pass broad. That design is
  sound and is preserved. But `actionable` is computed **in the cheap pass**, and
  `inbox.js` consumes `candidates` directly without going through the classifier — so
  the downstream polarity never reaches the surface that was shouting.
- `missing-files` is not worthless everywhere. At the **review** stage a declared file
  that does not exist is a genuine signal, and it keeps its teeth there. The fix is a
  correction of scope, not a deletion.

## Implementation Details

### File: `src/lib/stale-detector.js`
**Action:** MODIFY
**Purpose:** A scan that reports what it could not read, and a signal scoped to the stages where it means something.

**1. `CheapScanResult` gains an `unread` channel.**

```
{ candidates, count, unread: [{ path, stage, reason }], unreadCount }
```

Every one of the four skip points pushes an entry instead of vanishing. `reason` is a
fixed enum — `stage-unreadable`, `stat-failed`, `oversized`, `read-failed` — never a
raw error string in the returned value (see Step 13). For `stage-unreadable`, `path`
is the stage directory and the entry stands for the whole stage; say so in the
`reason` documentation so a consumer cannot read one entry as one plan.

The addition is **purely additive**: `candidates` and `count` keep their exact current
meaning and shape, so every existing caller and test continues to work unchanged.

**2. The consumers must be able to tell the two states apart.** The scan's contract
becomes: `unreadCount === 0` means *"I read every plan"*; `unreadCount > 0` means
*"this result is partial"*. Add that to the module header alongside the existing
statements, and make `count` documented as "candidates found among the plans I could
read" — the honest phrasing.

> **SCOPE NOTE, deliberate.** This slice does **not** edit `inbox.js` or
> `menu-screens.js`, so the dashboard does not yet display the partial-scan warning.
> The reason is sizing, and it is a real cost stated plainly: **until a follow-up
> surfaces `unreadCount`, the menu still renders a partial scan as a clean one.** The
> data exists and is tested here; the display is not wired here. That is a knowingly
> incomplete state and it is named rather than glossed. See "What this does NOT fix".

**3. `implementation` joins `NOT_STARTED_STAGES`, and the cheap pass consults it for
`actionable`.**

- The candidate is still **emitted** — the cheap pass stays a broad generator, exactly
  as the header specifies, so nothing downstream loses input.
- `actionable` becomes false when the only actionable signal is `missing-files` at a
  not-started stage. The plan appears in the list as advisory; it stops driving the
  nag count.
- `NOT_STARTED_STAGES` is already exported and `inbox.js:296` already has a fail-safe
  path for an older detector lacking it — read that path and confirm the change is
  compatible with it before editing.

### File: `tests/stale-scan-says-when-it-could-not-look.test.js`
**Action:** CREATE
**Purpose:** Drive the four skip branches, which today have no observable effect to assert on.

| # | Case | Assertion |
|---|---|---|
| 1 | **an unreadable stage directory is REPORTED** | `plans/review/` unreadable → `unreadCount >= 1` with `reason: 'stage-unreadable'`. Today this returns a confident zero |
| 2 | **partial is distinguishable from clean** | a clean backlog and an unreadable one produce results that differ — the load-bearing case, and the entire subject of this batch |
| 3 | an unreadable plan file is reported | one plan unreadable → one `read-failed` entry, other plans still scanned |
| 4 | an oversized plan is reported | a file above `MAX_PLAN_BYTES` → one `oversized` entry, not a silent drop |
| 5 | a vanished file is reported | stat failure → one `stat-failed` entry |
| 6 | a fully readable backlog reports nothing unread | `unreadCount === 0` — reachable only after a complete walk |
| 7 | **`missing-files` at implementation is NOT actionable** | an implementation plan declaring a file that does not exist → present as a candidate, `actionable: false`. The human's loudest noise, silenced |
| 8 | `missing-files` at review IS still actionable | the signal keeps its teeth where it means something |
| 9 | functional stays unchanged | the existing not-started behaviour does not regress |
| 10 | the existing shape is preserved | `candidates` and `count` keep their current meaning; an existing-shape consumer is unaffected |
| 11 | skips do not abort the walk | one unreadable plan among five → the other four are still scanned and still classified |
| 12 | the reason enum is closed | every `unread` entry's `reason` is one of the four documented values |

Cross-platform: `path.join`, `os.tmpdir()`, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. Cases 1, 3 and 5 depend on
revoking read permission; where a platform cannot, **skip with a stated reason printed
in the output** — a permissions test that silently no-ops is itself a check reporting
a verdict it never earned, and would be a tenth instance inside the fix for the ninth.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `scanCheapCandidates` with the `unread` channel | `src/lib/inbox.js:241` and `:302` | `/ctoc:menu` — the dashboard nag count and drill-in list |
| the `actionable` scoping | same, plus `src/lib/menu-screens.js:1126` / `:1234` via `classifyStaleCandidate` | `/ctoc:menu` |

`stale-detector.js` is **not** in `.ctoc/reachability-baseline.json` — it is already
live and reachable. This slice changes a module a human already reaches on every menu
open; it creates no new module and therefore no new dead code.

## What this does NOT fix

- **The dashboard does not yet show the partial-scan warning.** `unreadCount` is
  produced and tested; no consumer renders it. Until a follow-up wires it, a partial
  scan still *looks* clean to the human even though the data now says otherwise. This
  is the honest cost of keeping the slice to one module, and it is the first thing to
  wire next.
- **It does not answer "has this plan's work already landed?"** That is the question
  behind the 34 already-built plans, and it needs a code-presence probe. See
  `00122`.
- **It does not detect supersession by a later plan.** Also `00122`.
- **It does not fix the contention signal.** "Two plans declare the same file" without
  a landed-check is the human's second worthless signal; it lives in the plan-index
  conflict detector and is addressed in `00122`.
- **It does not make `missing-files` meaningful at the implementation stage.** It
  makes it quiet there. A pre-Gate-2 plan's missing files carry no information, so
  there is nothing to extract — the correct action is to stop reporting it, not to
  reinterpret it.
- **It does not raise the 1 MiB size gate.** An oversized plan is still skipped; it is
  now skipped *audibly*.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- Write `tests/stale-scan-says-when-it-could-not-look.test.js` in full and run ONLY that file, before touching any source.
- **Cases 1, 2, 5, 6, 7 and 12 MUST be RED** — the `unread` channel does not exist and implementation-stage plans are actionable today.
- Record case 2's red verbatim. "A backlog that could not be read and a clean backlog returned the same object" is the evidence this slice exists for, and the verbatim output is worth more than any assertion about it.
- Before fixing case 7, count how many implementation-stage plans in the **real repository** are currently marked actionable on `missing-files` alone, and record the number. That is the size of the noise, measured.

### Step 9: PREPARE
- Read from disk: `src/lib/stale-detector.js` in full — the header contract, `GATE_SOURCE_STAGES` (`:88`), `NOT_STARTED_STAGES` (`:100`), `scanCheapCandidates` (`:794`) and all four skip points, `verifyStaleCandidate`'s `degraded()` shape (`:401`, the convention to mirror), and `classifyStaleCandidate` (`:561`).
- Read `src/lib/inbox.js:230-310` — both call sites and the `NOT_STARTED_STAGES` fail-safe at `:296`.
- Read `src/lib/menu-screens.js:1100-1250` — the classifier call sites, to confirm the additive change cannot break the verify screen.
- Where the code disagrees with this plan, **THE CODE WINS** — record it. The line numbers here were read on 2026-07-19 and the file is long enough to have moved.

### Step 10: IMPLEMENT
- `src/lib/stale-detector.js` — the `unread` / `unreadCount` channel at all four skip points; the closed reason enum; `implementation` added to `NOT_STARTED_STAGES`; `actionable` scoped accordingly; the header contract updated to state what `unreadCount === 0` guarantees.
- `tests/stale-scan-says-when-it-could-not-look.test.js` — the twelve cases.

### Step 11: REVIEW
- Confirm **no** path returns `unreadCount: 0` without having completed the walk. This is the single assertion the whole slice rests on.
- Confirm `candidates` and `count` are unchanged in meaning and shape, and that every existing stale-detector test passes **unmodified**. If one asserts a silent skip, the **code is right** — correct that test toward real behaviour, never loosen it.
- Confirm the broad-generator design is preserved: candidates are still emitted at not-started stages, only `actionable` changed.
- Confirm the `inbox.js:296` fail-safe still behaves correctly with the enlarged set.

### Step 12: OPTIMIZE
- No additional syscalls. Every `unread` entry is built from information the failing call already had; the walk reads the same files it reads today.
- The `unread` array is bounded by the number of plans; no unbounded accumulation.

### Step 13: SECURE
- **No raw error message reaches the returned value.** The `reason` field is the closed four-value enum; a caller renders it directly on the dashboard, and a filesystem error string can carry absolute paths and user names. Assert this in case 12.
- Paths in `unread` are repository-relative, never absolute.
- The existing symlink and size defences (`lstatSync`, `MAX_PLAN_BYTES`) are preserved exactly — a skip becoming audible must not become a skip that reads.
- Fixtures write only under `os.tmpdir()`; the real `plans/` and `.ctoc/state/stale-dismissals.json` are never touched.

### Step 14: VERIFY
- `node --test tests/stale-scan-says-when-it-could-not-look.test.js` plus every existing `tests/stale-*.test.js` and `tests/inbox*.test.js`, green.
- Full gated run `npm test`: lint at `--max-warnings 0`, typecheck clean, coverage at or above the enforced floor, fail 0, and **0 skipped except any platform-conditional permission case, each printing its stated reason**.
- Run the scan against the **real repository** and report verbatim: total candidates, `unreadCount`, and the actionable count before and after the `NOT_STARTED_STAGES` change. The drop in actionable count is the measured size of the noise removed.

### Step 15: DOCUMENT
- Record in `CLAUDE.md` that the stale scan now reports what it could not read, and that `unreadCount === 0` is the only thing that licenses reading a zero candidate count as a clean backlog.
- Record plainly that the dashboard does not yet display it — an undisplayed honest signal is better than a displayed dishonest one, but it is not finished, and the documentation must not imply it is.
- Update the documented test-file count in **both** places, reading the live count from disk first.

### Step 16: FINAL-REVIEW
- Report: files changed; the Step 8 reds verbatim, especially case 2; the real-repository scan before and after with all three numbers; the measured noise reduction; the before/after documented test-file count; and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The existing detector is extended; no second detector is built.** The human's
   brief anticipated building one. `stale-detector.js` is live on the menu hot path, so
   a new checker beside it would be a second encoding of one rule and would compete for
   the same surface. This is the largest decision in the slice and it changes the
   shape of the work.
2. **The `unread` channel is additive; `candidates` and `count` keep their exact
   meaning.** Redefining `count` to include unread plans would silently change every
   existing consumer's numbers — a quiet behaviour change inside a slice about quiet
   behaviour changes.
3. **`reason` is a closed enum, not a raw error string.** The value is rendered on a
   dashboard; filesystem errors carry absolute paths and user names. The diagnostic
   detail belongs in a log, not in a return value bound for a screen.
4. **The skips remain skips.** They are not converted into throws. A vanished plan file
   must not crash the menu — the defect was never that the scan continued, only that it
   continued silently. Continue, and say so.
5. **`stage-unreadable` is ONE entry standing for a whole stage, not one per plan.** The
   scan cannot know how many plans it failed to read, and inventing a count would be a
   number reported on input never received — the exact defect being fixed.
6. **`implementation` joins `NOT_STARTED_STAGES` rather than leaving the gate-source
   set.** Removing it from the scan would also silence the age signal and any future
   signal at that stage. The plan is a legitimate candidate; only `missing-files` is
   uninformative there.
7. **The candidate is still emitted at not-started stages, only `actionable` changes.**
   The module's header states the broad-generator split is deliberate and correct; this
   slice honours that design rather than relitigating it.
8. **`missing-files` keeps its teeth at review.** The signal is not worthless in
   general — it is worthless before a plan has been built. Deleting it outright would
   throw away the one stage where it discriminates.
9. **The dashboard wiring is deliberately deferred, and the resulting incompleteness is
   stated rather than hidden.** Editing `inbox.js` and `menu-screens.js` would take this
   slice past the one-to-three file rule and into two modules with live menu callers.
   The cost — the human still sees a clean-looking dashboard on a partial scan — is
   named in "What this does NOT fix" and in Step 15 rather than being left for someone
   to discover.
10. **The permission-dependent test cases skip loudly or not at all.** A silent no-op on
    a platform that cannot revoke read would make this slice's own test suite an
    instance of the defect it fixes.
