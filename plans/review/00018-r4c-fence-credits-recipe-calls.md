---
title: "R4-C — The fence credits a CALL, not a fenced block: recipe invocations are live, prose is not"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00017-r4b-fence-real-placebos-dead
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/reachability.js"
  - ".ctoc/export-reachability-baseline.json"
  - "tests/export-reachability.test.js"
  - "tests/reachability.test.js"
---

# R4-C — A recipe call is a caller; a prose mention is not

R4-B fixed the prose-disarms-the-fence hole by requiring surface mentions to
be in FENCED code blocks. That over-corrected: CTOC's instruction surfaces
invoke library functions with INLINE code, not fenced blocks. Verified on disk
(the shipped command surface is `src/commands/start.md`, not `menu.md` — there is
no `menu.md` command surface; the earlier citations were wrong):

- `approveSubplans(parentSlug, 'review')` — the Gate 3 `done-all` gate, start.md:50
- `declineComplianceRegime(process.cwd())` — compliance decline, start.md:68
- `dismissStale(process.cwd(), candidates)` — a real `node -e`, start.md:67
- `completeVision(visionPath)` — Gate 0 archive, vision-decomposer.md:468

R4-B baselined all four (and 20 siblings) as DEAD. They are NOT dead — they
are reachable by the documented mechanism (the session model reads the recipe
and calls the function). A baseline that calls the Gate 3 gate "dead" hides
exactly the kind of gate-deletion the fence exists to catch.

The distinguishing signal is call syntax, not formatting:
- LIVE-via-recipe: `name(` (an invocation) or `require('…').name` — the model runs it.
- NOT a caller: a bare `name` token in prose (`completeTaskPlan → completeExecution`).

`completeExecution` is named in surfaces ONLY as a bare token (never
`completeExecution(`), so under the correct rule it is STILL credited only by
its code edge — the R4-B re-catch survives: delete the
menu-screens→completeTaskPlan→completeExecution code edge and it goes dead even
though prose names it.

## Implementation Details

1. **Surface credit = invocation, not block.** In `reachability.js`, the
   instruction-surface usage rule changes from "name appears in a fenced code
   block" to "name appears as a CALL": a regex match of the export identifier
   immediately followed by optional whitespace and `(`, OR inside a
   `require(<string>).<name>` / `require(<string>)[<'name'>]` expression. A bare
   identifier token (word boundary, not followed by `(`) does NOT count — that
   is the prose case R4-B correctly rejected. Keep the comment-lexer fix and the
   file-path/basename rules R4-B added; this changes ONLY the surface-usage
   predicate for exported NAMES.
2. **Re-run and re-seed.** After the change, re-run `analyzeExports` and DIFF.
   The 24 recipe-invoked exports must move OUT of the dead set (they are now
   credited by their `name(` call). `completeExecution` must STAY live via its
   code edge (assert it). Any export that is STILL dead (bare-prose-only or no
   caller at all) stays baselined. Lower `maxDead` to the new true count and
   record the diff in the baseline provenance.
3. **The re-catch must survive — prove it.** A test fixture: an export named in
   a surface as a bare token (no paren) AND with no code caller → DEAD; the same
   export invoked as `name(` in a surface → LIVE. This is the exact
   completeExecution-vs-prose distinction; if it does not hold, the rule is
   wrong.

### Wiring — the live call sites (MANDATORY)
`analyzeExports` is already consumed by `tests/export-reachability.test.js` (the
ratchet) and `iron-loop-enforcer.js checkDeadExportFence` (READ-ONLY here — do
not edit it). No new export.

### Test Plan (TDD-Red first)
export-reachability.test.js / reachability.test.js:
- A prose-only bare-token mention → DEAD (unchanged from R4-B; must stay).
- A `name(` call in an INLINE-code recipe (single backticks, not fenced) → LIVE
  (fails today under fenced-only).
- A `require('./x').name` reference in a recipe → LIVE.
- `completeExecution`: live via code edge; delete the intra-file call in the
  fixture + leave the prose bare mention → DEAD (re-catch preserved).
- The real repo: `approveSubplans`, `declineComplianceRegime`, `dismissStale`,
  `completeVision` are all LIVE (not in the baseline). Assert by name — a
  regression that re-buries the Gate 3 gate as dead must fail this test.
