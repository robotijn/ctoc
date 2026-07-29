---
approved_by: human
approved_at: 2026-07-20T09:18:53.924Z
gate_crossed: implementation → todo
---

---
title: "The gate screens say what the moment is, instead of a number the human cannot decode"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/gate-words.js"
  - "src/lib/streaming-gate.js"
  - "tests/gate-words.test.js"
  - "tests/streaming-gate.test.js"
  - "tests/menu-screens.test.js"
  - "tests/plan-question-screen.test.js"
  - "CLAUDE.md"
  - "tests/readme-numbers.test.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-20
  reason: >
    Twelve assertions across three test files pin the OLD contract — they
    assert the literal gate-number strings this plan exists to delete
    ("Gate 1", "Approve <slug> across Gate 3?", header "Gate 1"). They are not
    wrong tests to be softened; they must be inverted to the new contract, or
    the suite keeps vouching for the wording the owner could not read.
    CLAUDE.md carries two counts that move because this plan adds one module
    and one test file. The human ruled on this identical fork earlier the same
    day for the setup-preview work: extend the build rather than split, so the
    behaviour and the tests that guard it are corrected together.
    Extended a second time for tests/readme-numbers.test.js, which pins the
    top-level module count in its OWN source (not in CLAUDE.md, as the first
    report mistakenly said); this plan adds one module, so 107 becomes 108.
---

# The gate screens say what the moment is, instead of a number

The owner opened a fresh repository and read this, verbatim:

```
discuss-suggestion-with-editor · [review] · Gate 3 (review → done)
←  ☐ Gate 3  ☐ This plan  ✔ Submit  →
Approve discuss-suggestion-with-editor across Gate 3?
```

Four lines. The number appears three times, the internal stage vocabulary twice.
His response was "wtf is gate 3 << i told you no numbers".

He has told us twice. The instruction was applied to the assistant's prose and
never to the shipped strings, which is the only place it mattered. Measured:
**83 occurrences of a gate number in `src/`, of which 27 sit inside string
literals** — text a human reads.

## The rule

**Never print a gate number at a human. Say what the moment IS.** The mapping the
owner confirmed:

| edge | what the moment IS |
|---|---|
| review → done | I don't call anything finished until you say so |
| implementation → todo | I don't start building until you say build it |
| functional → implementation | I don't turn an idea into a build plan until you agree that's the thing to build |
| vision → functional | I don't chase an idea until you say it's the right idea |

Those four sentences are the MEANING, not the copy. A status line and a question
need different phrasings, and pasting the same sentence into both produces a screen
that reads like a form letter. So the vocabulary module carries a phrasing PER SITE
TYPE, worked out for what that site actually has to say.

The numbers stay in code identifiers, comments and file formats. They never reach a
screen.

## The vocabulary, per site

Four site types, because four different jobs:

| site | job | review → done | implementation → todo | functional → implementation | vision → functional |
|---|---|---|---|---|---|
| `moment` — the status line above the plan | orient: name the pause without asking anything | `nothing is finished until you say so` | `nothing gets built until you say build it` | `no idea becomes a build plan until you agree it's the thing to build` | `no idea gets chased until you say it's the right idea` |
| `question` — the sentence asked | ask ONE thing about THIS plan | `Is “<name>” finished?` | `Shall I build “<name>”?` | `Is “<name>” the thing to build?` | `Is “<name>” the right idea?` |
| `chip` — the header label on the choice | fits in roughly twelve characters | `Finished?` | `Build it?` | `Build this?` | `Right idea?` |
| `approve` — the affirmative option's label | answer the question in the human's own words | `Yes — it's finished` | `Yes — build it` | `Yes — that's the thing to build` | `Yes — it's the right idea` |

`<name>` is the plan's TITLE via the existing `humanPlanName(title, slug)` helper —
never the slug, never a filename, never a number.

## The stage names go too

The same screen offered:

```
3. Feedback → Functional — Send back to functional for requirements rework
4. Rework → Implementation — Send back to implementation for technical rework
```

