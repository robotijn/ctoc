---
iron_loop_verdict: true
iron_loop: true
title: "The run's first task — the starting inventory, the instruments, and the check that reads the record"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00261-every-agent-and-specialist-skill-improved-three-times-s1-agent-critic-gains-web-research
priority: medium
files:
  - tests/agent-and-skill-improvement-record.test.js
  - .ctoc/audit/agent-and-skill-improvement/inventory.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
  # RATCHET FILE — not counted toward the slice size. This slice writes a new
  # tests/*.test.js, which moves the documented test-file count in CLAUDE.md;
  # the release sync rewrites that count, and the build needs the permission.
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-30T14:40:50.019Z
gate_crossed: review → done
---

# The run's first task — the starting inventory, the instruments, and the check that reads the record

**Scope (one line):** before any round begins, measure and write down what the run starts from (the 225 paths, their fingerprints, which tests read each one, which agents are thin wrappers, which agents the run dispatches), and write the one new check the parent allows — `tests/agent-and-skill-improvement-record.test.js` — in the form that stays green while the run is in progress.

## Implementation Details

### Why this slice exists, and why it comes second

The parent says the run's first task measures two things the planning did not (which of the 124 agents are thin wrappers pointing at a skill, and which tests read each in-scope file), records the definitive list of instruments from the agents the run actually dispatches, and holds the starting inventory of 225 paths. It must come after the prerequisite slice, because `agent-critic`'s "before" for its own rounds is the file as that slice left it (criterion 4), and before the first round, because every round's record is checked against this inventory.

### 1. The starting inventory — `.ctoc/audit/agent-and-skill-improvement/inventory.json`

Measure, do not copy: list `agents/**/*.md` and `skills/**/SKILL.md` from disk, drop the four reference-guide directories (`skills/languages/`, `skills/frameworks/`, `skills/quality-configs/`, `skills/agent-fragments/`), and confirm the counts the planner listed on 2026-09-29: **124 agent files in 24 categories and 101 skill bodies, 225 in all.** If the disk listing differs, stop before writing anything else and put the difference to the human (`for-the-human.json`, kind `sequence-cut`), because the slices were cut on the planner's listing.

Each file entry, in the order of the sequence of files (the slice table in the parent index — the order the slices were cut in, not alphabetical order):

