---
approved_by: human
approved_at: 2026-07-19T21:33:26.583Z
gate_crossed: implementation → todo
---

---
title: "Guides declare their checkable claims, and the corpus reports honestly how many it has"
type: implementation
parent_plan: corpus-claim-verification
depends_on: none
blocks: 00136-a-cited-source-is-fetched-and-reports-three-states, 00137-the-verification-verdict-is-enforced-offline-on-every-build
priority: HIGH
program: corpus-quality
iron_loop: true
files:
  - "src/lib/claim-extractor.js"
  - "tests/claim-census.test.js"
  - ".ctoc/claim-coverage-baseline.json"
---

# Guides declare their checkable claims, and the corpus reports honestly how many it has

> **THIS SLICE IS THE FOUNDATION AND CARRIES THE SHARED DESIGN RULING.** Slices
> `00136`, `00137` and `00138` reference the derivations below rather than
> restating them. Read this file first.

## The defect, measured rather than asserted

Roughly sixty-one test files verify this repository's skill and guide corpus by
counting shapes: line count over a threshold, `## ` section count over a
threshold, at least four code fences, the presence of a four-digit year, the
presence of any `http` URL. Read `tests/cu4a-data-warehouse-guides.test.js:62-96`
and `tests/cu4a-completeness.test.js:207-224` — both real, both green, both
satisfiable by a 130-line file of lorem ipsum with four empty fences and the
string `2025`.

`tests/cu4a-data-warehouse-guides.test.js:23-25` states the limit in its own
header, honestly:

> *"This test does NOT re-verify the facts online; it guards the substance
> against a future edit dropping it."*

**That header is correct and this slice does not contradict it.** The structural
tests do a real job — regression protection against a future edit thinning a
guide. What they have never done is check whether the guide is *true*. Those are
two different axes, and the honest move is to ADD the second, not to delete the
first. See "What this does NOT fix" below, which is load-bearing.

## The citation measurement — the number that decides whether this is possible

The scoping question was: *do the guides carry citations precise enough to check,
or are they bare links to documentation home pages?* Measured on disk today
rather than assumed:

| Measurement | Count | Method |
|---|---|---|
| skill/guide files total | **427** | `skills/**/*.md` |
| files carrying a `## References` section | **181** (42%) | grep `^## References` |
| files carrying a `retrieved YYYY-MM-DD` stamp | **188** (44%) | grep `retrieved 20\d\d-\d\d-\d\d` |
| files carrying deep-link reference bullets | **163** | grep `^- .*: https?://` |
| reference bullets in total | **1171** | same |
| of those, **bare home-page** links (`https://host/` with no path) | **23** (**2.0%**) | grep `^- .*: https?://[^/]+/?$` |

**The ruling: where citations exist, they are genuinely claim-level.** Only 23 of
1171 reference bullets (2%) are bare home pages. The rest carry a specific path.
Two guides read in full confirm it — `skills/frameworks/data/duckdb.md:190-199`
and `skills/frameworks/data/clickhouse.md:197-207` cite
`https://duckdb.org/docs/stable/connect/concurrency`,
`https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree`,
and — the strongest kind — **machine-readable registry endpoints**
`https://pypi.org/pypi/duckdb/json` and
`https://pypi.org/pypi/clickhouse-connect/json`. Those are not prose behind a
link; they are a JSON contract that can be compared exactly.

**The real problem is the opposite of the one feared, and it is bigger.** The
citations are not weak — **more than half the corpus has none at all.** The
sharpest instance:

| `skills/frameworks/web/*.md` | Count |
|---|---|
| files | **85** |
| with a `## References` section | **2** (`react.md`, `nextjs.md`) |
| with **no citation of any kind** | **83** |

Two guides read in full: `skills/frameworks/web/express.md` and
`skills/frameworks/web/backbone.md` carry **zero** URLs, **zero** retrieval
dates, and a header reading only `Updated January 2026`. They are dense with
claims that are exactly the checkable kind — *"Express 5 requires Node.js 18+"*,
*"`app.del()` removed"*, *"`req.param()` removed"*, *"`request.query` is now
read-only"*, *"Backbone 1.6.x"* — and not one of them names a source.