`functional` and `implementation` are stage-directory names. A human cannot decode
them as pipeline positions — they are the same class of internal vocabulary as the
number, and "rework" is jargon on top. What the human is actually choosing between
is WHAT IS WRONG:

| today | becomes |
|---|---|
| `Feedback → Functional` / `Send back to functional for requirements rework` | `Send it back — wrong thing` / `The requirements are wrong. It goes back to be re-thought before anyone builds it again.` |
| `Rework → Implementation` / `Send back to implementation for technical rework` | `Send it back — wrong way` / `The requirements are right; the technical approach is wrong. It goes back to be re-planned.` |

The stage name survives where it belongs — in the ACTION string
(`claude:reject review/<file>.md functional`), which is an identifier the human
never sees.

## Implementation Details

### File: `src/lib/gate-words.js`
**Action:** CREATE
**Purpose:** The single source of every human-facing phrase for a gate moment.
**Change Type:** new-module

One module so the phrasing has ONE encoding. Four surfaces will consume it
(`streaming-gate.js` here, `ui.js` and `menu-screens.js` in the following slice,
the fence after that); four independent phrasings would drift within a month, and
a fence over a phrase that exists in four places cannot say which one is canonical.

#### Exports

- `EDGES` → frozen object keyed by FROM-stage: `functional`, `implementation`,
  `review`, `vision`. Each value is frozen and carries `toStage`, `moment`,
  `chip`, `approveLabel`, and `question(name)`.
- `moment(fromStage)` → `string`
  - The status-line phrase from the table above. Returns `''` for an unknown stage —
    the caller then renders the plan header with no moment line, which is degraded
    but honest. Never throws.
- `question(fromStage, name)` → `string`
  - The question sentence with `name` interpolated inside typographic quotes.
    `name` is passed through the caller's `stripCtl` before it arrives; this module
    does not re-sanitise (one sanitiser, at the render boundary).
  - Unknown stage → `What should happen to “${name}”?`, which is a real question
    with a real answer rather than a fabricated gate sentence.
- `chip(fromStage)` → `string` — the short header label. Unknown stage → `Decision`.
- `approveLabel(fromStage)` → `string` — the affirmative option's label. Unknown
  stage → `Yes`.
- `SEND_BACK` → frozen array of two `{ label, description, toStage }` entries, the
  two rows from the stage-names table. `toStage` carries the identifier
  (`functional`, `implementation`) for the action string; `label` and `description`
  carry the human words.

No export takes or returns a gate number. There is no `gateNumber()` function and
no numeric field anywhere in the module — a number that does not exist cannot leak.

#### Dependencies
None. Pure data and string construction, so every consumer can require it without
a cycle. It deliberately does NOT require `gate-order`: that module encodes the
pipeline's stage ORDER (a technical fact), while this one encodes what to SAY (a
human fact). Coupling them would make a copy edit look like a pipeline change.

#### Called By
- `src/lib/streaming-gate.js` — this slice, four call sites.
- `src/lib/ui.js`, `src/lib/menu-screens.js` — the following slice.

#### Error handling
Every export is total: an unknown or non-string stage yields a neutral,
grammatical fallback. A vocabulary module that throws would take down the screen
it exists to word.

---

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY
**Purpose:** Every gate-number and stage-name string this file renders becomes the
phrase for its site.
**Change Type:** modify-existing — one constant and four render sites

#### Change 1 — `GATE_META` stops carrying a number (`:69-73`)

```js
const GATE_META = Object.freeze({
  functional: { toStage: 'implementation' },
  implementation: { toStage: 'todo' },
  review: { toStage: 'done' },
});
```

The `gate: 1|2|3` field is DELETED, not renamed. It has exactly one consumer
(`gateName` at `:512`), and while the field exists somebody will render it. The
comment above it at `:66-67` currently reads "the gate NUMBER is the human-facing
name" — that sentence is the defect, written down, and it is replaced with the
rule.

#### Change 2 — the descriptor carries phrases, not a name (`:505-520`)

