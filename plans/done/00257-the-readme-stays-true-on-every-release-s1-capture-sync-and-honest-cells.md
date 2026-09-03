---
iron_loop_verdict: true
title: "Refresh the dashboard capture, sync the README's version + counts from the generator, and delete the false staging claim"
type: implementation
iron_loop: true
parent_plan: the-readme-stays-true-on-every-release
depends_on: none
priority: high
effort: small
files:
  - README.md
  - src/scripts/release.js
  - src/lib/version.js
  - tests/release-script-coverage.test.js
  - tests/version.test.js
  - tests/readme-numbers.test.js
approved_by: human
approved_at: 2026-09-03T11:06:15.181Z
gate_crossed: review → done
---

# Refresh the dashboard capture, sync the README's version + counts from the generator, and delete the false staging claim

One slice. The README text, the two sync modules and the three test files are a
single unit: the derived pins are red until BOTH the text and the machinery land.

Everything below was read on disk on 2026-09-03. Line numbers drift — every
anchor is given as a quoted string as well.

---

## Implementation Details

### Dependency graph (this slice only)

```
src/lib/doc-counts.js  (unchanged, the ONE count generator)
        │
        ├── src/scripts/release.js   COUNT_UPDATES gains a `files:` field
        │        │                    updateDocCountsInFile (new shared body)
        │        │                    updateDocCountsInClaudeMd (thin wrapper, unchanged contract)
        │        │                    updateDocCountsInReadme  (new thin wrapper)
        │        │                    VERSION_UPDATES gains the capture-line pattern
        │        └── main() calls the README count sync  ← the live call site
        │
        ├── src/lib/version.js  syncToReadme mirrors the capture-line pattern
        │
        └── README.md   capture block · promise sentence · staging cell · counts

tests/release-script-coverage.test.js → drives release.js (real functions, tmp fixtures)
tests/version.test.js                 → drives syncToReadme (fixture + tracked README)
tests/readme-numbers.test.js          → derived pins over the tracked README
```

No new files, so no counted artifact is created and `CLAUDE.md` is deliberately
NOT in `files:`.

---

### File 1 — `README.md` (MODIFY, four edits)

#### Edit 1.1 — the Lesson 2 dashboard capture (fenced block, currently opens `CTOC v6.14.36`)

Anchor: the fenced block that follows the sentence
`**Worked example.** The classic pipeline overview (\`Open the dashboard\` on the first screen) of a busy project — this is a real capture of the CTO Chief repository itself:`
(README ~line 135; the block runs ~137–168).

**Take the capture again at build time and paste its bytes verbatim.** Run
`node src/commands/start.js dashboard` from the repository root and paste the
output between the existing fences. A capture is real bytes; do not hand-assemble
one and do not "tidy" the spacing. The ONE requirement on the pasted text is that
its first line reads `CTOC v<the literal contents of VERSION>` — today `6.14.63`.

The capture taken this session (the planner reconstructed this block from the
dispatch brief's prose summary — it is the expected SHAPE and the expected values,
not guaranteed byte-verbatim; the freshly re-taken output wins):

```
CTOC v6.14.63
────────────────────────────────────────────────────────────

▼ Business (2)
    Vision         2
    Canvas         0
    Functional     0

▼ Implementation (4)
    Implementation 4
    Todo           0

▼ Execution (396)
    In progress    0
    Review         134
    Done           262

TASKS
  ⏸ 4 queued    precompute 00003-r2a-scheduler-lifecycle-honesty (waits: ready)
  ✓ 31 done → 31 awaiting review
  ✗ 1 failed    implement 00252-close-the-coverage-holes-s18-remainder-hooks-commands

INBOX
  ⊙ 1 morning question · view: inbox questions
  ⊙ 0 decisions awaiting review
  ⊙ 138 plans at gates · view: inbox gates
  ⊙ 134 possibly-stale plans
  ⊙ 31 background tasks done — awaiting review

AGENT
  ○ Idle
```

