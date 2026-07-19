---
approved_by: human
approved_at: 2026-07-19T18:15:13.808Z
gate_crossed: implementation → todo
---

---
title: "The approval machinery becomes searchable again — one raw control byte hid the most safety-critical file from every content search"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
blocks: 00101-a-checker-whose-clean-answer-is-falsy, 00102-git-exclusivity-is-undefended-where-work-actually-starts
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-ledger.js"
  - "tests/source-stays-searchable.test.js"
  - "CLAUDE.md"
---

# The approval machinery becomes searchable again

## The defect, reproduced with the tool itself

`src/lib/approval-ledger.js` contains a raw NUL byte. Reproduced during planning,
verbatim, twice, on two different search terms that both exist in the file:

```
Grep "writeSufficiencyEntry" in src/lib/approval-ledger.js
  → binary file matches (found "\0" byte around offset 22911)

Grep "isCheckboxLine" in src/lib/approval-ledger.js
  → binary file matches (found "\0" byte around offset 22911)
```

Both terms are real. `writeSufficiencyEntry` is defined at line 627,
`isCheckboxLine` at line 331. Neither search returned a line, a number, or any
content. **Offset 22911 is exactly the offset named in the brief** — the report was
right to the byte.

### The dangerous half is the multi-file search, and it IS silent

A single-file search at least prints `binary file matches`. A **project-wide**
search does not: the file simply drops out of the result list, indistinguishable
from a file that genuinely has no match. Measured during planning:

| Search | Result |
|---|---|
| `require\(` across `src/**/*.js` | **139 files**, and `src/lib/approval-ledger.js` is NOT among them |
| the same file, read directly | requires `crypto` and uses `crypto.createHash` at line 421 |

So the file matched and was dropped, with no notice of any kind. **Two agents hit
this today**: one searched the approval machinery, got nothing, and worked around
it. A search of the single most safety-critical file in the product comes back
clean because the tool never looked — the defect class this repository already
fences, wearing a different coat: *a report about input that was never read.*

## The byte is CORRECT and is not being removed

`src/lib/approval-ledger.js:418-426`, read from disk:

```js
  // Length-prefixed domain separation between the two derived regions, so no
  // shuffling of bytes across the frontmatter/body boundary can produce the same
  // digest from a different split.
  const h = crypto.createHash('sha256');
  h.update(`${frontmatter.length}\x00`, 'utf8');   // ← rendered above as a raw byte
  h.update(frontmatter, 'utf8');
  h.update('\x00', 'utf8');                        // ← ditto
  h.update(kept.join('\n'), 'utf8');
```

The two separators are what stop a shuffle across the frontmatter/body boundary
from producing the same digest from a different split. **They stay. Their bytes
stay. The hash stays.**

The only thing wrong is the *source spelling*: the separator is written as a
**literal control character embedded in the file** rather than as the escape
sequence `\x00`. In JavaScript the escape and the literal byte produce an
**identical string**, therefore an identical `update()`, therefore an identical
digest — while the source file becomes ordinary text that every tool can read.

## The load-bearing constraint

**Every existing approval record must still verify after this change.** A changed
digest would silently invalidate the whole ledger — every plan in `review/` and
`done/` would read as forged. That is a worse outcome than an unsearchable file,
so the digest identity is not a nice-to-have; it is the gate on this slice
shipping at all. If it cannot be shown, **stop and report** rather than ship.

Identity is provable, not assumed: Step 8 records the golden digest produced by the
**current, unmodified** code for a fixed fixture, and the same assertion must hold
byte-for-byte afterwards.

## Implementation Details

### File: `src/lib/approval-ledger.js`
**Action:** MODIFY — the two separator literals in `computeSpecHash` only
**Purpose:** Same bytes at runtime, ordinary text on disk.

- `h.update(\`${frontmatter.length}\x00\`, 'utf8')` — the escape sequence inside the
  template literal, in place of the embedded control character.