`gateName: \`Gate ${meta.gate}\`` is replaced by three fields:

```js
moment: gateWords.moment(stage),
chip: gateWords.chip(stage),
approveLabel: gateWords.approveLabel(stage),
```

`gateName` is REMOVED from the descriptor. Its four readers (`:801`, `:818`,
`:1094`, `:1112-1113`) are all in this file and all updated here, so nothing is
left reading a field that no longer exists.

Note the shape of the defect: `` `Gate ${meta.gate}` `` contains no digit in its
source text. A search of the codebase for the string "Gate 3" does not find the
line that put "Gate 3" on the owner's screen. The fence in a later slice must
catch this composed form, and this is the exemplar it is built against.

#### Change 3 — the header line (`:818`, `:1094`)

```js
text += `Topic: ${humanPlanName(d.title, d.slug)}  ·  ${d.moment}  ·  `
      + `decision ${index + 1} of ${total}\n`;
```

The `[stage]` chip and the `(from → to)` parenthetical are gone; the moment phrase
replaces both. `decision N of M` stays — that is a count of things the human must
do, which is a number he asked for and can act on. The rule is about gate numbers,
not about arithmetic.

#### Change 4 — the question and its header (`:896`, `:941-943`, `:1112-1113`)

```js
questions.push({
  question: gateWords.question(stage, humanPlanName(title, slug)),
  header: gateWords.chip(stage),
  options,
});
```

and the affirmative option's label becomes `gateWords.approveLabel(stage)` in both
`buildOptions` (`:1019`) and `planDecisionScreen` (`:914`). The option's
DESCRIPTION keeps its existing "Cross the gate now (records approved_by: human)"
only in the sense that the approval marker is a real fact the human should see —
but "Cross the gate" is internal vocabulary too, so it becomes
`Recommended — everything checks out. Your answer is recorded as yours.`

#### Change 5 — the send-back options (`:931-935`)

```js
if (stage === 'review') {
  for (const sb of gateWords.SEND_BACK) {
    options.push({ label: sb.label, description: sb.description });
    actions[sb.label] = `claude:reject ${stage}/${file} ${sb.toStage}`;
  }
}
```

The action strings are byte-identical to today's. Only the words change.

#### Change 6 — the header line in `planDecisionScreen` (`:878-881`)

`gateLabel` is rebuilt from `gateWords.moment(stage)`; when the plan is not at a
gate the line renders with no moment, exactly as today it renders with no gate
label.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `gate-words.moment` | `streaming-gate.gateScreenAt`, `richQuestionScreen`, `planDecisionScreen` | the shipped entry-point screen |
| `gate-words.question` | `streaming-gate.gateScreenAt`, `planDecisionScreen` | same |
| `gate-words.chip` | the `header` of every gate question | same |
| `gate-words.approveLabel` | `buildOptions`, `planDecisionScreen` | same |
| `gate-words.SEND_BACK` | `planDecisionScreen`'s review branch | same |

Every export has a live caller in THIS slice. Nothing is proved only by its test.

## Test Plan

### Tests: `tests/gate-words.test.js`
**Action:** CREATE
**Framework:** `node:test`