**The Lesson 2 prose was checked against the new capture and needs no change.**
Verified by reading the whole reading-guide that follows the block (README
~170–199): `**TASKS** is the background work: builds, critiques, question
precompute. Up to five run at once; a queued task tells you what it waits for.`,
`**INBOX** is what wants your attention: …`, `**AGENT** is the todo-queue runner:
idle, or building.` — every sentence is structural. The only number in the prose
is "Up to five run at once", which is the concurrency cap, not a capture value.
Do NOT expand the prose to describe the new `✗ 1 failed` row: it is out of the
parent's scope and the prose never claimed the list was exhaustive.

#### Edit 1.2 — the promise sentence (README ~line 22, end of "How to read this README")

Replace exactly:

> `Every screen you see below is a **real capture** from the current version — nothing is mocked up.`

with the parent's wording (approach item 2):

> `Every screen you see below is a **real capture** — nothing is mocked up. A capture is a snapshot of a live repository, so its plan counts show that moment; the version line always shows the current version (the release sync keeps it true).`

#### Edit 1.3 — the staging row of the Environments table

Anchor: the table under the heading `## Environments — dev / staging / prod`
(README ~849–858). Replace exactly the one row:

```
| `staging` | strict | off (manual push) | Rehearse production; auto-move to review |
```

with:

```
| `staging` | strict | off (manual push) | Rehearse production; the profile sets nothing but strict enforcement |
```

Source of truth read this session — `src/lib/settings.js` `ENVIRONMENT_PROFILES`:
`staging: { workflow: { enforcementMode: 'strict' } }` and nothing else, with the
deletion recorded in the workflow settings block: `R4-B: \`autoMoveToReview\` was
DELETED — it drove sync.moveToReviewAfterPush, a raw evidence-less rename into
review/`. The `dev` and `prod` rows are verified true and stay untouched.

#### Edit 1.4 — the structure block's test-file count

Anchor: `├── tests/           524 test files (run with \`npm test\`)` (README ~1139).
Write the number `computeDocCounts(ROOT).testFiles` reports at build time — the
generated line in `CLAUDE.md` reads **543** today, so 543 is the expected value.
Do NOT hand-pick a number: the derived pin added in test C-1 below fails on any
mismatch, and after this slice the release script rewrites the line anyway.

The sibling line `│   ├── lib/         134 JS modules …` (README ~1126) is already
true and already pinned (`readme-numbers.test.js`: `Project structure: JS modules
in src/lib (derived from disk)`); it needs no text edit, only the new sync
coverage. The `agents/ 124 agent definitions` and `skills/ 429 skill files` lines
are likewise true and pinned — see decision 3.

---

### File 2 — `src/scripts/release.js` (MODIFY)

#### Edit 2.1 — `VERSION_UPDATES` gains the capture-line pattern (append, do not reorder)

Append a fourth entry (append — `tests/remainder-hooks-commands-coverage.test.js`
line ~276 reads `release.VERSION_UPDATES[0]`, so index 0 must stay the
`**X.Y.Z**` entry):

```js
  {
    // The Lesson 2 dashboard capture's first line. A version inside a fenced
    // block is invisible to the badge/headline patterns above, so it re-rotted
    // on every release until it was named here.
    file: 'README.md',
    pattern: /^CTOC v\d+\.\d+\.\d+$/m,
    replacement: (v) => `CTOC v${v}`
  }
```