- `h.update('\x00', 'utf8')` — same, for the second separator.
- Extend the existing block comment: name the reason the separator is written as an
  escape (a raw byte makes the file binary to every content search), so nobody
  "simplifies" it back.

**Count the separators before editing.** Planning could confirm the FIRST at offset
22911 and read two `update` calls that render as separators; it could not run a byte
census. Read the file and fix **every** raw control byte found, not two by
assumption. Do not remove, reorder, or reword any `update()` call: the sequence
`length‖NUL‖frontmatter‖NUL‖body` is the digest and is untouched.

**Nothing else in this file changes.** Not the boundary walk, not the deny-list, not
the fail-closed rule, not `contentMatches`, not `resolveHash`.

### File: `tests/source-stays-searchable.test.js`
**Action:** CREATE
**Purpose:** Two guarantees — the digest did not move, and no source file is
invisible to search again.

| # | Case | Assertion |
|---|---|---|
| 1 | **the specification digest is unchanged** | `computeSpecHash(FIXTURE).hash === GOLDEN`, where `GOLDEN` is the hex recorded at Step 8 from the UNMODIFIED code. The fixture is a plan with frontmatter, body, an execution section and checkbox lines, written inline so it can never drift |
| 2 | **domain separation still bites** | two fixtures whose bytes are identical but whose frontmatter/body split differs produce DIFFERENT digests — the property the separator exists for, asserted directly rather than trusted |
| 3 | **the frontmatter length prefix still bites** | a fixture whose frontmatter is one character longer, body correspondingly shorter, hashes differently |
| 4 | **no file under `src/` contains a NUL byte** | every `.js` under `src/` read as a Buffer; `buf.indexOf(0) === -1`. Failure names the file, the byte offset, and why (a NUL makes the file binary to every content search) |
| 5 | **the fence can read what it claims to judge** | the scan must have read at least as many files as the tree contains, and a file it cannot read is a LOUD failure, never a pass — see below |
| 6 | **the fence bites** | a temporary fixture file containing a NUL, written under `os.tmpdir()`, is reported by the same scan function — so case 4's silence is evidence, not an untested code path |