| # | Case | Assertion |
|---|---|---|
| 1 | **no export returns a gate number** | for all four stages, `moment`, `chip`, `approveLabel` and `question(stage,'x')` each fail `/\bgates?\s*[0-9]/i` |
| 2 | **the module source names no gate number** | read `src/lib/gate-words.js`; no string literal in it matches `/\bGate\s*[0-9]/i` |
| 3 | **each edge says something different** | the four `moment` strings are pairwise distinct; likewise the four `chip` strings |
| 4 | **the chip fits its header** | every `chip` is at most 12 characters |
| 5 | **the question names the plan by title** | `question('review','The widget rebuild')` contains `The widget rebuild` |
| 6 | **unknown stage is total, not thrown** | `moment('nonsense')`, `chip(null)`, `question(undefined,'x')`, `approveLabel(7)` each return a string and do not throw |
| 7 | **send-back carries human words and a machine stage** | both `SEND_BACK` entries have a `label` free of `functional`/`implementation` as standalone words, and a `toStage` that is exactly one of them |
| 8 | **the rendered gate screen carries no gate number** | drive the REAL `gateScreenAt` over a temp project with one plan in each of `functional/`, `implementation/`, `review/`; the full `text` plus every question, header, option label and option description fails `/\bgates?\s*[0-9]/i` |
| 9 | **the rendered screen carries no bare stage name** | same render; the human-visible strings contain no standalone `functional`, `implementation`, `todo` or `review` token |
| 10 | **the action strings are UNCHANGED** | the same render's `actions` still contain `claude:reject review/<file>.md functional` and `claude:reject review/<file>.md implementation` — the identifiers survive exactly where the human cannot see them |
| 11 | **the plan is named by title, never by slug or filename** | a plan whose title differs from its slug renders the title and contains neither the slug nor `.md` |
| 12 | **`decision N of M` survives** | the counter is still rendered — this fence forbids gate numbers, not counting |
| 13 | **`planDecisionScreen` is covered too** | drive it directly on a review-stage plan; same assertions as cases 8, 9 and 10 |
| 14 | **a hostile title cannot forge a row** | a plan title containing an escape sequence and a newline renders with no escape byte and no extra line |

Cases 8, 9 and 13 are the ones that matter: they assert on the REAL rendered
screen, which is the only surface the human has. Cases 1-7 pin the vocabulary so a
failure names the phrase rather than the screen.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown.

## What this slice does NOT fix

- **The other screens.** `src/lib/ui.js` (`:47-48`, `:119-120`, `:178-180`) and
  `src/lib/menu-screens.js` (`:922`, `:2295`) still print gate numbers after this
  slice. They are the next slice; they are separate files with a separate render
  path and folding them in would push this past a reviewable size.
- **The fence.** Nothing yet FAILS when a new gate number reaches a screen. Cases
  8, 9 and 13 fence the two functions they drive and nothing else. The general
  fence is two slices away, and until it lands this rule is prose again.
- **The empty-plan screen.** The screen the owner saw was ALSO offering four options
  on a plan with no body, one of which refused itself. That is a separate defect
  with a separate cause and its own slice.
- **The phantom plan.** Why a plan existed at all in a fresh repository is not
  touched here.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/gate-words.test.js` in full, run ONLY that file, record the red output verbatim. Cases 8, 9 and 13 MUST be red, and the red output MUST include the rendered screen text so the defect is reproduced from the human's seat, not merely from an assertion message.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/streaming-gate.js` at every site this plan names (`:66-73`, `:505-520`, `:801`, `:818`, `:878-881`, `:896`, `:914-943`, `:1019-1033`, `:1094`, `:1112-1113`). The landed code WINS over this plan's line numbers — if a site has moved, use the site, and record the correction. Confirm `humanPlanName` still exists and still returns the title. Then search the whole file for every remaining reader of `gate` and `gateName` so Change 2 leaves none behind.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/gate-words.js` — the vocabulary module.
  - `src/lib/streaming-gate.js` — Changes 1 through 6.
### Step 11: REVIEW — confirm `GATE_META` has no numeric field and `grep -n "gateName" src/lib/streaming-gate.js` is empty. Confirm every `header` handed to a question is at most 12 characters. Confirm the four action strings are byte-identical to before. Confirm no screen path can render `undefined` when a stage is unknown.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the module is frozen data and template interpolation; no file read, no allocation on a render that does not use it. Confirm no consumer builds the whole `EDGES` table per render.
### Step 13: SECURE — the plan title reaches these phrases. Confirm it passes through `stripCtl` BEFORE `gate-words.question` interpolates it, and that `gate-words.js` itself introduces no second, weaker sanitiser. Case 14 proves it from the render.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/gate-words.test.js tests/streaming-gate.test.js tests/menu-protocol.test.js tests/e2e-menu-lifecycle.test.js` green, then the full gated run `npm test`. Lint both changed JavaScript files. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a header comment on `gate-words.js` stating the rule in one sentence and recording that the numbers remain legal in identifiers, comments and file formats. Replace the now-false comment at `streaming-gate.js:66-67` ("the gate NUMBER is the human-facing name").
### Step 16: FINAL-REVIEW — report the rendered screen BEFORE and AFTER, verbatim, so the change is judged on what a person reads. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **A separate vocabulary module rather than inline strings.** Three files render
   gate moments. Inline phrasing in each is three encodings of one thing, and the
   fence two slices later would have nothing to point at as canonical.