Verified: `^CTOC v\d+\.\d+\.\d+$` matches exactly ONE line in the tracked README
(the capture's first line, column 0). Non-global with `m` is correct and is what
pins the anchoring test below.

#### Edit 2.2 — one table, one loop, two wrappers (the mechanism extension)

**Decision — extend `COUNT_UPDATES` with a `files:` field rather than add a
parallel README table.** Reason: the two README lines are matched by the SAME two
regexes CLAUDE.md already uses (`/(tests\/\s+)\d+( test files)/` and
`/(lib\/\s+)\d+( JS modules)/` — both verified to match README lines 1139 and
1126). A parallel table would be a second encoding of those two patterns, and two
encodings of one rule drift — the exact failure mode this repository fences
elsewhere (one approval predicate, one gate-words module). A `files:` field is
the smaller diff *and* keeps one source of truth. It also leaves
`release.COUNT_UPDATES` iterable by field, which
`tests/remainder-hooks-commands-coverage.test.js` (line ~296,
`for (const u of release.COUNT_UPDATES) counts[u.field] = 4242;`) depends on and
which this slice may not touch.

Rewrite the table (comment kept and extended):

```js
const COUNT_UPDATES = [
  { field: 'testFiles',  label: 'testFiles',  pattern: /(Run all )\d+( test files)/,           files: ['CLAUDE.md'] },
  { field: 'testFiles',  label: 'testFiles',  pattern: /(tests\/\s+)\d+( test files)/,         files: ['CLAUDE.md', 'README.md'] },
  { field: 'libModules', label: 'libModules', pattern: /(lib\/\s+)\d+( JS modules)/,           files: ['CLAUDE.md', 'README.md'] },
  { field: 'agents',     label: 'agents',     pattern: /(agents\/\s+)\d+( agent definitions)/, files: ['CLAUDE.md'] },
  { field: 'skills',     label: 'skills',     pattern: /(skills\/\s+)\d+( skill files)/,       files: ['CLAUDE.md'] },
];
```

Extract the existing body of `updateDocCountsInClaudeMd` into a target-agnostic
function and keep the CLAUDE.md entry point byte-identical in behaviour (every
log string and every pushed failure string unchanged — two out-of-scope test
files assert them):

```js
/**
 * Rewrite the GROWING doc-count lines in one documentation file to the live
 * values. Only the integer on each matched line changes. A count line that is
 * EXPECTED for this file but ABSENT is a NAMED failure — never a silent no-op.
 * A file that is simply not present is SKIPPED, never a failure (the release
 * script is drivable against fixtures that carry no docs at all).
 */
function updateDocCountsInFile(docFile, root = ROOT, { counts, targetPath } = {}) {
  const resolved = counts || computeDocCounts(root);
  const filePath = targetPath || path.join(root, docFile);
  const updated = [];
  const failures = [];

  if (!safeFs.existsSync(filePath)) {
    console.log(`  Skip: ${docFile} (not found)`);
    return { updated, failures };
  }

  let content = safeFs.readFileSync(filePath, 'utf8');
  const original = content;

  for (const update of COUNT_UPDATES) {
    if (!update.files.includes(docFile)) continue;
    const n = resolved[update.field];
    let matched = false;
    content = content.replace(update.pattern, (_m, before, after) => {
      matched = true;
      return `${before}${n}${after}`;
    });
    if (!matched) {
      console.error(`  ERROR: ${docFile} count line for ${update.label} not found`);
      failures.push(`${docFile} (${update.label} line not found)`);
    }
  }

  if (content !== original) {
    try {
      atomicWriteFileSync(filePath, content);
    } catch (err) {
      console.error(`  ERROR: ${docFile} count sync write failed: ${err.message}`);
      failures.push(docFile);
      return { updated, failures };
    }
    updated.push(docFile);
    console.log(`  Updated doc counts: ${docFile}`);
  }

  return { updated, failures };
}

function updateDocCountsInClaudeMd(root = ROOT, { counts, claudeMdPath } = {}) {
  return updateDocCountsInFile('CLAUDE.md', root, { counts, targetPath: claudeMdPath });
}

function updateDocCountsInReadme(root = ROOT, { counts, readmePath } = {}) {
  return updateDocCountsInFile('README.md', root, { counts, targetPath: readmePath });
}
```

Export `updateDocCountsInReadme` alongside the existing exports; keep
`updateDocCountsInClaudeMd` exported with its current signature.
`updateDocCountsInFile` stays internal (reached through both wrappers).

#### Edit 2.3 — wire it into `main()`

After the existing CLAUDE.md block:

```js
  console.log('\nSyncing documented growing counts in README.md...');
  failures.push(...updateDocCountsInReadme(root).failures);
```

**Hard constraint verified on disk:** `tests/release-metadata-sync.test.js`
test 5 (`all-good fixture: main() returns 0 and subprocess status 0`) builds
fixtures with NO README at all. The skip-when-absent branch above is what keeps
that test green — it must never become a failure.

---

### File 3 — `src/lib/version.js` (MODIFY, one mirror edit)

`syncToReadme` documents itself as rewriting "the same targets the release script
(src/scripts/release.js) rewrites". Add the capture line so that sentence stays
true:

```js
  // Version token at the start of a line: **X.Y.Z** (separator-agnostic).
  const versionLine = /^\*\*\d+\.\d+\.\d+\*\*/m;
  // shields.io version badge.
  const badge = /version-\d+\.\d+\.\d+-blue/g;
  // The Lesson 2 dashboard capture's first line: `CTOC vX.Y.Z` at column 0.
  const captureLine = /^CTOC v\d+\.\d+\.\d+$/m;
```

and extend the replace chain with `.replace(captureLine, \`CTOC v${version}\`)`.

Docblock: list the capture line as target 3, and keep the FAIL LOUD clause
EXACTLY as scoped today — it fires on the absent `**X.Y.Z**` version line. Add
one sentence stating the honest split, so no reader mistakes best-effort for
enforced:

> The capture line is rewritten when present; its absence is not a fail-loud
> condition here (a README with no capture is still a syncable README). Drift of
> that line is caught red by `tests/readme-numbers.test.js`, which pins the
> capture's version against the VERSION file.

**Do not widen the fail-loud gate to the capture line.** Verified reason:
`tests/version.test.js` (`syncToReadme against a fixture README` →
`updates the version line + badge even when the separator drifted from em-dash`)
drives a fixture README that has no capture line and asserts
`result.success === true`. Widening the gate would red that test, and weakening
it is forbidden.

---

### File 4 — `tests/release-script-coverage.test.js` (MODIFY, additive)

#### 4.1 — extend the `README_AT_1_0_0` fixture (strengthening, nothing weakened)

The fixture currently carries only the three version tokens. Add the capture
line, an anchoring mid-line mention, and the two structure-block count lines:

```js
const README_AT_1_0_0 = [
  'Intro line with an inline **1.0.0** badge that is mid-line, not at column 0.',
  '**1.0.0** — the headline version at line start',
  '![v](https://img.shields.io/badge/version-1.0.0-blue) and again version-1.0.0-blue here.',
  "getVersion()       // → '1.0.0'",
  'CTOC v1.0.0',
  'A sentence mentioning CTOC v1.0.0 mid-line, which must not be rewritten.',
  '│   ├── lib/         7 JS modules (planning, the fences)',
  '├── tests/           9 test files (run with `npm test`)',
  '',
].join('\n');
```

Every existing assertion over this fixture keeps its exact meaning (they match
their own lines and the added lines are inert to them).

#### 4.2 — new cases in `describe('updateVersionInFiles — syncs every configured README pattern')`

- `should_rewrite_the_dashboard_capture_version_line` — after
  `updateVersionInFiles('2.0.0', root)`: `assert.match(out, /^CTOC v2\.0\.0$/m)`
  and `assert.ok(!out.includes('\nCTOC v1.0.0\n'))`.
- `should_leave_a_mid_line_CTOC_version_mention_untouched` —
  `assert.match(out, /mentioning CTOC v1\.0\.0 mid-line/)`. Pins the `^…$`
  anchors: dropping either would rewrite prose.

#### 4.3 — new `describe('updateDocCountsInReadme — the README structure counts come from the generator')`

Import `updateDocCountsInReadme` from `../src/scripts/release`.

1. `should_write_the_live_counts_into_the_README_structure_block` — fixture
   README as above; call
   `updateDocCountsInReadme(root, { counts: { testFiles: 543, libModules: 134 } })`;
   assert `failures` is `[]`, `updated` includes `'README.md'`, and the file now
   matches `/tests\/\s+543 test files/` and `/lib\/\s+134 JS modules/`.
2. `should_name_a_failure_when_the_README_test_count_line_is_missing` — same
   fixture with the `tests/ … test files` line removed; assert
   `failures.some((f) => f.includes('README.md') && f.includes('testFiles'))`,
   AND that the surviving lib line was still rewritten (partial progress is
   written; the failure is what makes it loud).
3. `should_skip_a_missing_README_without_reporting_a_failure` — empty root;
   assert `{ updated: [], failures: [] }`. This is the branch that keeps
   `release-metadata-sync` test 5 green; it is pinned here so a future edit
   cannot turn "absent" into "failure" unnoticed.
4. `should_leave_the_CLAUDE_only_count_lines_alone_when_syncing_the_README` —
   fixture README that also contains `Run all 9 test files` and
   `agents/          1 agent definitions`; after the README sync assert both are
   byte-unchanged and `failures` is `[]`. Pins the `files:` filter: without it
   the `Run all` entry would report a false failure on every release.

#### 4.4 — extend the existing `main()` end-to-end case (add assertions, remove none)

In `should_return_0_and_actually_rewrite_the_README_on_a_full_good_tree`, seed the
fixture so the counts are non-trivial before calling `main(root)`:

```js
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'a.test.js'), '// a\n');
    fs.writeFileSync(path.join(root, 'tests', 'b.test.js'), '// b\n');
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'lib', 'only.js'), '// only\n');
```

then add, after the existing assertions:

```js
    const readme = readText(root, 'README.md');
    assert.match(readme, /^CTOC v2\.0\.0$/m);          // capture line synced by main()
    assert.match(readme, /tests\/\s+2 test files/);    // README count sync is WIRED into main()
    assert.match(readme, /lib\/\s+1 JS modules/);
```

`assert.equal(code, 0)` stays exactly as it is.

---

### File 5 — `tests/version.test.js` (MODIFY, one additive case)

In `describe('syncToReadme against a fixture README')` (which already owns a
`tmpDir` and restores the tracked README in `before`/`after`), add:

- `also rewrites the dashboard capture line — the same targets the release script rewrites`:
  write a fixture README containing
  `'  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue">\n\n**1.0.0** · Built by someone\n\nCTOC v1.0.0\n'`;
  call `version.syncToReadme(tmpDir)`; assert `result.success === true` and the
  file matches `` new RegExp(`^CTOC v${version.getVersion().replace(/\./g, '\\.')}$`, 'm') ``.

The two existing cases stay untouched, and so does
`the tracked README still matches the version token — drift goes red, not silent`
— it asserts `success`/`matched`/`version` off the `**X.Y.Z**` token, which this
slice does not move. Confirm it green at Step 14.

---

### File 6 — `tests/readme-numbers.test.js` (MODIFY, three additive pins)

Add at the top, beside the other reads:

```js
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
```

- **C-1**, in `describe('README — explicit numeric claims match reality')`:
  `it('Project structure: test-file count (derived from disk)', () => { assert.match(README, new RegExp(\`tests/\\\\s+${counts.testFiles} test files\`)); });`
  Anchored to the structure line, so an incidental number elsewhere cannot satisfy it.
- **C-2**, same describe:
  `it('Lesson 2 capture: the version line equals the VERSION file', () => { assert.match(README, new RegExp(\`^CTOC v${VERSION.replace(/\\./g, '\\\\.')}$\`, 'm')); });`
  This is what makes the capture's freshness ENFORCED rather than promised — it
  goes red whether the sync silently stopped matching or a human pasted an old
  capture.
- **C-3**, in `describe('R2-D — instruction-surface truth')` (the home of
  withdrawn claims that must not come back):
  `it('Environments: the staging row no longer claims auto-move to review', () => { assert.doesNotMatch(README, /auto-move to review/i); });`

---

## Wiring — the live call sites

| New/changed code | Live call site | Reachable from |
|---|---|---|
| `updateDocCountsInReadme` | `main()` in `src/scripts/release.js` (new block after the CLAUDE.md sync) | `node src/scripts/release.js` — the sanctioned release root, step 2 of the release procedure in `CLAUDE.md` |
| `updateDocCountsInFile` | both wrappers (`…InClaudeMd`, `…InReadme`) | same |
| the 4th `VERSION_UPDATES` entry | the existing `updateVersionInFiles` loop, called by `main()` | same |
| `captureLine` in `syncToReadme` | `syncToReadme` → `syncAll` → `release()` in `src/lib/version.js` | the release menu path that already calls `version.release()` |

Nothing in this slice is reachable only from its tests.

---

## Test Plan (TDD-Red first)

Write and RUN these before touching `README.md`, `release.js` or `version.js`.
Each row names the assertion that fails and why it fails TODAY.

| # | Test | RED today on |
|---|---|---|
| R1 | `readme-numbers`: `Project structure: test-file count (derived from disk)` | `assert.match(README, /tests\/\s+543 test files/)` — the tracked README says `524`. |
| R2 | `readme-numbers`: `Lesson 2 capture: the version line equals the VERSION file` | `assert.match(README, /^CTOC v6\.14\.63$/m)` — the capture says `CTOC v6.14.36`. |
| R3 | `readme-numbers`: `the staging row no longer claims auto-move to review` | `assert.doesNotMatch(README, /auto-move to review/i)` — the Environments table still says it. |
| R4 | `release-script-coverage`: `should_rewrite_the_dashboard_capture_version_line` | `assert.match(out, /^CTOC v2\.0\.0$/m)` — no `VERSION_UPDATES` entry targets the capture, so the fixture line stays `CTOC v1.0.0`. |
| R5 | `release-script-coverage`: `should_leave_a_mid_line_CTOC_version_mention_untouched` | Passes vacuously before the pattern exists; it is the ANCHOR guard for R4 and must be present in the same red run so a later un-anchored `/CTOC v\d+\.\d+\.\d+/g` cannot go green. |
| R6 | `release-script-coverage`: `should_write_the_live_counts_into_the_README_structure_block` | `TypeError: updateDocCountsInReadme is not a function` — the export does not exist. |
| R7 | `release-script-coverage`: `should_name_a_failure_when_the_README_test_count_line_is_missing` | same missing export. |
| R8 | `release-script-coverage`: `should_skip_a_missing_README_without_reporting_a_failure` | same missing export. |
| R9 | `release-script-coverage`: `should_leave_the_CLAUDE_only_count_lines_alone_when_syncing_the_README` | same missing export. |
| R10 | `release-script-coverage`: the extended `main()` case | `assert.match(readme, /tests\/\s+2 test files/)` — `main()` does not call any README count sync, so the fixture line stays `9`. |
| R11 | `version`: `also rewrites the dashboard capture line` | `assert.match(after, /^CTOC v<VERSION>$/m)` — `syncToReadme` replaces only the version line and the badge. |

R5 is expected to pass before implementation. Per the standing rule, that is
accounted for, not banked: it is an anchor guard, not evidence, and it is listed
here so nobody reads its green as coverage.

### Must stay green (regression watch — none of these may be edited)

| Test | Why it is at risk |
|---|---|
| `version.test.js` → `updates the version line + badge even when the separator drifted from em-dash` | Its fixture has NO capture line. Widening `syncToReadme`'s fail-loud gate to the capture would red it. |
| `version.test.js` → `the tracked README still matches the version token — drift goes red, not silent` | The `**X.Y.Z**` token must not move. |
| `release-metadata-sync.test.js` test 5 (`main() returns 0`, subprocess status 0) | Its fixtures carry no README — the skip-when-absent branch is load-bearing. |
| `doc-counts-generated.test.js` (all three cases) | `updateDocCountsInClaudeMd` must keep its signature, its five CLAUDE.md lines, its empty-`failures` success and its `failures.some(f => f.includes('agents'))` naming. |
| `remainder-hooks-commands-coverage.test.js` → `updateDocCountsInClaudeMd names CLAUDE.md …` and the `VERSION_UPDATES[0]` case | The write-failure push must stay the bare `'CLAUDE.md'`; `VERSION_UPDATES[0]` must stay the `**X.Y.Z**` entry (APPEND the new pattern). |
| `readme-numbers.test.js` → `Project structure: JS modules in src/lib (derived from disk)` | Already derived and green; the count sync must not change the lib line's prose. |

### Step 14 VERIFY

`npm test` — `# fail 0`, 0 skipped, coverage at or above `.ctoc/coverage-baseline.json` `minPct` (99).
Every new branch in `release.js` is exercised by R6–R10 (filter, write, named
failure, skip-absent); the shared write-failure catch is already covered through
the CLAUDE.md wrapper by the remainder test, so the refactor does not add an
uncovered line.

---

## Decisions Taken Under Ambiguity

1. **`files:` on the existing `COUNT_UPDATES` entries, not a parallel README
   table.** The two README lines are matched by the two regexes CLAUDE.md already
   uses; a second table would duplicate them, and two encodings of one rule
   drift. The field also keeps `COUNT_UPDATES` iterable by `field`, which an
   out-of-scope test depends on.
2. **The capture-line rewrite is best-effort in both modules; its freshness is
   ENFORCED by a test pin, not by a fail-loud sync.** Making the sync fail loud on
   an absent capture line would red an existing fixture test whose README
   legitimately has no capture, and weakening that test is forbidden. The pin
   (R2) catches the same drift and catches more of it — it also fires when a human
   pastes a stale capture, which the sync never would.
3. **Only the two README count lines the parent names are added to the sync.**
   README's `agents/ 124 agent definitions` and `skills/ 429 skill files` lines
   are the same drift class, but both are already policed by
   `readme-numbers.test.js` (agents pinned at the documented literal, skills
   derived from `computeDocCounts`), so drift there is red today, not silent.
   Adding them to the table is a two-line change that the human can schedule; this
   slice does not silently widen its own scope.
4. **The capture block is re-taken at build time rather than pasted from this
   plan.** The block above was reconstructed from the dispatch brief's prose
   summary of a live dashboard, so its bytes are not guaranteed verbatim. A
   capture that is retyped is not a capture. The one hard constraint on the pasted
   output is the version line.
5. **The staging cell's replacement text** is `Rehearse production; the profile
   sets nothing but strict enforcement` — the parent's "strict enforcement;
   nothing else changes", phrased so it does not simply repeat the Enforcement
   column beside it.
6. **The re-taken capture shows this build in flight.** The dashboard was
   captured while this very plan was being built, so the TASKS block carries a
   running row and the AGENT block reads `● Active: …` rather than `○ Idle`. The
   bytes were pasted unchanged: a capture edited to look calmer is not a capture,
   and the reading guide beneath it says AGENT is "idle, or building" — which
   this capture now illustrates rather than only asserts.
7. **Trailing blank lines were not pasted.** `node src/commands/start.js dashboard`
   emits the screen as the `text` field of a JSON object, and that string ends
   with three empty lines of terminal padding. Every line of screen CONTENT is
   verbatim, including leading spaces and every glyph; only the trailing padding
   was dropped, because a fenced block cannot render bottom padding as anything
   but stray blank lines. No character inside the screen was altered.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Execution Record

**Step 8 — TEST (TDD Red).** The three test files were written and run BEFORE any
edit to `README.md`, `src/scripts/release.js` or `src/lib/version.js`
(`node --test tests/readme-numbers.test.js tests/release-script-coverage.test.js
tests/version.test.js`). Ten of the eleven planned rows were red, each on the
assertion the Test Plan named:

| # | Test | Observed red |
|---|---|---|
| R1 | `Project structure: test-file count (derived from disk)` | no `tests/ 543 test files` in the README (it said 524) |
| R2 | `Lesson 2 capture: the version line equals the VERSION file` | no `^CTOC v6.14.63$` (the capture said `CTOC v6.14.36`) |
| R3 | `Environments: the staging row no longer claims auto-move to review` | `auto-move to review` still present |
| R4 | `should_rewrite_the_dashboard_capture_version_line` | the fixture line stayed `CTOC v1.0.0` |
| R6 | `should_write_the_live_counts_into_the_README_structure_block` | `TypeError: updateDocCountsInReadme is not a function` |
| R7 | `should_name_a_failure_when_the_README_test_count_line_is_missing` | same missing export |
| R8 | `should_skip_a_missing_README_without_reporting_a_failure` | same missing export |
| R9 | `should_leave_the_CLAUDE_only_count_lines_alone_when_syncing_the_README` | same missing export |
| R10 | the extended `main()` end-to-end case | `/^CTOC v2.0.0$/m` did not match; the fixture still read `CTOC v1.0.0` |
| R11 | `also rewrites the dashboard capture line` | `/^CTOC v6.14.63$/m` did not match the synced fixture |

R5 (`should_leave_a_mid_line_CTOC_version_mention_untouched`) passed in that same
red run, exactly as the Test Plan predicted. It is the ANCHOR GUARD for R4, not
evidence of the feature: it is recorded here and NOT counted as coverage.

**Step 9 — PREPARE.** No dependencies and no new directories: every target file
already existed and the suite runs on this repository's own `npm test`. The one
prerequisite was a live dashboard to capture, verified by running it (below).

**Step 10 — IMPLEMENT.**

- `README.md` — the Lesson 2 capture block was re-taken at build time by running
  `node src/commands/start.js dashboard` from the repository root and pasting the
  screen bytes verbatim. The promise sentence, the staging row and the
  structure-block test count were replaced exactly as the plan specified.
- `src/scripts/release.js` — `VERSION_UPDATES` gained a FOURTH entry (appended,
  so index 0 is still the `**X.Y.Z**` entry) carrying the anchored capture
  pattern. `COUNT_UPDATES` gained a `files:` field per entry. The body of
  `updateDocCountsInClaudeMd` was extracted verbatim into the target-agnostic
  `updateDocCountsInFile(docFile, root, { counts, targetPath })`, with
  `updateDocCountsInClaudeMd` and the new `updateDocCountsInReadme` as thin
  wrappers. `main()` calls the README count sync after the CLAUDE.md one, and
  `updateDocCountsInReadme` is exported.
- `src/lib/version.js` — `syncToReadme` gained the `captureLine` pattern and a
  third `.replace`; its docblock now lists three targets and states the honest
  split between the best-effort rewrite and the enforcing test pin.

**Step 11 — REVIEW.** The whole diff was read back. The behaviour of
`updateDocCountsInClaudeMd` is byte-identical for CLAUDE.md: every log string and
every pushed failure string is composed from `docFile`, which is the literal
`'CLAUDE.md'` on that path, so `Skip: CLAUDE.md (not found)`, `ERROR: CLAUDE.md
count line for <label> not found`, `CLAUDE.md (<label> line not found)`, `Updated
doc counts: CLAUDE.md` and the bare `'CLAUDE.md'` write-failure push are all
unchanged. Confirmed by running the two out-of-scope files that pin them —
`tests/doc-counts-generated.test.js` and
`tests/remainder-hooks-commands-coverage.test.js` — together with
`tests/release-metadata-sync.test.js` (its README-less fixtures still exit 0
through the skip-when-absent branch) and `tests/release.test.js`: 71 tests, 0
failed, 0 skipped. The `files` field is required on every `COUNT_UPDATES` entry by
construction; an entry added without it throws rather than silently applying to
every file, which is the loud failure this table's contract already prefers.

**Step 12 — OPTIMIZE.** No redundant work: the README sync is one extra read of
one file per release run, and the two wrappers share one body rather than
duplicating the loop. No abstraction was added beyond the single `files:` field
the two targets need.

**Step 13 — SECURE.** No user input reaches this code: `docFile` is a hardcoded
literal supplied by each wrapper, so `path.join(root, docFile)` cannot traverse.
The write path is the unchanged `atomicWriteFileSync` (temp file + same-directory
rename). No secrets are introduced; the pasted capture carries only plan counts
and plan file names, the same kind of content the README already held.

**Step 15 — DOCUMENT.** JSDoc was written for `updateDocCountsInFile` and both
wrappers, `syncToReadme`'s docblock was corrected to three targets with its
best-effort / enforced split spelled out, and the `COUNT_UPDATES` comment explains
why `files:` exists rather than a parallel table. This repository has no
`CHANGELOG.md`, so none was updated.

**Step 16 — FINAL-REVIEW.** Steps 8-15 are complete, all quality checks passed, no
stub and no TODO was written, no existing assertion was weakened, and no file
outside the plan's declared `files:` was touched.

One process note, recorded because hiding it would be worse than the mistake: the
first attempt to append this record read a stale `record.md` left in the shared
scratchpad directory by an earlier build and appended THAT plan's text here. It
was detected immediately on re-reading the file, removed in full, and replaced
with this record. No source file, test file or README byte was affected.

## Verification Evidence

`npm test` from the repository root, exit status 0. Final lines:

```
[CTOC test-gate] coverage 99.89% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

Suite totals: `tests 11980`, `pass 11980`, `fail 0`, `skipped 0`.

Per-file coverage of the two changed source files: `src/lib/version.js` 100.00%
lines; `src/scripts/release.js` 99.52% lines, uncovered 129-130 — the pre-existing
best-effort cleanup `catch` inside `atomicWriteFileSync`, unchanged by this slice
and already documented as unreachable at the bottom of
`tests/release-script-coverage.test.js`. No line added by this slice is uncovered.

The three test files that carry this slice's contract were re-run after the
implementation: 151 tests, 0 failed, 0 skipped.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