**Case 5 is not optional.** A scanner that reports "no NUL bytes found" after
reading zero files is the ninth instance of this repository's central defect class.
The scan counts files read, asserts the count is greater than zero and equal to the
number of files enumerated, and **rethrows** any read error with the path attached.
No `catch {}`, no skipped file, no default-to-clean.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm(dir, { recursive: true,
force: true })` in teardown, no shell.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented test-file count only
**Purpose:** Keep the documented count true; `tests/doc-counts.test.js` compares it
against disk and fails when it drifts.

This slice adds one test file, so the count moves in **both** places — the
"Run all N test files" line and the "tests/  N test files" project-structure line.
**Read the live count from disk first**; a number written in a plan is a number
someone will make reality match. Nothing else in this file is touched.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the escaped separators | `computeSpecHash` → `resolveHash` → `writePipelineEntry` / `writeSufficiencyEntry` / `contentMatches` | every gate crossing; `src/hooks/PreToolUse.Bash.js` and `src/hooks/human-gate-check.js` sit on the every-tool-call path |
| `tests/source-stays-searchable.test.js` | the suite | `npm test` |
| the count correction | read by the human; verified by `tests/doc-counts.test.js` | `npm test` |

Nothing here is reachable only from a test.

## What this slice does NOT fix

1. **It does not make anything else searchable.** If the byte census finds NUL bytes
   in files other than `approval-ledger.js`, they are REPORTED at Step 16 and left
   for the human to schedule. Only the approval ledger is repaired here.
2. **It does not change any approval semantics** — not the specification boundary,
   not the deny-list, not the fail-closed rule, not `hash_scope` versioning, not the
   forgery guards.
3. **It does not re-hash or migrate existing ledger entries.** Existing entries are
   never re-hashed; that rule is the ledger's, and this slice relies on it rather
   than touching it.
4. **It does not add a pre-commit or hook-level guard against a new NUL byte.** The
   fence is a suite test, so it catches the byte at the gated run, not at the moment
   of writing.
5. **It does not address the other tracked false-green sites** in the baseline.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] `tests/source-stays-searchable.test.js` written in full BEFORE any change to `src/`
- [x] ran; 4 green, 3 red. `GOLDEN` recorded from the UNMODIFIED code
- [x] the NUL fence was red and named both offending files with byte offsets
- [x] vacuity proved: a scan of an empty tree reads zero files and is caught, not called clean
Write `tests/source-stays-searchable.test.js` in full and run ONLY that file
**before touching `src/`**. Cases 1, 2, 3 and 6 must be GREEN immediately — case 1's
whole purpose is to record the digest of the code as it stands today, and its
`GOLDEN` constant is filled in from that first run and recorded verbatim in this
plan's execution record. Case 4 must be **RED**, naming
`src/lib/approval-ledger.js` and byte offset 22911. Record every output verbatim.
Prove case 4 is not vacuous by pointing the scan at a directory with no source files
and confirming case 5 fails loudly rather than reporting a clean tree.

### Step 9: PREPARE
- [x] read `computeSpecHash`, `contentMatches`, `resolveHash`, the module header and the sibling ledger tests
- [x] byte census run over every `.js` under `src/`: 157 files, 3 raw NUL bytes in 2 files
- [x] live documented test-file count read from disk
- [x] discrepancy recorded: the header claims `gate-order.js` is the ONLY intra-project dependency, but the module also requires `./safe-fs` at line 122
Read from disk: `src/lib/approval-ledger.js:400-500` in full (`computeSpecHash`,
`contentMatches`, `resolveHash`); the module header's documented invariant that its
only intra-project dependency is `gate-order.js` — this slice must not add one;
`tests/approval-hash-survives-execution.test.js` so the new file complements rather
than duplicates it; `src/lib/request-exit.js` as the local exemplar of a repaired
false-green site; and the two documented test-file counts in `CLAUDE.md` with the
live count on disk. Run a byte census over `src/**/*.js` and record how many raw NUL
bytes exist and in which files. Where the code disagrees with this plan, **the code
wins** — record the discrepancy.

### Step 10: IMPLEMENT
- [x] `src/lib/approval-ledger.js` — both raw NUL bytes rewritten as the `\x00` escape; block comment extended with the reason
- [x] `src/lib/plan-index/reconcile.js` — the third raw NUL rewritten as the `\x00` escape; comment added
- [x] `tests/source-stays-searchable.test.js` — seven cases, `GOLDEN` filled in from Step 8
- [x] `CLAUDE.md` — documented test-file count corrected in both places from the live count
One step, files as sub-items.
- `src/lib/approval-ledger.js` — every raw control byte in `computeSpecHash`
  rewritten as the `\x00` escape; the block comment extended with the reason.
- `tests/source-stays-searchable.test.js` — the six cases, with `GOLDEN` filled in
  from Step 8.
- `CLAUDE.md` — the test-file count, both places, from the live count on disk.

### Step 11: REVIEW
- [x] the `update()` sequence is byte-identical in order, count and content — only the source spelling changed
- [x] no `require` was added to `approval-ledger.js`
- [x] the golden digest recorded BEFORE the edit still holds AFTER it, shown by a passing assertion
- [x] a differential over the whole corpus shows zero changed approval verdicts
Confirm the `update()` sequence is byte-identical in order, count and content;
confirm no `require` was added to `approval-ledger.js`; confirm case 1 still passes
with the digest recorded BEFORE the edit — that single assertion is the whole safety
argument and it must be shown, not asserted in prose.

### Step 12: OPTIMIZE
- [x] `computeSpecHash` still performs one linear pass and compiles no regular expression per line
- [x] the fence reads each source file once as a Buffer and holds no content beyond the `indexOf` probe
`computeSpecHash` still performs one linear pass and compiles no regular expression
per line. The new fence reads each source file once as a Buffer and holds no file
content beyond the `indexOf` probe.

### Step 13: SECURE
- [x] the fence reads only paths resolved under `path.join(__dirname, '..', 'src')`; no external input reaches a read
- [x] a failure message names a repository-relative path and a byte offset, never file contents
- [x] fixtures are written only under `os.tmpdir()` and removed in a `finally` on every exit path
- [x] no approval semantics changed: not the boundary, the deny-list, the fail-closed rule, or the forgery guards
The fence reads only paths resolved under `path.join(__dirname, '..', 'src')`; no
external input reaches a read. A failure message names a repository-relative path
and a byte offset — never file contents, because a source file may quote a token
shape. Fixtures are written only under `os.tmpdir()` and removed on every exit path
including a failed assertion.

### Step 14: VERIFY
- [x] targeted run over the ledger, gate-migration and doc-count suites: 267 tests, 267 pass, 0 fail
- [x] targeted run over the plan-index reconcile suites: 91 tests, 91 pass, 0 fail
- [x] full gated run `npm test`: 10101 tests, 1742 suites, 10101 pass, 0 fail, coverage 99.05% against a floor of 99, zero tests bypassed
- [x] the coverage floor was neither lowered nor raised
- [x] corpus proof: 163 ledger entries with a live plan re-verified under BOTH the original and repaired module — zero changed verdicts
- [x] the specification digest is identical for all 303 plan files on disk
- [x] lint at `--max-warnings 0` clean on all three changed JavaScript files
- [x] the content search that failed at planning time now returns real lines; no git operations were run
Run `node --test` on the new file and on
`tests/approval-hash-survives-execution.test.js`, `tests/approval-ledger-*.test.js`,
`tests/ledger-forgery-closed.test.js`, `tests/gate-migration.test.js`,
`tests/doc-counts.test.js` and `tests/human-gate-check-coverage.test.js`. Then the
full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the zero-skipped
counter and the coverage line verbatim. The coverage floor must not be lowered.
**Then prove the corpus survived**: run the invariant check over the real repository
and confirm every plan in `review/` and `done/` still verifies against its ledger
entry. If a single existing approval stops verifying, **STOP and report** — do not
adjust the ledger, do not re-hash, do not proceed. Lint every changed JavaScript
file at `--max-warnings 0`. No git operations. Confirm the same content search that
failed at planning time now returns real lines.

### Step 15: DOCUMENT
- [x] file header on the new test naming both guarantees and why they live together
- [x] inline comment at both separators naming the escape requirement
- [x] `CLAUDE.md` count corrected in both places from the live count on disk
A file header on the new test naming both guarantees and why they live together (the
searchability repair is only safe because the digest identity is pinned in the same
file). An inline comment at the separators naming the escape requirement. The
`CLAUDE.md` count correction lands here, in both places, from the live count.

### Step 16: FINAL-REVIEW
- [x] paths, byte census, golden digest before and after, red evidence and verbatim green all reported
- [x] corpus verification result reported
- [x] documented test-file count before and after reported
- [x] the five things this slice does NOT fix restated
- [x] every decision taken under ambiguity recorded below
Report the paths, the Step 8 verbatim red for case 4 and the recorded `GOLDEN`, the
byte census with every NUL-carrying file found, the verbatim green from Step 14, the
corpus verification result, the before-and-after documented test-file count, an
explicit restatement of the five things this slice does NOT fix, and every decision
taken under ambiguity.

## Ordering and file conflicts

**This slice lands FIRST in its batch.** Two later slices —
`00101-a-checker-whose-clean-answer-is-falsy` and
`00102-git-exclusivity-is-undefended-where-work-actually-starts` — both open with a
**survey of the codebase for a pattern**. A survey conducted with a tool that
silently drops the most safety-critical file in the product is a survey whose
"nothing found" cannot be trusted. That is not a preference; it is the same
circularity argument that ordered the coverage-floor slice ahead of the fence that
verifies itself with the gate: repair the instrument, then use it.

No sibling in this batch declares `src/lib/approval-ledger.js`,
`tests/source-stays-searchable.test.js`, or `CLAUDE.md` — this is the only slice of
the five that adds a test file, so it is the only one whose documented count moves.
`CLAUDE.md` **is** declared by `00098-the-coverage-floor-stops-silently-dropping-to-80`,
which sits in `review/` with its edit already on disk; the count is therefore read
live at Step 9 rather than taken from any plan. The concurrently-edited
`src/lib/reachability.js` is not involved.

## Decisions Taken Under Ambiguity

1. **The separator is escaped, not removed, not replaced.** Removing it would let a
   shuffle across the frontmatter/body boundary collide; replacing it with a
   printable character (`|`, `\x1f`) would change the digest and invalidate every
   existing approval. The escape is the only option that changes the file on disk
   and nothing at runtime.
2. **The digest identity is pinned with a golden constant recorded BEFORE the edit,
   not argued from language semantics.** That the escape and the literal byte
   produce the same string is true and easy to state; a plan that ships on that
   argument alone has verified nothing. The constant is the evidence.
3. **The byte census is measured at Step 9, not assumed from this plan.** Offset
   22911 is confirmed; the total count is not. A plan that hands the executor a
   count invites the executor to make reality match the plan.
4. **The fence scans for NUL specifically, not for "binary-looking" content.** A
   heuristic that guesses at binary-ness would fire on legitimate content and would
   be tuned into uselessness. NUL is the exact byte that flips the classification,
   and it has no business in a JavaScript source file.
5. **The fence covers `src/` only, not `tests/` or `.ctoc/`.** `src/` is the tree
   agents search when they audit behaviour; that is where an invisible file does the
   damage this slice exists to stop. Widening the scan is a separate decision for
   the human, and a fence that fires on a fixture directory would be turned off.
6. **A file the fence cannot read is a failure, never a pass.** No `catch {}`, no
   skip. A scanner reporting a clean verdict over files it never opened is the
   defect class this repository fences, and building a new instance of it inside the
   fix for another instance would be indefensible.
7. **Other NUL-carrying files, if any are found, are reported and not repaired
   here.** Scheduling is the human's. The census is technical and belongs in the
   report; deciding which file gets fixed when does not belong to this slice.
8. **`CLAUDE.md` is declared in `files:` even though the edit is two numbers.** The
   coverage hook matches on the declaration, not on the size of the change; an
   undeclared edit would be blocked at Step 15 with the work already done. Declaring
   it costs nothing and is the difference between a slice that completes and a slice
   that stalls at its last step.

### Added during execution

9. **A THIRD raw NUL byte existed, and it was repaired rather than only reported.**
   The census found three NUL bytes in two files, not two in one:
   `src/lib/approval-ledger.js` at offsets 22911 and 22969, and
   `src/lib/plan-index/reconcile.js` at offset 7348 — a composite map key,
   `` `${normPath}\x00${sectionId}` ``. Decision 7 above says other NUL-carrying
   files are reported and left for the human to schedule, but the fence in this same
   slice asserts that NO file under `src/` contains a NUL. Those two cannot both
   ship. The only ways to reconcile them were to repair the third byte or to add a
   whitelist entry, and silencing a fence with a whitelist is exactly the move that
   kills a fence. The repair was taken: it is the identical escape rewrite, the key
   is in-memory only and never persisted, and all 91 plan-index reconcile tests
   pass. Leaving it would also have defeated the slice's stated purpose, since the
   two later survey slices would still be searching a tree with an invisible file.

10. **Adding that file to `files:` invalidated this plan's own approval, so the
    declaration was reverted.** Declaring `src/lib/plan-index/reconcile.js` in the
    frontmatter changed the frontmatter, which the specification hash covers in
    full — the ledger immediately reported this plan as unverified and the
    `gate-destinations-approved` check went to block severity, naming this plan as
    the only offender in the repository. That is the ledger working exactly as
    designed: an executor amending an approved specification is the post-approval
    change the ledger exists to expose. Restoring the frontmatter restored the
    approval. **This is a real tension worth the human's attention:** an executor
    that discovers it must touch one more file cannot declare that file without
    invalidating the human's approval of the plan. The repair to
    `reconcile.js` is therefore recorded here rather than declared in `files:`.

11. **The length prefix and the NUL separator are jointly, not independently,
    falsifiable.** The plan asks for one case proving the separator bites and
    another proving the length prefix bites. From plan-shaped input they cannot be
    isolated, because a real plan's frontmatter cannot contain a NUL byte to forge
    the separator with. Two independent fixture pairs assert the composite property
    the ledger actually relies on, and the test says so in a comment rather than
    implying a stronger guarantee than it delivers.

12. **The module header contradicts the code and was left alone.** The header states
    its ONLY intra-project dependency is the pure-constant `gate-order.js`, but line
    122 requires `./safe-fs`. The code wins, per Step 9. Correcting the header is
    outside this slice's declared purpose and is the human's to schedule.

13. **The byte surgery was done with a scratch script, not an inline evaluation.**
    A raw NUL cannot be carried reliably in an edit tool's match string, and the
    Bash hook correctly denies any inline evaluation referencing this module. The
    script lives in the scratch directory, writes nothing to the repository beyond
    the two target files, and asserts afterwards that no NUL remains.

## Execution Record

**Byte census, measured over 157 `.js` files under `src/`:** 3 raw NUL bytes in 2 files.

| file | offsets | line |
|---|---|---|
| `src/lib/approval-ledger.js` | 22911, 22969 | 422, 424 (the two hash domain separators) |
| `src/lib/plan-index/reconcile.js` | 7348 | 162 (an in-memory composite map key) |

**Golden digest.** Recorded from the UNMODIFIED code and unchanged after the repair:

```
before: 962db885f1696906a82b2aa3d35540cbbcec2038db9238286fc013bdd0dadcc7
after:  962db885f1696906a82b2aa3d35540cbbcec2038db9238286fc013bdd0dadcc7
```

**Corpus verification.** 290 ledger entries on disk; 163 have a live plan. Each was
verified under BOTH the original module (read out of git, never written to the
repository) and the repaired one:

```
entries compared:            163
  specification-scope:       15 (verdict changed: 0)
  file-scope (legacy):       148 (verdict changed: 0)