2. **The gate number field is DELETED, not renamed.** A field that exists will be
   rendered. Removing it makes the defect unrepresentable rather than discouraged.
3. **Phrasing differs per site.** The owner explicitly forbade pasting the four
   confirmed sentences everywhere. A status line orients, a question asks, a chip
   labels, an option answers — four jobs, four phrasings, one meaning.
4. **`decision N of M` stays.** The rule is about gate numbers, which encode
   internal pipeline structure. A count of pending decisions is a fact the human
   asked to see and can act on. Case 12 pins this so a later over-zealous fence
   does not delete it.
5. **Stage names are treated as internal vocabulary, same as the number.** A human
   cannot decode `functional` and `implementation` as pipeline positions. The
   send-back options are re-worded to name WHAT IS WRONG — the thing, or the way —
   which is the choice he is actually making. The stage identifier survives in the
   action string, where no human reads it.
6. **`vision → functional` is included in the vocabulary although this file has no
   such edge.** `GATE_META` covers three edges; the pipeline has four. The following
   slice needs the fourth, and a vocabulary module with a hole is a vocabulary
   module somebody fills in badly at the call site.
7. **"Cross the gate now" is re-worded even though it carries no number.** It is the
   same class of internal vocabulary as the stage names. The approval marker itself
   is a real fact and stays, worded as "your answer is recorded as yours".
8. **The unknown-stage fallbacks are grammatical sentences, not empty strings or
   error text.** A vocabulary module that renders `undefined` at a human is a worse
   failure than the one being fixed.
9. **`gateScreenAt` is driven through its SHIPPED routes, not directly.** The Test
   Plan (cases 8 and 13) says "drive the REAL `gateScreenAt`", but that function is
   not in `module.exports`. Exporting it so a test could call it would prove
   reachability with a test, and a test is not a caller. Cases 8 and 9 therefore walk
   all three pending decisions the way a person does: `streamingGateScreen` for the
   first, then `streamSkip` ("Skip for now") for each next one. Same code path, real
   entry points.
10. **The ride-along and lifecycle questions were moved off the slug too.**
    `planDecisionScreen` printed the slug in three further places the plan did not
    enumerate — `Anything else for <slug>?`, `What should happen to <slug>?`, and that
    question's header. They are the same defect as the header line (a filename standing
    in for a piece of work), they are inside a declared file, and case 13 renders them
    on the very screen the owner saw. They now use `humanPlanName`.
11. **Test case 2 inspects STRING LITERALS only.** The rule permits a gate number in
    comments and identifiers and forbids it in anything renderable, so the case
    extracts quoted literals from the module source rather than scanning the whole
    file. As belt and braces, `gate-words.js` contains no digit-after-"gate" anywhere
    at all, so the case cannot pass by a parsing accident.
12. **"FAILS validation" became "FAILS its checks".** The approve option's failure
    description sits beside the re-worded success description; leaving one in pipeline
    vocabulary and re-wording the other would read as a half-finished edit.

### 13. The twelve inverted assertions — justification, one per changed case

Every one is INVERTED, not softened: each now asserts against `gate-words` (the ONE
vocabulary encoding, so a copy edit does not break it) plus a NEGATIVE fence that
fails if a gate number, a raw stage name or a slug ever reaches a human-readable
string again. **(a)** what the code is supposed to do is sourced from OUTSIDE every
test — the vocabulary table in this plan, and the owner's own words ("wtf is gate 3
<< i told you no numbers"); never from what the code now happens to do. **(b)** the
TEST is wrong rather than the code because the human EXPLICITLY REPLACED the
contract: several of these assertions carry messages that state the old contract as a
virtue ("the gate question names the gate", "the gate is named outright"), and naming
the gate outright is precisely the defect. **(c)** the implementation that passes
today and fails after is named per row.