So the honest scoping answer is **split, and both halves must be said**:

1. **The mechanism can land NOW**, against the ~181 files that already carry
   claim-level citations. Fetching proves something real there.
2. **For the ~246 files with no citations, fetching proves nothing**, because
   there is nothing to fetch. That is a **corpus-authoring** gap, not a testing
   gap. This slice does not paper over it — it **counts it and reports it**, and
   the ratchet below makes the count move in one direction only.

A single global answer ("the citations are good enough" / "fix the citations
first") would have been wrong in both directions.

## What IS a checkable claim — and what stays unverified

A guide contains prose, code examples and version numbers. Being concrete, with
the unverifiable remainder named rather than quietly absorbed:

| Claim kind | Verifiable? | Why |
|---|---|---|
| **`registry-version`** — "the current release of X is 1.5.4" | **YES, exactly** | Package registries expose JSON (`pypi.org/pypi/<pkg>/json`, `registry.npmjs.org/<pkg>`, `crates.io/api/v1/crates/<c>`, GitHub releases API). A dotted-path lookup compared to an expected string is an exact machine comparison with no interpretation. |
| **`url-live`** — "this cited page exists" | **PARTIALLY** — link-rot only | A 200 proves the page resolves. It does NOT prove the page says what the guide claims. This is a **weaker verdict** and is counted separately; it is never added to the `registry-version` total. |
| "This API was removed in v5" | **NO, not mechanically** | Requires reading changelog prose. Substring-matching HTML is brittle and would produce refutations that are really rendering changes. |
| "This is the recommended approach" | **NO** | Editorial judgment. There is no source that can refute it. |
| Code-example correctness | **NO** | Requires executing it against the real framework — a different project entirely. |

**Said plainly: the great majority of the words in this corpus stay unverified by
this mechanism, and this slice does not pretend otherwise.** What it buys is that
version claims — the ones that rot on a schedule, silently, and are the most
likely to make an agent write broken code — stop being taken on faith. The census
below reports the uncovered remainder as a number so nobody can mistake partial
coverage for coverage.

## Why guides DECLARE claims rather than having them inferred from prose

Extracting `duckdb == 1.5.4` from the sentence *"**`duckdb` (Python) 1.5.4** is
the current stable release, uploaded **2026-06-17**"* by regular expression is
guessing. It would mis-parse, and a mis-parsed claim produces a **false
refutation** — which is worse than no check, because it trains a human to ignore
the report.

So a claim is **declared explicitly**, in an HTML comment block that is invisible
when the markdown is rendered or fed to an agent as context:

```
<!-- ctoc:claims
- id: duckdb-python-version
  kind: registry-version
  source: https://pypi.org/pypi/duckdb/json
  select: info.version
  expect: 1.5.4
  retrieved: 2026-07-10
- id: duckdb-concurrency-doc
  kind: url-live
  source: https://duckdb.org/docs/stable/connect/concurrency
  retrieved: 2026-07-10
-->
```

Consequences, accepted deliberately:

- **A guide with no block contributes zero claims and is counted as uncovered.**
  No guessing, and the gap is visible as a number rather than as silence.
- **Adoption is incremental.** The ratchet drives the covered count up; it never
  requires a 427-file migration before anything works.
- **The parser is line-oriented and dependency-free**, mirroring
  `src/lib/stale-detector.js:316` (`parseFilesField`) — the existing precedent in
  this repository for a hand-rolled frontmatter-shaped parser with no dependency.
  This project has **zero runtime dependencies** (`package.json`) and this slice
  adds none.

## Implementation Details

### Dependency Graph

```
src/lib/claim-extractor.js   (CREATE — leaf; requires only fs, path, ./safe-fs)
        ▲                    ▲
        │                    │
tests/claim-census.test.js   └── (consumed later by 00136 runner, 00137 gate)
        │
        └── reads .ctoc/claim-coverage-baseline.json  (CREATE)
```

No cycles. `claim-extractor.js` requires no project module except `./safe-fs`,
matching the leaf discipline stated in `src/lib/stale-detector.js:5-9`.

### File: `src/lib/claim-extractor.js`
**Action:** CREATE
**Purpose:** Turn the declared claim blocks in the corpus into structured claim records, and report honestly how much of the corpus declares nothing.

#### Exports

- `parseClaimBlocks(markdown: string) → {claims: ClaimRecord[], malformed: MalformedEntry[]}`
  - Finds every `<!-- ctoc:claims … -->` block, parses its line-oriented records.
  - **A malformed record is NEVER silently dropped.** It is returned in
    `malformed` with a closed-enum reason. Silent-drop is the false-green
    signature this repository fences (`src/lib/false-green-scan.js`,
    `silent-catch`): a claim that fails to parse and vanishes is a claim reported
    as absent that was actually present-and-broken.
  - Throws `TypeError` on misuse (non-string) only. Never throws on malformed
    content.

- `extractClaims(root: string, relPath: string) → FileClaims`
  - Returns `{ path, claims, malformed, declared: boolean }`.
  - `declared` is `false` when the file has no claim block at all — distinct from
    a file with an EMPTY block, which is `declared: true` with zero claims (an
    author who looked and found nothing checkable is not the same as an author who
    never looked). This is the same "found nothing" vs "did not look" distinction
    the stale detector draws at `src/lib/stale-detector.js:55-66`.

- `censusCorpus(root: string, opts?) → CorpusCensus`
  - Walks `skills/**/*.md`, returns:

    ```
    {
      totalFiles,            // every guide enumerated
      declaredFiles,         // files carrying a claim block
      undeclaredFiles,       // files carrying none — the honest gap
      claimsByKind: { 'registry-version': n, 'url-live': n },
      malformedCount,
      unreadable: UnreadInput[],   // could-not-look, closed enum
      unreadableCount
    }
    ```

  - **The `unreadable` / `unreadableCount` pair is copied deliberately from
    `src/lib/stale-detector.js:104-124`, not reinvented.** The contract is
    identical and is the only thing that licenses reading a zero:
    `undeclaredFiles === 0` means "the whole corpus declares claims" **only when
    `unreadableCount === 0`**. A walk that could not read `skills/frameworks/web/`
    must never render as a clean corpus.

#### ClaimRecord shape

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique **within a file**. Global identity is `path + '#' + id` — used by `00137` for claim-set drift. |
| `kind` | yes | Closed enum: `registry-version` \| `url-live`. An unknown kind is `malformed`, never silently skipped. |
| `source` | yes | Absolute `https://` URL. Validated at extraction: scheme must be `https`, no embedded credentials, no explicit port. Rejection ⇒ `malformed`. |
| `select` | `registry-version` only | Dotted path into parsed JSON. |
| `expect` | `registry-version` only | Expected value, compared as a trimmed string. |
| `retrieved` | yes | `YYYY-MM-DD`. Feeds the staleness horizon in `00137`. |

#### Security (applied at extraction, not at fetch time)

- **`select` path-walk rejects `__proto__`, `constructor` and `prototype`
  segments** at parse time, so a hostile claim block cannot reach a prototype
  chain when `00136` walks the parsed JSON. Rejecting at extraction means the
  fetcher never receives a dangerous selector at all.
- **`source` is restricted to `https://` with no userinfo and no explicit port.**
  Corpus files are in-repo, but a fetcher driven by URLs read from a text file is
  a server-side request forgery primitive; the narrowing starts here. The
  host-level allow/deny is `00136`'s Step 13.
- File reads are size-gated before the read (`MAX_GUIDE_BYTES`, 1 MiB), mirroring
  `src/lib/stale-detector.js:140`. An oversized file is `unreadable`, never
  silently skipped.
- `unreadable[].path` is **repository-relative and POSIX-separated**, never
  absolute — an absolute path carries a user name onto a dashboard
  (`src/lib/stale-detector.js:104-110`).

#### Cross-platform

`path.join` throughout; directory walk normalizes separators to POSIX for the
returned relative paths; `os.tmpdir()` for all fixtures; no shell.

### File: `tests/claim-census.test.js`
**Action:** CREATE
**Purpose:** The parser's specification, and the ratchet that makes citation coverage move in one direction.

| # | Case | Assertion |
|---|---|---|
| 1 | a well-formed block parses | two records out of the duckdb-shaped fixture, fields exact |
| 2 | **no block ⇒ `declared: false`, zero claims** | the `express.md` shape — the honest uncovered state |
| 3 | **empty block ⇒ `declared: true`, zero claims** | "looked, found nothing checkable" ≠ "never looked" |
| 4 | unknown `kind` ⇒ `malformed`, NOT dropped | with reason `unknown-kind` |
| 5 | missing required field ⇒ `malformed` | reason `missing-field`, names the field |
| 6 | duplicate `id` within a file ⇒ `malformed` | reason `duplicate-id` — identity must be unique or drift detection in `00137` is meaningless |
| 7 | **`http://` source rejected** | reason `insecure-source` |
| 8 | **source with userinfo or explicit port rejected** | reason `unsafe-source` |
| 9 | **`select: __proto__.x` rejected** | reason `unsafe-selector` — prototype-pollution guard at the boundary |
| 10 | malformed `retrieved` date rejected | reason `bad-date` |
| 11 | **an unreadable directory sets `unreadableCount > 0`** | fixture with a denied directory (skipped with a recorded reason where the platform cannot deny — see Decision 7) — and the census must NOT read as clean |
| 12 | **`unreadableCount === 0` on a fully readable fixture** | the only condition under which a zero is honest |
| 13 | `unreadable[].path` is relative and POSIX | never absolute, no user name |
| 14 | **CENSUS RATCHET — declared-file count may only RISE** | `census.declaredFiles >= baseline.minDeclaredFiles` |
| 15 | **the ratchet bites** | temporarily raise the baseline above the live count, observe failure, restore (Decision 5) |
| 16 | live census is REPORTED, never asserted equal to a literal | the test prints the real numbers; a hard-coded expected count would invite making reality match the plan |

Fixtures under `os.tmpdir()`, removed in `finally` with
`fs.promises.rm(root, { recursive: true, force: true })`.

### File: `.ctoc/claim-coverage-baseline.json`
**Action:** CREATE
**Purpose:** The one-directional ratchet on citation coverage.

```json
{
  "minDeclaredFiles": 0,
  "note": "Files under skills/ carrying a ctoc:claims block. RAISE as guides are annotated; never lower. Measured live by tests/claim-census.test.js — read the real number, do not trust this comment."
}
```

**Seeded at the LIVE measured value at build time, which is 0 today** because no
guide carries a block yet. Slice `00136` annotates a first handful and raises it.
Two structures are deliberately NOT conflated here (the lesson from
`.ctoc/false-green-baseline.json`): this file holds a **floor that may only
rise**. It is not a whitelist and must never grow one.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `censusCorpus` | `tests/claim-census.test.js` cases 14-16 | **`npm test`** — the gated entry point |
| `parseClaimBlocks` / `extractClaims` | called by `censusCorpus`; and by `src/scripts/verify-claims.js` in `00136` | `npm test`, then the runner |

The precedent that a ratchet test reached by `npm test` is a genuine root, not a
test-only caller, is `src/lib/false-green-scan.js` ↔
`tests/false-green-fence.test.js` (named as the shipped fence in `CLAUDE.md`), and
the wiring table of `plans/review/00098-…:210-219`. **The gate's verdict is the
product here.** `00138` additionally surfaces the census to a human through the
menu, so the number is met outside a test run as well.

Nothing in this slice is reachable only from a test that asserts about it.

## Test Plan

Covered by `tests/claim-census.test.js` above. Load-bearing cases are 2/3
(declared-vs-undeclared, the distinction the whole honesty story rests on), 9
(prototype pollution at the boundary), and 11/12 (could-not-look must not read as
clean).

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Write `tests/claim-census.test.js` in FULL and run ONLY that file, before `src/lib/claim-extractor.js` exists.
- [x] TDD-RED observed and recorded verbatim: every case fails on the missing module.
- [x] Prove the ratchet bites (case 15): in a temp fixture keyed to the live declared count, set the floor ONE ABOVE it and drive the SAME live check case 14's contract rests on — iron-loop-enforcer's `claim-census` (`checkClaimCensus`) via `checkAllInvariants` — asserting it BLOCKS with the never-lower message; a floor AT the count is CLEAN. **A ratchet never seen failing is indistinguishable from an assertion-free test.** Mutation-proof: inverting the `<`/`>=` in `checkClaimCensus` reddens the case (verified — see build decision 14).

### Step 9: PREPARE
- [x] Read from disk, not from this plan: `src/lib/stale-detector.js:104-124` (the `unread`/`unreadCount` contract to COPY), `:316-358` (`parseFilesField`, the dependency-free parser precedent), `:880-1028` (the walk and its four skip points).
- [x] Read `src/lib/false-green-scan.js` and `tests/false-green-fence.test.js` for the ratchet shape.
- [x] Read `src/lib/safe-fs.js` — use it for every read; do not call `fs` directly.
- [x] Re-measure the citation numbers in this plan's table against disk. **Where the corpus disagrees with this plan, THE CORPUS WINS — record the correction.**

### Step 10: IMPLEMENT
- [x] `src/lib/claim-extractor.js` — `parseClaimBlocks`, `extractClaims`, `censusCorpus`; malformed records returned, never dropped; `unreadable`/`unreadableCount` per the copied contract.
- [x] `tests/claim-census.test.js` — the sixteen cases.
- [x] `.ctoc/claim-coverage-baseline.json` — seeded at the LIVE measured `declaredFiles`.

### Step 11: REVIEW
- [x] No code path drops a malformed claim silently; every skip has a closed-enum reason and a returned entry.
- [x] `declared: false` and `declared: true, claims: []` are genuinely distinct in the return value and in the census totals.
- [x] No path returns `unreadableCount: 0` except a completed walk (the single assertion the honesty contract rests on — `stale-detector.js:1024-1027`).
- [x] Confirm no `catch {}` was introduced that `src/lib/false-green-scan.js` would flag; run the scanner and report its live count before and after.

### Step 12: OPTIMIZE
- [x] One `readdir` per directory, one `lstat` + one `readFile` per guide; no double reads, no globbing library.
- [x] Size-gate BEFORE the read, so an oversized file never enters memory.

### Step 13: SECURE
- [x] `select` rejects `__proto__` / `constructor` / `prototype` segments at parse time (case 9).
- [x] `source` restricted to `https://`, no userinfo, no explicit port (cases 7, 8).
- [x] `unreadable[].path` repository-relative and POSIX, never absolute (case 13).
- [x] Malformed block CONTENT is never echoed into a returned reason — reason is a closed enum plus at most the offending field NAME, capped, mirroring `plans/review/00098-…` Step 13.
- [x] All fixtures under `os.tmpdir()`; the real `skills/` tree is never written.

### Step 14: VERIFY
- [x] `node --test tests/claim-census.test.js` green.
- [x] Full gated run `npm test` — report the verbatim `tests / pass / fail / skipped` line and the coverage line.
- [x] Lint `--max-warnings 0` on the new JavaScript. Typecheck clean.
- [x] Coverage floor at or above `.ctoc/coverage-baseline.json` `minPct`. **This slice adds a source module, so it must be covered — a new file that drags the floor is a finding, not a reason to lower the floor.**
- [x] Reachability and export-reachability fences green.
- [x] **Report the LIVE census numbers verbatim** — total files, declared, undeclared, unreadable. These supersede the table in this plan.

### Step 15: DOCUMENT
- [x] Record the claim-block format in `CLAUDE.md` (short — the format, and that an undeclared guide is counted, not assumed fine).
- [x] Update the documented test-file count in **both** places `tests/doc-counts.test.js` checks, reading the live count from disk first.
- [x] Update the documented module count if `CLAUDE.md` states one.

### Step 16: FINAL-REVIEW
- [x] Report: files, tests, the Step 8 red output verbatim, the deliberately-failed ratchet run, the live census, the false-green scanner count before/after, and every decision taken under ambiguity.
- [x] Ready for human review at Gate 3.

---

## What this slice does NOT fix — stated plainly

1. **It does not verify anything over the network.** No fetch happens here. This
   slice only makes claims extractable and counts coverage. `00136` fetches.
2. **It does not delete or replace the ~61 structural test files.** They guard a
   real and different property — that a future edit does not thin a guide — which
   `cu4a-data-warehouse-guides.test.js:23-25` states correctly. Claim verification
   is an ORTHOGONAL axis, not a replacement. Deleting them would trade a weak
   guard for no guard.
3. **It does not address the ~15% test-count inflation.** That is a reporting
   honesty question about how corpus tests are counted, and it is a **scheduling
   decision that is the human's, not mine.** Named here, not silently absorbed.
   See the open question below.
4. **It does not add citations to the 246 files that have none** — including the
   83 web framework guides. It COUNTS them. Closing that gap is corpus-authoring
   work of a different shape and size.
5. **It cannot verify prose, recommendations, or code-example correctness**, which
   is the great majority of the corpus by volume.

## Open question for the human — NOT decided here

**The ~15% test-count inflation.** Roughly sixty-one test files assert over
documentation and load no source, so they contribute zero coverage while inflating
the headline test count. Three shapes exist — report corpus tests as a separate
count; leave the count as-is and document the composition; or something else.
**This is a schedule-and-policy call and is deliberately left to the human.** No
slice here touches it.

## Decisions Taken Under Ambiguity

1. **Claims are DECLARED in an explicit block, not inferred from prose.** Regex
   over sentences would mis-parse, and a mis-parsed claim yields a FALSE
   REFUTATION — worse than no check, because it teaches a human to ignore the
   report. The cost is that a guide must opt in; the census makes that cost
   visible as a number instead of as silence.
2. **The block is an HTML comment, not a fenced code block.** Guides are fed to
   agents as authoritative context; a visible machine block is noise in every
   prompt that loads one. An HTML comment is invisible to a markdown renderer and
   to a reader, and costs nothing at the point of use.
3. **`declared: false` and `declared: true, claims: []` are kept DISTINCT.** "No
   author has looked at this guide" and "an author looked and found nothing
   mechanically checkable" are different facts. Collapsing them would let an empty
   block launder an unexamined guide into the covered column — the same
   substitution of a success value for absent input that
   `plans/review/00098-…` removed from the coverage floor.
4. **`unreadable`/`unreadableCount` is COPIED from `src/lib/stale-detector.js`,
   not designed afresh.** The instruction was explicit: follow the shape that
   landed rather than inventing a second one. Two different vocabularies for "I
   could not look" in one codebase is how one of them ends up unread.
5. **The ratchet must be seen failing during Step 8.** A ratchet written against a
   baseline it already satisfies is green from birth and indistinguishable from an
   assertion-free test — the reasoning is
   `plans/review/00098-…` Decision 5, applied unchanged.
6. **The baseline is seeded at the LIVE measured value (0 today), not at an
   aspirational one.** A floor above reality fails on arrival and gets lowered,
   which teaches that the floor is negotiable. A floor at reality can only rise.
7. **Case 11 (unreadable directory) uses a permission-denied fixture where the
   platform supports it, and is SKIPPED WITH A RECORDED REASON where it does
   not** — notably a Windows or root-privileged run, where `chmod 000` does not
   deny. A silently-passing case on such a platform would itself be a check
   reporting a verdict on input it never received. **A skip here must be visible
   in the run output**; the repository's zero-skipped gate means this must be
   implemented as a platform branch that asserts an alternative unreadable
   condition, NOT as `it.skip`. Resolve concretely at Step 10 and record which
   branch each platform takes.
8. **`registry-version` and `url-live` verdicts are counted SEPARATELY and never
   summed.** A live URL proves the page resolves, not that the guide's claim about
   it holds. Adding them into one "verified" number would overstate coverage —
   precisely the pretence this whole slice exists to remove.
9. **This slice adds no dependency.** `package.json` has zero runtime
   dependencies; a hand-rolled line parser follows the existing
   `parseFilesField` precedent. A YAML library for a six-field record would be
   attack surface bought for nothing.

### Decisions taken during the build (Steps 8–16)

10. **The plan's wiring claim was FALSE for the reachability FILE fence, and the
    census is wired into `src/lib/iron-loop-enforcer.js` instead.** The Wiring table
    asserts "a ratchet test reached by `npm test` is a genuine root." It is not:
    `src/lib/reachability.js` excludes `tests/` from BOTH fences by design — "a test
    is never a caller." The cited precedent `false-green-scan.js` is reachable NOT
    because its test calls it, but because `iron-loop-enforcer.js` and
    `streaming-precompute.js` `require` it. So `claim-extractor.js`, if called only by
    its test, would have joined the dead-code baseline (27 > 26 → RED). Per Lesson 16
    it is wired NOW, in the same slice, as a fence-style enforcer check `claim-census`
    (scope `architecture`, thorough), mirroring `checkFalseGreenFence`/`checkReachabilityFence`
    exactly. This is the plan's own cited precedent (the enforcer surfacing
    false-green-scan) applied to the census. **One file beyond the declared set was
    touched — `src/lib/iron-loop-enforcer.js` — and only for wiring.** Verified: the
    file fence stays at 26 unreachable, and no new dead export.