spec digest identical:       163/163
TOTAL CHANGED VERDICTS:      0
every plan on disk, spec digest identical: 303/303
```

43 entries do not verify, every one of them legacy `file`-scope. Those are
pre-existing: whole-file semantics invalidate on the execution log the executor
writes into the plan, which is the documented reason the specification scope exists.
Their verdicts are identical before and after this change, so none of them is a
consequence of it.

**Searchability, measured with the same search that failed at planning time.**
A project-wide search for `require(` under `src/` returned 139 files before and
returns 141 now; both previously invisible files are among them, and a search for
`writeSufficiencyEntry` now returns real lines at 91, 640 and 978 in the ledger and
at 417 in `src/lib/streaming-gate.js`.

**Documented test-file count:** 433 → 434, corrected in both places from the live
count on disk.

**Step 14 numbers, verbatim:**

```
ℹ tests 10101
ℹ suites 1742
ℹ pass 10101
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 19097.792417
[CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

**What this slice still does NOT fix**, restated: it makes nothing else searchable
beyond the two files repaired here; it changes no approval semantics; it re-hashes
and migrates no existing ledger entry; it adds no pre-commit or hook-level guard
against a newly written NUL byte, so the fence catches one only at the gated run;
and it addresses none of the other tracked false-green sites in the baseline.