| # | file · case | old assertion | fails after |
|---|---|---|---|
| 1 | `streaming-gate` · lists plans at all three gates | `gateName === 'Gate 1\|2\|3'` | any descriptor re-growing `gateName`, or a number in `moment`/`chip`/`approveLabel`/`title`/`summary` |
| 2 | `streaming-gate` · well-formed first decision (header) | `/Gate 1 \(functional → implementation\)/` | a header printing a number OR a raw stage name |
| 3 | `streaming-gate` · well-formed first decision (question) | `/Approve first-plan across Gate 1\?/`, `header === 'Gate 1'` | a question or chip drifting off the vocabulary, or naming a number |
| 4 | `streaming-gate` · recommends the affirmative when clean | `opts[0].label === 'Approve'` | the leading option not being the edge's affirmative, or a number in its label or its recommendation text |
| 5 | `streaming-gate` · recommends Open when failing | `opts.find(o => o.label === 'Approve')` | as above, plus a number in ANY option label or description |
| 6 | `streaming-gate` · maps replies | `actions['Approve']` | the old bare label being re-aliased, or any action KEY naming a number |
| 7 | `streaming-gate` · falls back to the simple question | `/Approve plain across Gate 1\?/` | the fallback question drifting, or its action key regressing |
| 8 | `menu-screens` · a gate plan is asked about its gate | `/Approve my-plan across Gate 1\?/` | question or chip off-vocabulary, or a number in the question |
| 9 | `menu-screens` · a review plan keeps its options | substrings `Approve`, `Feedback`, `Rework` | a number OR a raw stage in any label; the two reject ACTION strings are pinned byte-identical |
| 10 | `menu-screens` · the build crossing at a real gate | `/Approve impl-plan across Gate 2\?/` | as row 8, on the other edge |
| 11 | `menu-screens` · route dispatches correctly | `/Approve test-plan across Gate 1\?/` | as row 8 |
| 12 | `plan-question-screen` · the gate fallback | `/Approve no-questions across Gate 3\?/` | the question drifting, a number reaching it, or the SLUG reaching it |