11. **The `unreadable` reason enum is THREE, not four: `stat-failed` and `read-failed`
    are merged into `read-failed`.** The size gate needs one `stat` immediately before
    the `read`, both under a single try whose only failure exit is "could not read this
    file." A separate `stat-failed` branch would be reachable by no portable test — an
    uncoverable line pretending to be a distinct fact, which is itself the false-green
    shape. `stage-unreadable` maps to `dir-unreadable` (a skills/ subdirectory whose
    `readdir` failed, standing for its whole subtree). `oversized` is kept, and is the
    PORTABLE trigger the test uses on every platform (a >1 MiB guide), so no case
    silently no-ops on Windows or as root (Decision 7 honored). The permission-denied
    directory case runs additively where `chmod 000` actually denies (POSIX non-root).

12. **A malformed or unreadable `claim-coverage-baseline.json` BLOCKS; it never
    silently defaults to floor 0.** An unreadable ratchet reading as "all clear" is
    the exact false-green defect the repository fences (and a commented-empty catch is
    flagged by `false-green-scan`). The `claim-census` check treats an ABSENT baseline
    as the legitimate 0 default, but an EXISTING-yet-unreadable one (or one lacking a
    numeric `minDeclaredFiles`) as a broken instrument that blocks — mirroring
    `checkReachabilityFence`.