- `path`, `kind` (`agent` or `skill`), `slice` (the slice's short identifier, `s3` to `s120`), `paired_with` (the other files of its group, as the parent index table lists them);
- `wrapper` — for an agent, its `type`, `target_skill` and `extends_skill` as read from its first frontmatter block, and any skill it names by body path (the shape `tests/cu5-wrapper-coverage-completeness.test.js` credits); `null` for a skill;
- `fingerprint_at_start` — `sha256:` plus the hexadecimal digest of the file's bytes;
- `claims_block_sha256_at_start` — `null` when the file has no `ctoc:claims` comment block (the parent believes none has one; this measures it), otherwise the digest of the block's text;
- `tests_reading` — the test files that actually read this file, **measured at run time, not by text search**: run each `tests/*.test.js` on its own with a read-tracing preload (a small cross-platform Node script in the session's scratch directory, never committed, passed through `NODE_OPTIONS` so child processes inherit it) that logs every path under `agents/` or `skills/` the test process reads, then invert the log. If the tracing cannot be made to work, write `tests_reading: null` and a `tests_reading_method` sentence saying what failed — never substitute a text search and present it as the measurement.

Top-level fields: `schema`, `measured_on` (a date), `counts` (computed from the entries), `wrapper_count` (how many agents are `type: wrapper` — the first unmeasured number the parent names), `tools_at_start` (the exact `tools:` lines of `agents/pipeline/agent-critic.md`, as the prerequisite slice left it, and of `agents/ai-quality/citation-validator.md`), `claims_ledger_sha256_at_start` (the digest of `.ctoc/verification/claims-ledger.json`), `instruments`, `dispatched_agents_observed`, `effort_documentation`, `tests_reading_method`.

### 2. The instruments

The planner's list, from the parent's instruments rule plus the agents the project documents for the build steps of every slice (the Iron Loop table in `CLAUDE.md`):

| Instrument | Role in this run | Worked in |
|---|---|---|
| `agents/coordinator/cto-chief.md` | the dispatcher the parent names | slice s116 |
| `agents/pipeline/agent-critic.md` | research and critique in every round | slice s119 |
| `agents/ai-quality/citation-validator.md` | citation validation in every round | slice s115 |
| `agents/iron-loop/iron-loop-executor.md` | applies every edit, runs the fences, writes the record | slice s118 |
| `agents/iron-loop/iron-loop-critic.md` | reviews each slice's build (the REVIEW and FINAL-REVIEW steps) | slice s117 |
| `agents/security/security-scanner.md` and `skills/security/security-scanner/SKILL.md` | scans each slice's build (the SECURE step); the agent extends that skill | slice s120 |

Then compare with what the run actually dispatches: read the dispatch log of the prerequisite slice's own build (`.ctoc/audit/dispatches/`, written under the dispatch protocol, which is instruction-level discipline rather than a hook) and record the agent names in `dispatched_agents_observed` (or `null` with the reason when the log holds nothing for it). **If an agent the run dispatches is missing from the table above, stop before the first round and put it to the human** (`for-the-human.json`, kind `instrument-list`): the slice sequence puts instruments last, so a missing instrument means the sequence needs re-cutting, which this slice does not do on its own.

### 3. The effort documentation reading

The parent asks the run's first task to read https://code.claude.com/docs/en/model-config and record which is true: whether `max` is an accepted frontmatter effort level or only `low`, `medium`, `high` and `xhigh`. The executor holds no web tool, so the dispatcher dispatches `agents/ai-quality/citation-validator.md` with that claim to check; the verdict, the page's address, its read date and a brief verbatim quote go in `effort_documentation`. Nothing in this run changes an effort value; this is a record for the human.

### 4. The check — `tests/agent-and-skill-improvement-record.test.js`

Written test-first. The check logic lives in the test file as one function over a record directory, so the same function runs against the real directory and against fixture directories under `os.tmpdir()`.

**The in-progress form this slice writes** asserts:

1. `inventory.json` exists and parses (absent or unreadable is a failure, never a pass); its `counts` equal what its entries say (124 agents, 24 agent categories, 101 skill bodies, 225 in all); paths are unique, every path exists on disk, matches `agents/**/*.md` or `skills/**/SKILL.md`, and lies outside the four reference-guide directories; the `slice` values never decrease along the list.
2. Every record file under `.ctoc/audit/agent-and-skill-improvement/` other than the three list files names a `path` that is in the inventory, and sits exactly at the mirrored location (`<path>.json`).
3. Each record's rounds are numbered 1, 2, 3 without a gap, never more than three. Each round entry holds every field of the round shape (parent index, "The record's exact shape") with the right types; every date is `YYYY-MM-DD` and nothing that looks like a clock time appears in any date field; every fingerprint is `sha256:` plus 64 hexadecimal characters.
4. Consistency inside a round: at least one finding with decision `applied` **exactly when** the fingerprint before differs from the fingerprint after (a changed file with no applied finding, or an applied finding with no change, fails — criterion 3); `nothing_found: true` requires no applied finding and non-empty `queries`, `sources` and `fences`, and a `paired_files_compared` list (scenario 3).
5. Continuity: round k's fingerprint before equals round k−1's fingerprint after, unless round k says `resumed_after_unrecorded_edit: true` (scenario 11); for `agents/pipeline/agent-critic.md`, round 1 continues from the prerequisite entry's fingerprint after.
6. `prerequisite` is non-null only on `agents/pipeline/agent-critic.md`, and on that record it is present.
7. Every entry in `late-corrections.json` matches, field for field, the entry with the same `id` in the named file's record, and the other way round; a late correction exists only on a file whose record already holds three rounds.
8. Every finding with decision `reported-to-human`, every `held` marker and every late correction not applied names a `for_the_human_id` that exists in `for-the-human.json`; every entry there has its required fields.
9. `agents/pipeline/agent-critic.md`'s `tools:` line is exactly `Read, Grep, WebSearch, WebFetch`; `agents/ai-quality/citation-validator.md`'s equals the inventory's `tools_at_start` value; neither names `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash` or `Task` (Definition of Done 8).
10. For every inventoried file, the current `ctoc:claims` block digest equals `claims_block_sha256_at_start` (scenario 29).

It does **not** yet require three rounds on every file — that is the final slice's change (s121), so the check is green throughout the run, as the parent requires.

**Its teeth, as fixture cases** that must be rejected, each asserting the specific failure it names: a fourth round; a date with a clock time; a nothing-found round whose fingerprints differ; an applied finding whose fingerprints are equal; a round missing a required field; a record whose path is not in the inventory; a record at the wrong mirrored location; a late-correction list entry that disagrees with the file's record; a `reported-to-human` finding with no list entry; a critic `tools:` line that names `Write`; an inventory whose counts disagree with its entries. Plus one well-formed fixture that must pass, so the rejections are not vacuous.

### 5. The two list files

`late-corrections.json` and `for-the-human.json` start with an empty `entries` list, in the shapes the parent index fixes (unless the prerequisite slice already wrote an entry in `for-the-human.json`, which is kept).

### Contracts and fences that must stay green

- The record check itself.
- `tests/readme-numbers.test.js` and the documented counts in `CLAUDE.md` and `README.md`: a new test file moves the test-file count. Run the release sync (`node src/scripts/release.js`, which rewrites both counts) after the file exists and before the gate, as the release rule does at every commit.
- Everything else the full gate runs. This slice edits no agent and no skill.

### How to verify

1. The test is written first and run: the real-directory case fails because `inventory.json` does not exist yet, and the fixture cases fail because the check function is not written yet. Record both failures.
2. Write the check function; the fixture cases pass and fail exactly as named.
3. Write `inventory.json` and the two list files; the real-directory case passes, including against the prerequisite slice's record.
4. `npm test` — the suite, the coverage floor of 99 read from `.ctoc/coverage-baseline.json`, zero skipped. A printed warning or deprecation is a defect to fix.
5. One commit for the slice carrying a patch version per the release rule; nothing pushed.

### Wiring — the live call sites

The test file is reached by the gated suite (`npm test` runs `src/scripts/test-gate.js`, which runs every `tests/*.test.js`). The inventory and the two lists are read by that test and by every later slice of this run. No module under `src/` is added or changed.

### Security review

- The tracing preload lives in the scratch directory and is never committed; it records paths only, never file contents.
- The inventory holds paths, digests and test names — no secret, no file content.
- The fixture directories live under `os.tmpdir()` and are removed after the test.

## Decisions Taken Under Ambiguity

1. **The inventory is measured after the prerequisite slice**, so `agent-critic`'s starting fingerprint is the one its prerequisite left, which is what criterion 4 calls "before" for that file.
2. **The in-progress form enforces structure, continuity and consistency, not a count of three.** The parent offers "added last, or enforcing only that recorded rounds never decrease". A check that reads files on disk cannot remember an earlier count, so "never decrease" cannot be checked as written; continuity of fingerprints and consecutive round numbers is the nearest property a stateless check can hold, and the three-round requirement arrives in the final slice.
3. **Security scanner and the Iron Loop critic are instruments.** The parent names four "at least"; `CLAUDE.md`'s Iron Loop table has every slice's build reviewed by `iron-loop-critic` and scanned by `security-scanner`, so editing either mid-run changes what later slices are measured with. The dispatch log confirms or corrects the list; a missing instrument stops the run for the human rather than being re-ordered here.
4. **The claims-ledger digest is recorded, not enforced by the check.** The human may legitimately run the claims verifier during the run, which rewrites the ledger; a check that failed on that would fail on his act. The final slice compares the digest and reports a difference; this work never writes the ledger.
5. **The planner's count is confirmed, not trusted.** If the disk listing differs from 124, 24 and 101, the slices may be wrong, and that goes to the human before any round.
6. **(Executor) A skill named by body path is recorded only when it resolves to a real skill body.** Each agent's `wrapper` carries `type`, `target_skill`, `extends_skill` and `body_skill_paths`. The wrapper-coverage test's pattern also matches references into the agent-fragments guide directory and nested-directory prefixes, which name no skill body; `body_skill_paths` keeps only the paths whose `SKILL.md` exists and is in scope (34 agents carry at least one). Not chosen: copying the raw pattern matches, which would list files that are not skills.
7. **(Executor) `dispatched_agents_observed` is an object, not a bare null.** The log holds nothing for the prerequisite slice's build, so the value is `{ agents: null, log_read, reason }`: the reason sits next to the null instead of in a second top-level key.
8. **(Executor) The check names every failure by a fixed code and reports all of them.** Each failure is `{ code, message }`, and every fixture case asserts its own code. The check stops early only when the inventory itself cannot be read, because every other rule is judged against it. The expected totals (124, 24, 101, 225) are a parameter, so fixtures can be small while the real directory is held to the planner's numbers.
9. **(Executor) An entry for the human may carry `path: null` and `round: null`.** A sequence-cut or an instrument-list question concerns no single file or round.
10. **(Executor) Round 1 of files other than the critic is not tied to `fingerprint_at_start`.** Item 5 of the check names that tie only for the critic's prerequisite. Tying every file's first round to its starting fingerprint would catch an edit made before round 1 with no record; it is a tightening the plan does not ask for, so it is left for the final slice or the human, not added here.
11. **(Executor) `tests_reading` was measured one test file at a time.** Each test ran in its own `node --test` process with the preload, so every read is attributed to exactly one test. This differs from the previous slice's whole-suite trace in one place: that trace also credited `tests/iron-loop-enforcer-coverage.test.js` with reading the critic, and run on its own that test reads no in-scope file (it writes its agent files into temporary fixture roots). The record test itself was not traced; it reads every inventoried file by construction.
12. **(Executor) A claims-block digest covers every block's full text, comment markers included, joined by newlines.** No in-scope file has a block (0 of 225), so every entry is `null`, which confirms the parent's belief.
13. **(Executor) One fixture case beyond the named list: an absent inventory.** Item 1 says absent is a failure, never a pass; the case holds that. A stray file in the record directory (an operating-system metadata file, for instance) fails loudly as an unreadable record, deliberately.
14. **(Executor) The security scanner is two instrument entries**, the agent and the skill it extends, both worked in s120, so each path in the instrument list is a single file.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — the record test was written first: two real-directory cases (the inventory exists; the real directory passes the check) and thirteen fixture cases (one well-formed, the eleven named defects, and an absent inventory), with no check function yet.
- [x] Test error conditions — every named defect is a fixture that must be rejected with its own failure code; the well-formed fixture must produce none, so the rejections are not vacuous.
- [x] Run tests - expect RED (failing) — 15 tests, 0 passed, 15 failed: the inventory case failed because the inventory file did not exist, and the other 14 failed because the check function was not yet written (a reference error). Evidence below.

### Step 9: PREPARE
- [x] Install dependencies if needed — none; only the standard library is used.
- [x] Check prerequisites — read this plan, the parent index in full, the project instructions, the Iron Loop guide and the previous slice's record. Measured the disk: 124 agent files in 24 categories and 101 skill bodies, 225 in all, equal to the planner's listing, so nothing went to the human. Read the dispatch log directory: it holds only a 2026-05-14 example.
- [x] Verify dev environment ready — the traced run executed all 543 other test files, proving the harness.
- [x] Create directories/config if needed — none; the record directory already existed from the previous slice.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — the check function in the record test (the ten rules of section 4), the starting inventory (225 entries in sequence order, from the parent index's slice table, cross-checked against the disk), and the two list files with empty entries.
- [x] Add error handling — an absent or unreadable inventory, list file or record is a named failure, never a pass; a file named in the inventory that cannot be read on disk is a named failure.
- [x] Wire up integration points — the test is a tests file, so the gated suite runs it; the inventory and lists are read by it and by every later slice. No module under the source directory was added.

### Step 11: REVIEW
- [x] Self-review all new code — read the check back against each of the ten rules; confirmed the real directory passes against the previous slice's record (the prerequisite entry is present and well formed, zero rounds) and that the critic's inventory fingerprint equals the one that slice left.
- [x] Verify integration points work together — ran every fixture case through a scratch probe that prints its exact failures: each named case produces its named code (two produce a second, consequential code as well: a fourth round also flags the late correction on a file no longer holding exactly three rounds, and a nothing-found round with differing fingerprints also flags the change with no applied finding).
- [x] Check error handling completeness — the check reports every failure it finds rather than stopping at the first, except when the inventory cannot be read, because every other rule is judged against it.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — the round fields are one table of validators, the shapes reuse two small helpers, and no module or dependency was added.
- [x] Optimize critical paths — the real-directory check reads 225 files and the records once; the whole test file runs in well under a second.
- [x] Simplify complex code — no abstraction beyond the one function the plan asks for.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every inventoried path must be repository-relative, normalised, without a parent-directory segment or a backslash, and inside the two in-scope patterns before it is joined to the root and read.
- [x] Sanitize outputs — failure messages carry paths and at most 200 characters of a wrong value; no file content is printed.
- [x] No secrets in code — the inventory holds paths, digests, test names and a public documentation quote; the preload that measured the reads logged paths only and stays in the scratch directory.
- [x] Safe file operations — the test writes only to fixture directories under the temporary directory and removes them afterwards; it only reads the repository.

### Step 14: VERIFY
- [x] Run lint + type check — lint exit 0 (no warnings allowed); type check exit 0, pass 1, fail 0.
- [x] Run ALL tests (TDD Green) — the full gate exit 0: 12030 tests, 12030 passed, 0 failed; the record test 15 of 15.
- [x] Check coverage >= 80% — coverage 99.9% against the floor of 99 read from the coverage baseline, unchanged.
- [x] 0 skipped, 0 flaky tests — skipped 0, cancelled 0, todo 0; no runtime warning or deprecation in the gate output.

### Step 15: DOCUMENT
- [x] Update relevant documentation — the documented test-file count moved from 543 to 544 in the project instructions and the README through the release sync.
- [x] Add JSDoc comments to new functions — the check function and its helpers carry comments; the test file's header explains the record and the in-progress form.
- [x] Update CHANGELOG if needed — the repository has no changelog file; the version moved from 6.14.68 to 6.14.69.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — red then green recorded; only the declared files were written by hand, plus the version file and the files the release sync rewrites; no scope-growth request was needed.
- [x] All quality checks passed — lint, type check and the full gate all exit 0.
- [x] Manual verification if needed — opened the critic's inventory entry and its tests list, and compared the counts, wrapper count and tools lines with the disk.
- [x] Ready for human review — nothing went to the list for the human: the counts matched, and the dispatch log held nothing that could show a missing instrument.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

What landed, by hand, in the declared files:

- The record test, with the check function inside it and fifteen cases.
- The starting inventory, 225 entries in sequence order. Its top-level fields: counts of 124 agents, 24 agent categories, 101 skill bodies, 225 in all; a wrapper count of 92; the two tools lines as found; the claims-ledger digest; seven instrument entries; the dispatch-log observation (empty, with the reason); the effort documentation reading; and the measuring method.
- The two list files, each holding schema 1 and an empty entries list. The previous slice had written no entry for the human, so there was nothing to keep.
- The project instructions: the documented test-file count, 543 to 544, rewritten by the release sync.

Also changed, by the release rule: the version file (6.14.68 to 6.14.69) and the files the release sync rewrote (the package manifest, the two plugin manifests, and the README, whose version references and test-file count moved).

Nothing went to the list for the human. The disk listing equals the planner's (124 agents in 24 categories, 101 skill bodies). The dispatch log directory holds a single example file dated 2026-05-14 and nothing from the previous slice's build, so it cannot show an instrument missing from the table; the observation is recorded as a null with that reason.

The effort documentation reading, recorded as the brief gave it: the claim that subagent frontmatter accepts only low, medium, high and xhigh is REFUTED. The citation validator read the sub-agents, skills and model-config pages on 2026-09-30. The sub-agents page's effort row lists all five levels, max included, with the note that the levels available depend on the model; max is rejected only in the two settings-file keys. The caveat is recorded: the sub-agents row came back through a summarising fetch, not as raw page bytes. The comment in the agent-modernization test is correct on the list of levels; its further clause, that max is supported on every model the corpus targets, was not part of the claim checked.

## Verification Evidence

Red, before the check function existed:

```
node --test tests/agent-and-skill-improvement-record.test.js
ℹ tests 15   ℹ pass 0   ℹ fail 15   ℹ skipped 0
the starting inventory exists: AssertionError ... inventory.json does not exist — the run's first task writes it
14 cases: ReferenceError: checkRecordDir is not defined
```

Fixture cases, after the check function was written, each printed through a scratch probe:

```
well-formed                 []
fourth round                round-count (and late-correction-early)
date with a clock time      date
nothing-found, fps differ   nothing-found (and applied-vs-change)
applied, fps equal          applied-vs-change
round missing a field       round-field
record not in inventory     record-not-in-inventory
wrong mirrored location     record-location
late list disagrees         late-correction-mismatch
reported, no list entry     for-the-human-missing
critic tools names Write    tools
counts disagree             inventory-counts
absent inventory            inventory-unreadable
```

Green, after the inventory and the two lists were written:

```
node --test tests/agent-and-skill-improvement-record.test.js
ℹ tests 15   ℹ pass 15   ℹ fail 0   ℹ skipped 0
```

How the tests reading each file were measured: every one of the other 543 test files ran on its own under the read-tracing preload (scratch directory, loaded through the Node options variable, paths only). Every in-scope file is read by between 16 and 27 test files, 21.8 on average; none is read by none. Under the preload three files failed, none of them a real failure: the session-start coverage test fails only while the preload is loaded (the previous slice saw the same); the lint test and the README-numbers test failed because the new test existed but was unfinished and the documented count had not yet been synced. All three pass in the gate below. The critic's measured list is 25 test files; the previous slice's whole-suite trace listed 26, the extra one being the enforcer-coverage test, which run on its own reads no in-scope file (decision 11).

Checks on the inventory against the disk: the critic's starting fingerprint is the one the previous slice left, `sha256:b464e3f4…9b99`; the tools lines are `tools: Read, Grep, WebSearch, WebFetch` for the critic and `tools: Read, Grep, Skill, WebSearch, WebFetch` for the validator; no in-scope file has a claims block; the claims-ledger digest at the start is `sha256:9eade2cd…a706`.

The gate, read from unpiped runs:

```
npm run lint        exit 0   (eslint . --max-warnings 0)
npm run typecheck   exit 0   pass 1, fail 0
npm test            exit 0
ℹ tests 12030  ℹ pass 12030  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0  ℹ todo 0
[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
Node warnings or deprecations in the output: 0
```