One case needed more than a swap. `plan-question-screen` · "the product question is
NOT a gate-approval prompt" asserted `doesNotMatch(/Approve .* across Gate/)`. That
pattern can only ever match the OLD wording, so after the re-word it would have
passed **vacuously** — a fence over a string that no longer exists anywhere. It now
asserts the real thing (the question is not this edge's gate question) and KEEPS the
old pattern beside it, so the dead wording cannot come back either.

### 14. A fifth surface DOES exist — reported, not touched

I had flagged this as an open risk. Reading the four `menu-screens.test.js` bodies in
full closes it: all four drive `route(['plan', …])` → `planDecisionScreen`, already
fixed here. But the same file's `route function dispatches correctly` case asserts
`browse.text.includes('[functional]')` — and it PASSES, because `stageBrowse` in
`src/lib/menu-screens.js` prints the raw stage-directory name at a human. Two more
sites in that file print a gate number in rendered text: `:964`
(`approved at Gate 3; deploy is a SEPARATE human ship gate`) and `:2337`
(`evidence recorded for Gate 3`). `src/lib/ui.js` prints five more (`:47-48`,
`:119-120`, `:178-180`), as this plan already predicted.

**None of these were touched.** `src/lib/menu-screens.js` and `src/lib/ui.js` are
outside the declared paths, and this plan's own "What this slice does NOT fix"
schedules them as the next slice.

**TO THE NEXT EXECUTOR — two things, and the second is the trap.**

1. **The next slice is wider than gate numbers.** Raw stage-directory names reach a
   human through `stageBrowse` in `src/lib/menu-screens.js`, which renders the stage
   as a literal bracketed token — a person reads `[functional]` on the screen. That
   is the same class of internal vocabulary as the number (Decision 5 above), so the
   slice scoped as "the remaining gate numbers" is under-scoped: it must cover raw
   stage names too, or the screen keeps leaking after the numbers are gone.

2. **A test currently asserts the raw stage name is PRESENT, and it PASSES today.**
   `tests/menu-screens.test.js`, case `route function dispatches correctly`:
   `assert.ok(browse.text.includes('[functional]'))`. That assertion **pins the
   defect as the contract**. It must be **INVERTED** — rewritten so it fails when a
   raw stage name reaches the browse text — and NOT merely re-pointed at whatever
   the new string happens to be. Re-pointing it (swapping `[functional]` for the new
   wording) would leave the suite vouching for the next wording just as blindly as
   it vouches for this one. Follow the pattern established in Decision 13: assert
   against the vocabulary encoding, then add the negative fence
   (`doesNotMatch(/\b(functional|implementation|todo|review)\b/i)`) so a regression
   fails on the RULE rather than on a literal.

### 15. The counts were MEASURED, not computed

`ls src/lib/*.js | wc -l` → **108**. `ls tests/*.test.js | wc -l` → **443**. Three
lines in `CLAUDE.md` updated to match (`:247`, `:425`, `:431`).

`tests/readme-numbers.test.js:149` needed its own edit: it does NOT read `CLAUDE.md`,
it pins `107` as a literal in its own source, so no documentation edit could satisfy
it. Re-measured with **that test's own method** (`fs.readdirSync('src/lib').filter(f
=> f.endsWith('.js')).length`, not a shell `ls`, in case the two ever disagree) →
**108**, and the per-increment comment convention in that file was continued with a
`107 → 108` entry naming `gate-words.js` and what it is for.

**A correction I owe the record:** my previous report listed this failing case as one
that "reads CLAUDE.md". It does not. I had attributed it from its failure message
without opening the body — the same shortcut that left the `stageBrowse` surface
unexamined for a round.

### 17. The unknown-stage fallbacks are tested as SCREENS, not as coverage

Four cases (6a-6d) drive all four exports across nine unknown-stage inputs: real
stages with no gate edge (`todo`, `in-progress`, `done`), a typo, the empty string, a
missing argument, `null`, a number, and an object.

The reason they exist is not the coverage figure. An unknown stage is the state in
which a screen is MOST likely to leak an internal identifier, because there is no
curated phrase to fall back on and the nearest available string is the stage value
itself. So 6c asserts the specific leak: a fallback must never echo the stage value it
was handed — `question('in-progress', …)` must not read "…at in-progress?".

6d pins a deliberate ASYMMETRY so nobody later "fixes" it into consistency: the
unknown MOMENT is empty while the chip, label and question all degrade to real words.
An unknown edge has no moment to state, and the caller renders no moment line —
degraded but true. Inventing a sentence there would put a claim about the pipeline on
screen that nobody can vouch for. The other three sites cannot render nothing, so
they degrade to neutral words instead.

All four were green on first run — they guard a module written earlier in this same
task, so they are fences, not test-driven-development red. Rather than bank them,
each was proved to bite under a targeted mutation of `gate-words.js`: dropping the
plan name from the fallback question (6a red), echoing the stage back (6c red),
blanking the chip (6b red), returning an internal token as the chip (6b red),
inventing a fallback moment (6d red), and blanking the affirmative label (6b red).

### 16. The exemption boundary is terminated by the next same-level heading — a real defect

**What happened.** Writing up the previous round, I added the findings under a new
`## Findings` heading. `approval-ledger.EXECUTION_SECTIONS` exempts
`decisions taken under ambiguity` from the specification hash, but an exempt section
runs only until the next heading of the SAME OR HIGHER level — so my `##` heading
CLOSED the exempt region, put executor-written prose back inside the hashed
specification, and invalidated this plan's own approval binding.
`hasLedgerApproval` went false and `iron-loop-enforcer` blocked with
`gate-destinations-approved`. Demoting to `###` restored it.