- Baseline count moved only DOWN vs R4-B's 126; the ratchet stays honest.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the two named files, record red.
### Step 9: PREPARE — read reachability.js in full (R4-B's current version on
disk), and grep menu.md/agents for the call-syntax vs prose forms so the regex
matches reality, not a guess.
### Step 10: IMPLEMENT — item 1; re-seed the baseline (item 2).
### Step 11: REVIEW — DIFF the dead set before/after; every export that left
the dead set must have a real `name(` or `require().name` in a surface or code
(list them); every export that stayed must be genuinely caller-less.
### Step 12: OPTIMIZE — one pass over surfaces; regex only.
### Step 13: SECURE — the regex must not be ReDoS-prone (bounded, no nested
quantifier over untrusted-length input); surfaces are repo files but keep it
linear.
### Step 14: VERIFY — node --test on the two files + eslint; no git.
### Step 15: DOCUMENT — reachability.js header states the rule precisely: a
surface CALL (`name(` / `require().name`) is a caller; a bare prose token is
not; a test is never a caller.
### Step 16: FINAL-REVIEW — report: the before/after dead diff, the four gate
exports proven live, the re-catch fixture proving completeExecution still dies
when its code edge is cut.

## Decisions Taken Under Ambiguity

1. **Full-text surface scan, no fenced/inline gating.** The new predicate scans
   the entire surface text for call syntax rather than restricting to code spans.
   Rationale: over-crediting a name as live is the fence's SAFE bias (it never
   cries wolf; the forbidden direction is a false DEAD). A prose sentence that
   happens to contain `name (` reads as a caller — acceptable. The one name that
   MUST stay dead, `completeExecution`, is safe regardless: its surface mentions
   are `` `completeExecution` (`src/lib/actions.js`) `` — a backtick sits between
   the identifier and the paren, so `name\s*\(` does not match. Verified.
2. **`src/lib/ui.js#doctor` revealed as pre-existing dead → baselined as debt.**
   R4-B falsely credited `doctor` LIVE via unrelated fenced tokens (`clinic
   doctor`, `mix doctor` in skill docs). Under call syntax that false credit is
   gone, exposing `doctor` (a UI formatter with zero callers — `doctor(` is only
   its own definition; `app.doctorInput` is an unrelated input buffer). It is
   genuine pre-existing debt, not a regression I introduced. Wiring/deleting it
   would touch `ui.js`/`menu.js`, outside this plan's touch-scope, so it is
   recorded in the baseline with provenance and FLAGGED TO THE HUMAN for wiring
   or deletion. Net count still drops 126 → 104 (ratchet honored).
3. **Separate require-property regex from the call regex.** `require('./x').name`
   without an immediate paren (`const f = require('./x').name; f()`) is a real
   reference the recipe runs; the `name(` regex alone would miss it, so a
   dedicated `require('…').name` / `require('…')['name']` pattern credits it.
4. **23 exports left the dead set, not the plan's estimated "24".** The estimate
   was pre-count; the true set credited by call syntax is 23 (each with a verified
   surface `name(` or `require().name` site). Plus `doctor` revealed → 104.

## Execution Status (Steps 8–16) — COMPLETE
- [x] Step 8 TEST — 5 R4-C tests written; ran red (INLINE call, require().name, RE-CATCH call-half, REAL REPO failed; BARE-prose→DEAD passed as designed).
- [x] Step 9 PREPARE — read reachability.js in full; grepped surfaces for real call forms (`approveSubplans(`, `s.dismissStale(`, `require('…').writeActiveProfiles(`, bare `` `completeExecution` ``).
- [x] Step 10 IMPLEMENT — replaced `surfaceExecutableTokens` (fenced-block membership) with `surfaceCalledNames` (call syntax: `name(` + require-property); re-seeded baseline 126 → 104.
- [x] Step 11 REVIEW — diffed dead set; 23 left (all with verified surface call sites), 1 (`doctor`) genuinely dead & baselined; completeExecution re-catch preserved.
- [x] Step 12 OPTIMIZE — single pass per surface file, three precompiled global regexes.
- [x] Step 13 SECURE — regexes bounded/linear (disjoint char classes, quote-delimited strings, no nested quantifiers) → ReDoS-safe.
- [x] Step 14 VERIFY — `node --test` both named files: 21 pass, 0 fail, 0 skipped; eslint clean; consumers (iron-loop-enforcer, actions-dead-exports-guard) 27 pass.
- [x] Step 15 DOCUMENT — header "WHAT COUNTS AS A CALLER" rule 3 + `surfaceCalledNames` doc state the call-vs-citation rule precisely.
- [x] Step 16 FINAL-REVIEW — before/after diff, four gate exports proven live by name, completeExecution re-catch proven, in the executor report.