13. **Re-measured against disk (Step 9), the corpus AGREES with the plan and the
    corpus wins where it would not.** Live census: `total=427 declared=0 undeclared=427
    registry-version=0 url-live=0 malformed=0 unreadable=0`. Baseline seeded at the
    live `minDeclaredFiles=0`, exactly as the plan specifies.

14. **The committed case 15 was TEST THEATER — a tautology — and is rewritten to
    actually bite (2026-07-30 fix).** As shipped, case 15 asserted only
    `assert.equal(c.declaredFiles < c.declaredFiles + 1, true)` — `N < N+1`, true for
    every N, exercising no census, no baseline, and no ratchet. It would have stayed
    GREEN even with the ratchet comparison inverted, so it proved nothing; the Step 8
    checkbox claiming the ratchet was "seen failing" was false. The rewrite drives the
    REAL live check — `iron-loop-enforcer`'s `claim-census` (`checkClaimCensus`, the
    `census.declaredFiles < minDeclared` comparison) via `checkAllInvariants` — inside a
    temp fixture keyed to the live declared count: with the floor set ONE ABOVE the count
    the check must return a `block` finding carrying the never-lower message, and with the
    floor AT the count the same check must be CLEAN. A fixture is used rather than
    mutating the committed `.ctoc/claim-coverage-baseline.json` in place because
    `tests/iron-loop-enforcer.test.js` runs `checkAllInvariants(thorough)` on the real
    repo root in a PARALLEL process and would read a half-mutated baseline (a false
    cross-test failure). **Mutation-proof, demonstrated:** temporarily inverting the
    `<` to `>=` in `checkClaimCensus` turned case 15 RED (`actual: undefined` — no finding
    surfaced), and the source was reverted; the change is test-only.
</content>
</invoke>
