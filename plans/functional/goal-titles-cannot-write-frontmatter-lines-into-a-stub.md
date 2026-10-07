---
title: "A goal title cannot write extra frontmatter lines into a functional stub"
type: implementation
created: 2026-10-05
priority: medium
effort: small
depends_on: none
files:
  - src/lib/vision-decomposer.js
  - tests/vision-decomposer-coverage.test.js
---

# A goal title cannot write extra frontmatter lines into a functional stub

## Problem Statement

When a vision is broken into functional plans, the session runs `createStub` in `src/lib/vision-decomposer.js` (through `node -e`, on the vision-decomposer agent's recommendation). It writes each goal's title into the stub's frontmatter as `title: "${goal.title}"` (line 182) with no escaping. A title holding a quote and a line break therefore writes extra frontmatter lines. The review of the tool-grants work produced an extra `approved_by: human` line this way. The same title is also written unescaped as the stub's `# ` heading (line 191). The dependency names (line 188) and the vision reference (line 185) get the same treatment, as do `mergeStubs`'s merged name (lines 378 and 387) and its copied `parent_vision` (line 381).

This hurts the owner in two ways. Every reader of a plan's frontmatter believes these lines: its type, status, parent, declared files and dependencies. And one reader, the stale-plan cleanup screen, shows a forged `approved_by` line to the owner as approval evidence and offers a one-click move of that plan to done (see "Severity" below).

Fixed means: every value written into a stub's frontmatter or heading is a single line, so a title can never start a new line. Quotes inside a title survive the round trip through CTOC's own readers unchanged.

The same file also produces an empty or degenerate file name when a title has no Latin letter or digit. `slugify` returns `''`, so `createStub` writes `<vision>-.md` and `mergeStubs` writes `plans/functional/.md`. That is the stub library's copy of the empty-name defect planned for vision files in `vision-file-names-and-planning-agent-orders.md`. It is fixed here because it lives in this file, and that plan reuses this `slugify`.

## Scope

This plan changes `src/lib/vision-decomposer.js` (`createStub`, `mergeStubs`, `slugify`, and one new internal helper) and adds cases to `tests/vision-decomposer-coverage.test.js`. On the recommended answer to the owner question below, it also stops `mergeStubs` from deleting its own result. It does not change the stale detector's trust of a frontmatter `approved_by` line; that is reported under "Neighbours" for the owner to schedule.

Written by the implementation planner on 2026-10-05. Everything below was read from files in this repository; nothing was run. Claims are labelled **read**, **believed** or **to verify**.

## What was verified, and how

### The injection

- **read**: `createStub` (lines 150-214) builds the stub with a template string. `goal.title` goes into `title: "…"` (line 182) and `# …` (line 191). `goal.dependsOn` is joined into `depends_on: "…"` (line 188). `vision/<basename>` goes into `parent_vision: "…"` (line 185). None of these is escaped.
- **read**: CTOC's frontmatter readers are line-based. `state.parseFrontmatterLines` (state.js lines 159-212) splits on line breaks, takes the text before the first colon as the key, and strips one surrounding quote at each end (line 205). `stale-detector.extractFrontmatterRegion` and `frontmatter.parseFrontmatter` also split on line breaks. A title containing a line feed therefore ends the `title:` line; the text after it is read as further keys, and a later duplicate key overrides an earlier one (state.js lines 155-157).
- **read**: `package.json` has no YAML parser dependency, so there is no stricter reader whose escaping rules the fix must also satisfy.

### Severity — who trusts a frontmatter `approved_by` line

Each reader below was found with a text search for `approved_by` and `approvedBy` across `src/`, then read in context.

- `src/hooks/human-gate-check.js` decides whether a plan may sit in a gate destination with `classifyResidency` from `src/lib/approval-residency.js`. That function reads only the ledger entry in `.ctoc/approvals/<slug>.json`, which agents cannot write. It looks up the entry, checks its edge, then (in `todo/` and `done/`) its content hash, then its provenance (approval-residency.js lines 160-238). Its docstring states "Never trusts the plan-body `approved_by: human` marker", and the hook's header (lines 12-17) says the same. A stub also lives in `plans/functional/`, which is not a gate destination at all (`gate-order.GATE_DESTINATIONS` is implementation, todo, done), so the sweep never looks at it. **read**
- `src/lib/plan-coverage.js` (write permission) asks `isApprovedForCoverage`, which calls the same `classifyResidency` and scans only `todo/` and `in-progress/`. **read** (approval-residency.js lines 272-289)
- `src/lib/iron-loop-enforcer.js` `checkGateDestinationsApproved` calls `classifyResidency` (lines 400-428; the comment at 400-409 records that the frontmatter is no longer trusted). **read**
- `src/lib/actions.js` writes the marker (`addApprovalMarker`, line 272) and the ledger entry (line 359). No read of the marker as an approval was found. **read**
- `src/lib/plan-validator.js` deliberately does not check the marker (lines 975 and 1019). **read**
- **`src/lib/stale-detector.js` does trust it.** `verifyStaleCandidate` reads `approved_by` from the plan's own frontmatter (lines 514-525). `classifyStaleCandidate` uses it three times (lines 806, 824, 834). A stub is in a scanned stage: `GATE_SOURCE_STAGES` is functional, implementation and review (line 148). For such a plan, a present `approved_by` value does three things. It takes the plan out of "not started, benign". It rules out "dead-on-arrival", so the cleanup screen never offers to revert the plan. And when the plan's declared files changed after it entered its stage, it classifies the plan "approved-but-stranded". That category's cleanup action, "reconcile" (`menu-screens.js` line 70 → `stale-cleanup.reconcilePlan` → `_stampAndArchive`), moves the plan straight to `plans/done/` with a pipeline-kind ledger entry when the owner clicks it. The evidence line the screen shows reads `approved_by: human` (`buildEvidenceLines`, line 709). **read**

**Severity, sized from that.** No gate is crossed automatically and no write permission is granted: every enforcing reader consults the ledger. The forged line deceives one reader, the stale-plan cleanup screen. That screen presents the line to the owner as approval evidence and offers a one-click move to done that skips three approvals. Reaching the move also needs a `files:` list in the stub, which the same injected title can write, plus git history for the stub and a later change to a declared file. That chain was traced by reading, not reproduced (**to verify** at Step 9). Rating: medium as a deceptive display on a human-confirmed, approval-skipping action; low as an automatic forgery. Separately, the injection lets a title write any other key every frontmatter reader believes: `type`, `status`, `parent_plan`, `files`, `depends_on`.

The stale detector's trust of the frontmatter line does not depend on this injection. Any agent holding Write can put that line into a plan file directly, because `plans/**.md` is on the edit whitelist. That is why it is listed as a separate neighbour rather than fixed by escaping.

### The empty file name, and the merge that deletes its own result

- **read**: `slugify` (lines 130-136) keeps only `[a-z0-9]`. A title written only in non-Latin letters or symbols gives `''`. `createStub` then writes `<vision>-.md` (`baseSlug` line 160), a second such goal writes `<vision>--2.md`, and `mergeStubs` writes `plans/functional/.md` (line 374). `decomposeVision` slugifies the vision's own file name (line 226); a vision file named `.md` gives an empty vision slug and stub names starting with `-`.
- **read**: the approval ledger keys a plan by its file name and accepts only `^[a-z0-9][a-z0-9-]*$` (`approval-ledger.SLUG_RE`, line 137). A name that is empty or starts with `-` is refused with "Invalid slug" (`ledgerPath`, lines 161-171). The residency check reports `ledger-unkeyable`, so such a plan can never be approved.
- **read**: `mergeStubs` (lines 348-411) computes `plans/functional/<merged-slug>.md` with no existence check (lines 373-375). It writes the merged stub (line 399), then removes every original (line 405). When the merged name gives the same file name as one of the stubs being merged, the merged result is the file that gets deleted. When it gives the name of an unrelated existing stub, that stub is overwritten. `createStub` already avoids both with a `-2`, `-3` loop (lines 161-173).

## Implementation Details

### `src/lib/vision-decomposer.js`

1. **One internal helper**, beside `slugify`:

   ```js
   /**
    * One line of frontmatter or heading text. Every character a reader could split a
    * line on (line feed, carriage return, the Unicode line and paragraph separators)
    * and every other control character becomes one space, so a value can never start
    * a new frontmatter line. Quotes are kept: CTOC's frontmatter readers are line-based
    * and strip only the outer pair, so an inner quote round-trips unchanged.
    * @param {*} value
    * @returns {string}
    */
   function oneLine(value) {
     return String(value == null ? '' : value)
       .replace(/[\x00-\x1f\x7f-\x9f  ]+/g, ' ')
       .trim();
   }
   ```

   `no-control-regex` is off for this repository (stated in `src/lib/step-13-verify.js` lines 91-93, and the same character class is used in `src/lib/tui.js` line 37), so the literal passes the linter. It is not exported: both callers live in this file.

2. **`createStub`**: compute `const title = oneLine(goal.title)` once and use it for the slug, the `title:` line and the `# ` heading. Each dependency name goes through `oneLine` before the join. The vision reference becomes `oneLine(\`vision/${visionBasename}\`)`. `goal.scope` is body text under `## Problem Statement` and stays multi-line. It cannot reach the frontmatter, because the leading region ends at the `# ` heading line.

3. **`mergeStubs`**: `const name = oneLine(mergedName)` is used for the slug, the `title:` line and the heading, and `parent_vision` goes through `oneLine`.

4. **`slugify`**: end with `|| 'untitled'`, so a title with no Latin letter or digit gives the name `untitled`. `createStub`'s existing loop then gives `untitled-2`, `untitled-3`, and so on. The 60-character cap is unchanged.

5. **`mergeStubs` no longer overwrites or deletes its own result** (on the recommended answer to the owner question):

   ```js
   const merging = new Set(stubPaths.map((p) => path.resolve(p)));
   let fileName = `${mergedSlug}.md`;
   let filePath = path.join(functionalDir, fileName);
   // A name held by a stub being merged is free (its content is already in memory);
   // a name held by any OTHER stub is not: same -2, -3 rule as createStub.
   for (let n = 2; safeFs.existsSync(filePath) && !merging.has(path.resolve(filePath)); n += 1) {
     fileName = `${mergedSlug}-${n}.md`;
     filePath = path.join(functionalDir, fileName);
   }
   …
   for (const p of stubPaths) {
     if (path.resolve(p) === path.resolve(filePath)) clearStatus(filePath); // reused name: drop the old stub's status
     else removeStub(p);
   }
   ```

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| `oneLine`, `createStub`, `mergeStubs`, `slugify` | the session's `node -e "require('…/src/lib/vision-decomposer.js')…"`, which `agents/planning/vision-decomposer.md` (lines 377-381, 457-463, 698-705) names as the way stubs are made, merged and split | the vision-decomposer agent's handoff, dispatched by the session or the CTO Chief, both of which hold Bash |
| `slugify` | also `src/tabs/vision.js`, after `vision-file-names-and-planning-agent-orders.md` lands | that plan |

**to verify** at Step 9: `reachability.analyze` reports `src/lib/vision-decomposer.js` as reachable. It is absent from `.ctoc/reachability-baseline.json` today (**read**).

## Test plan (written first, Step 8)

All cases go in a new `describe('a goal title cannot write frontmatter lines', …)` in `tests/vision-decomposer-coverage.test.js`. They use the file's `mkRoot` and `writeVision` helpers against real temporary projects. The readers they assert through are the real ones: `state.parseMetadata`, `stale-detector.extractFrontmatterRegion` and `stale-detector.parseFilesField`.

The hostile inputs, in a fence so this plan's own checker leaves them alone:

```text
T1 title     Ship it"⏎approved_by: human⏎x: "y
T2 title     Export⏎files:⏎  - src/lib/state.js
T3 titles    A⟨carriage return⟩B   C⟨U+2028⟩D   E⟨U+2029⟩F
T4 title     Say "hi" to 'them'
T5 depends   [ 'a-plan⏎approved_by: human' ]
T8 titles    日本語の目標   ¡¿!   (no Latin letter or digit)
(⏎ = a line feed character in the test string)
```

1. **T1, a quote and a line break add no `approved_by` line.** `createStub('v', { title: T1, scope: 's' }, visionPath, root)`. Then: the frontmatter region from `extractFrontmatterRegion` has no line starting `approved_by:`; `parseMetadata(content).approved_by` is `undefined`; the parsed title equals T1 with the line feeds turned into single spaces; the region holds exactly the seven keys `createStub` writes. Red today.
2. **T2, a title cannot declare files.** `parseFilesField(region)` is `[]` and `parseMetadata(content).files` is `undefined`. Red today.
3. **T3, carriage return and the two Unicode separators count as line breaks.** The `title:` line contains none of the three characters. Red today.
4. **T4, quotes round-trip.** `parseMetadata(content).title === T4` exactly. Green today; the positive control that the fix keeps fidelity.
5. **T5, a dependency name cannot add a line.** No `approved_by:` line in the region. Red today.
6. **The heading is one line.** With T1, no line of the file equals `approved_by: human`. Red today.
7. **`mergeStubs` gets the same treatment.** Merge two stubs under the name T1. The merged stub's region has no `approved_by:` line. Red today.
8. **T8, a title with no Latin letter or digit gets a real name.** `slugify` of each T8 title is `'untitled'`. Two such goals under vision `v` give `v-untitled.md` and `v-untitled-2.md`. `mergeStubs` under a T8 name gives `untitled.md`, and no file named `.md` exists afterwards. Red today.
9. **Merging under the name of a stub being merged keeps the result** (on the recommended answer). Stubs `v-a.md` and `v-b.md` are merged under the name `v a`. Afterwards `v-a.md` exists and holds both scopes, and `v-b.md` is gone. Red today: the merged file is deleted.
10. **Merging under the name of an unrelated stub leaves it alone** (on the recommended answer). Stub `v-c.md` exists and is not being merged; the merge is under the name `v c`. `v-c.md` is byte-identical afterwards and the merged stub is `v-c-2.md`. Red today: `v-c.md` is overwritten.
11. **The existing collision case still passes.** The suite's existing "persists BOTH goals when their titles slugify to the same value" case is unchanged.

## Security review

- **The injection is closed at the writer**, for every value the writer takes from a caller: title, dependency names, vision reference, merged name, copied parent. The scope stays body text and cannot reach the frontmatter region.
- **Failing direction**: a hostile value becomes visible text on one line. It is never dropped silently, and never rejected with a throw that would abort a whole decomposition halfway.
- **The fallback name passes the ledger's key rule** (`untitled`, `untitled-2`), so a plan with a non-Latin title can still be approved.
- **No path is built from a title** beyond `slugify`'s `[a-z0-9-]` output, which cannot hold a separator or `..`.
- **`mergeStubs` stops destroying data**: it no longer overwrites an unrelated stub and no longer deletes its own result.

## Acceptance criteria

1. No goal title, dependency name, vision file name or merged name can add a line to a stub's frontmatter. The forged `approved_by: human` line from the review cannot be produced.
2. A title containing quotes round-trips unchanged through `state.parseMetadata`.
3. A title with no Latin letter or digit gives a file named `…untitled.md` (then `-2`, `-3`), never `.md` or a name ending in `-.md`, and the name passes `approval-ledger.SLUG_RE`.
4. On the recommended answer: `mergeStubs` never deletes its own result and never overwrites a stub it was not asked to merge.
5. `npm test` passes: fail 0, skipped 0, coverage at or above the floor. The linter reports zero warnings on `src/lib/vision-decomposer.js`.

## Questions for the owner

### Should this plan also stop the stub merge from deleting its own result?

While reading `mergeStubs` to apply the escaping, a data-loss defect turned up in the same function. Merging stubs under the name of one of those stubs deletes the merged stub. Merging under the name of any other stub overwrites it.

- **Recommended: (a) include it here.** It is the same file, the fix reuses the no-overwrite rule `createStub` already uses, and it adds about ten lines plus test cases 9 and 10. Leaving it means the next merge that reuses a stub's name silently loses that stub's content.
- (b) Leave it out of this plan and record it as a separate defect. This plan then drops implementation item 5 and test cases 9 and 10.

## Decisions Taken Under Ambiguity

1. **Single-line, not escape.** A value is made one line rather than escaped with backslashes. CTOC's frontmatter readers do not unescape: a stored `\"` would be shown to the owner with its backslash, while a kept `"` round-trips because only the outer quote pair is stripped. Strict YAML validity for a title holding a double quote is not a goal; no reader of these files is a YAML parser (`package.json` has none).
2. **The fallback name is `untitled`.** Keeping non-Latin letters in file names was considered and set aside. The approval ledger accepts only `[a-z0-9-]` keys (`SLUG_RE`), which is also its path-traversal guard. Widening a security predicate to fix a naming defect is the wrong trade, and macOS and Linux file systems also normalise Unicode file names differently. A short fingerprint of the title was considered too; it is just as unreadable as `untitled` and adds code.
3. **`oneLine` stays internal**, because both callers are in this file. `src/tabs/vision.js` reuses `slugify`, not `oneLine`.
4. **A merge that reuses a merged stub's name clears that stub's status file**, because the status belonged to the old content.

## Neighbours (seen, not built here; scheduling is the owner's)

- **The stale-plan cleanup trusts a frontmatter `approved_by` line** (stale-detector.js lines 524-525, used at 806, 824 and 834). Any agent with Write can put that line into a plan under `plans/`, so a never-approved plan can be shown as approved and offered a one-click move to done. The consistent fix is for `verifyStaleCandidate` to ask `approval-residency.classifyResidency` for the plan's real edge, the same predicate the approval sweep uses. Not planned; the owner decides when.
- **`listStubs` matches the parent vision by substring** (`parentVision.includes(visionSlug)`, line 306). A vision named `export` also lists the stubs of `export-csv`. The `untitled` fallback makes this more likely for non-Latin titles (`untitled` also matches `untitled-2`). This defect existed before this plan.

## Execution Plan

### Step 8: TEST
- [ ] Write test cases 1 to 10 in `tests/vision-decomposer-coverage.test.js` (cases 9 and 10 only on the recommended answer).
- [ ] Run `node --test tests/vision-decomposer-coverage.test.js`. Expect RED on cases 1, 2, 3, 5, 6, 7, 8, 9 and 10, and GREEN on 4 and 11. Record the failing lines.

### Step 9: PREPARE
- [ ] Reproduce the forgery end to end in a scratch git repository. Write a stub through `createStub` with a title that injects `approved_by: human` and a `files:` list naming a real file, commit it, commit a change to that file, then run `stale-detector.verifyStaleCandidate` and `classifyStaleCandidate` on it. Record the category and the evidence lines in full. This confirms or corrects the severity above.
- [ ] Run `reachability.analyze` on the repository and record that `src/lib/vision-decomposer.js` is reachable.
- [ ] Record `node --version`.

### Step 10: IMPLEMENT
- [ ] `src/lib/vision-decomposer.js`: `oneLine`; `createStub` and `mergeStubs` use it for every frontmatter and heading value; `slugify` falls back to `untitled`; `mergeStubs` uses the no-overwrite loop and keeps its own result (on the recommended answer).
- [ ] Run `node --test tests/vision-decomposer-coverage.test.js tests/cache-freshness.test.js`. Expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff. It should attack any remaining unescaped value in either template, the merge loop's handling of a name held by a merged stub, and whether test 4 really proves fidelity.

### Step 12: OPTIMIZE
- [ ] Compute each one-line value once per call and reuse it for the slug, frontmatter and heading.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff. Confirm no frontmatter key can be injected through any parameter, no path is built from unsanitised input, and the fallback passes the ledger key rule.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Run `npm run lint`: zero warnings.

### Step 15: DOCUMENT
- [ ] Write the JSDoc for `oneLine`, and update the JSDoc of `slugify` (the fallback) and `mergeStubs` (the no-overwrite rule).

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full, the stub `createStub` writes for the T1 title before and after the change.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.