## Supersession note (record reconciled to disk, 2026-07-27)

The numbers in the Execution Status and "Decisions Taken Under Ambiguity" above are
this plan's ORIGINAL claims and are kept as history. Disk has since moved on and the
record is reconciled here so nothing false lands in `done/`:

- **Baseline count.** R4-C's own re-seed brought the dead-export baseline to 104.
  Later ratchets moved it further DOWN (the ratchet is honored throughout): the
  current `.ctoc/export-reachability-baseline.json` records `maxDead: 68`. The
  headline "104" above is R4-C's snapshot, not today's floor.
- **`src/lib/ui.js#doctor` is no longer a human action-item.** R4-C FLAGGED `doctor`
  for wiring-or-deletion. It was subsequently RESOLVED BY DELETION (recorded in the
  baseline provenance as "R6-C: src/lib/ui.js#doctor RESOLVED by DELETION"). Do NOT
  re-action the wire-or-delete-doctor flag — it is closed.
- **Dependency on R4-B recorded.** `depends_on` is now
  `00017-r4b-fence-real-placebos-dead` (was `none`). R4-C shares
  `src/lib/reachability.js` with R4-B and explicitly PRESERVES R4-B's comment-lexer
  and file-path/basename rules while replacing only the surface-usage predicate, so
  the declared graph now matches reality; an individual gate or revert of R4-B can no
  longer silently strand R4-C's assumption.

## Rework (review kickback, 2026-07-27)

Adversarial review of the review→done crossing raised six findings; each verified
against source and dispositioned:

1. **CRITICAL — re-catch guard on the real object.** The fence's motivating
   guarantee (cut the `completeTaskPlan → completeExecution` code edge → it goes
   DEAD) was proven only on a synthetic fixture; the real-repo test asserted
   `completeExecution` LIVE but not that it is live ONLY via its code edge, so a
   future doc writing `completeExecution(` would surface-credit it and silently
   disarm the re-catch with the suite green. FIXED: `analyzeExports` now returns
   `surfaceCalled` (the sorted set of names a shipped surface CALLS — the same
   signal the classifier reads), and a new guard test asserts `completeExecution` is
   NOT in it (turning a future disarm into a RED test) AND that the five recipe-
   invoked gate exports ARE in it (the credit half). TDD: seen red (field absent),
   then green.
2. **IMPORTANT — run the gated `npm test`.** Step 14 originally ran only
   `node --test` on the two files, which bypasses the coverage floor and the
   zero-skipped gate. FIXED: the enforced `npm test` gate was run to green (see
   VERIFY below).
3. **IMPORTANT — stale FINAL-REVIEW record.** Reconciled in the supersession note
   above (104 → current maxDead 68; `doctor` resolved by deletion, flag closed).
4. **IMPORTANT — declared dependency on R4-B.** Recorded in frontmatter
   (`depends_on: 00017-r4b-fence-real-placebos-dead`).
5. **LOW — stale comment / citation / silent-catch.** (a) `reachability.js` line
   ~820 still called the surface rule "a FENCED instruction-surface recipe" (R4-B
   language) — corrected to the call-syntax rule. (b) The plan cited `menu.md`; the
   real surface is `src/commands/start.md` — corrected above. (c) `surfaceCalledNames`
   swallowed an unreadable surface with `catch { continue }`, against the module's
   fail-loud discipline — replaced with `readOrThrow`, matching its twin in
   `liveRoots`.
6. **CRITICAL (gate ruling: SEND BACK).** The meta-verdict; all four constituent
   gaps closed by items 1–5, so the object that lands in `done/` is a fence proven
   on its own motivating object, verified by the enforced gate, with a record that
   matches disk.