**Why it is a mechanism defect and not just my mistake.** The rule that decides
whether a plan stays approved is *the heading level of text the executor is
INSTRUCTED to write*. Nothing states that constraint at the point of writing: the
plan says "record decisions under `## Decisions Taken Under Ambiguity`", the brief
repeats it, and neither says "and never open a `##` section afterwards". The failure
is silent at write time and surfaces later as a gate block whose message names
`gate-destinations-approved` — a symptom two layers from the cause. Any executor
following instructions in good faith can invalidate the plan it is executing, and the
more thorough the write-up, the likelier it is.

**What I think the fix is** (NOT done here — outside this plan's scope). The
exemption should be positional rather than heading-level-scoped: **everything from
the first execution-section heading to end-of-file is executor territory**, since by
construction no specification content follows it. That makes the boundary independent
of what the executor writes underneath, and it is a one-predicate change in
`approval-ledger`'s boundary walk. A weaker alternative — treat an unknown `##`
heading that appears AFTER an execution section as still-exempt — preserves more of
the current shape but re-opens the question of what a specification edit appended at
the end looks like. Either way the boundary must stop depending on the executor's
choice of `#` count. A cheap interim guard: have `approval-ledger` expose the
boundary it computed so an executor can assert its write landed outside the hash.

### Findings — where the plan and the code disagree

(Kept as a `###` INSIDE this section deliberately. `approval-ledger.EXECUTION_SECTIONS`
exempts "decisions taken under ambiguity" from the specification hash; a new `##`
heading would have closed that section and put executor-written text back inside the
hashed specification, breaking this plan's own approval binding. It did, and this is
the repair.)

1. **`gateScreenAt` is not exported** (plan, Test Plan cases 8 and 13). Resolved by
   Decision 9 above; no export was added.
2. **The line numbers all held.** Every site named in Step 9 was where the plan said
   it was. `humanPlanName` still exists and still returns the title.
3. **RESOLVED — the `files:` grant was extended by human authorization and the
   thirteen assertions were inverted.** The earlier round reported this as a BLOCKER:
   deleting `gateName` and re-wording the screens broke 12 existing assertions in
   three test files the original `files:` list did not declare, and adding one module
   plus one test file broke 1 documented-count assertion in a fourth. The human then
   authorized the scope extension recorded in this plan's frontmatter
   (`scope_extension`, `authorized_by: human`, `2026-07-20`), which added
   `tests/streaming-gate.test.js`, `tests/menu-screens.test.js`,
   `tests/plan-question-screen.test.js`, `CLAUDE.md` and `tests/readme-numbers.test.js`
   to the grant — so correcting the tests that guard the wording was done inside the
   approved permission, not around it.

   | file | cases | disposition |
   |---|---|---|
   | `tests/streaming-gate.test.js` | 6 | INVERTED to assert against `gate-words` plus a negative fence; markers dated 2026-07-20 in the file |
   | `tests/menu-screens.test.js` | 4 | INVERTED; the two reject ACTION strings pinned byte-identical |
   | `tests/plan-question-screen.test.js` | 2 | INVERTED; the vacuous `/Approve .* across Gate/` pattern kept beside the real assertion so the dead wording cannot return |
   | `CLAUDE.md` / `tests/readme-numbers.test.js` | 1 | counts moved 107→108 modules, test count re-measured |

   Every one was INVERTED, not softened — each now asserts against the single
   `gate-words` vocabulary encoding plus a negative fence that fails if a gate number,
   a raw stage name or a slug reaches a human-readable string again (the per-row
   justification is in Decision 13 above). **The declared work is complete and the
   full gated suite is green** (`npm test`: coverage 99.14% ≥ 99, 0 failed, 0 skipped;
   `npx tsc --noEmit` clean). The earlier "the suite is red on these 13 cases" note
   described the state BEFORE the authorized scope extension; it no longer holds.
