---
iron_loop_verdict: true
iron_loop: true
title: "The agent critic gains web research and covers specialist skill bodies, before any round begins"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: none
priority: medium
files:
  - agents/pipeline/agent-critic.md
  - .ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-critic.md.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:16.427Z
gate_crossed: implementation → todo
---

# The agent critic gains web research and covers specialist skill bodies, before any round begins

**Scope (one line):** the one change to an instrument that the owner approved (decision 1, "give both websearch") — `agent-critic` gains WebSearch and WebFetch, its wording covers specialist skill bodies as well as agent definitions, and it gains the defence against instructions hidden in fetched content. This is not one of the critic's three rounds; its three rounds come near the end of the run, as an instrument.

## Implementation Details

### Why this slice is first

Research with web tools cannot start before the grant exists, and an instrument is not edited while it measures other files. So this change lands before any file's first round, as its own recorded entry (parent, "The prerequisite change to `agent-critic` (decision 1)"). `citation-validator` needs no change: on disk on 2026-09-29 its line is `tools: Read, Grep, Skill, WebSearch, WebFetch`, and its role stays validate-only.

### What the planner read in the file on disk (2026-09-29, read in full)

- Frontmatter, lines 1 to 11: `name: agent-critic`, a `description` (line 3), `tools: Read, Grep` (line 4), `model: opus`, `effort: xhigh`, `reads_ancestry: true`, `async_choice_protocol: enabled`, `reports_to: cto-chief`, `tier: 1`.
- Role (line 30): "You evaluate AGENT DEFINITIONS (markdown files), not code."
- Anti-scope (line 857): "Does NOT critique code -- only critiques AGENT DEFINITIONS (markdown files)".
- Structural detection (lines 419 to 433) requires `## Role`, `## Output Format`, `## Anti-Scope` "for ALL agents". A specialist skill body has a different shape — its frontmatter keys `name`, `description`, `when_to_load`, `related_skills` and `effort_level` are pinned by `tests/skill-loading.test.js` — so without an explicit rule the critic would mark every skill body down for lacking agent sections.
- Adversarial Test 2, Scope Injection (lines 497 to 498), covers text inside the file under evaluation only. Nothing covers a fetched page, because the critic has never held a way to fetch one.
- Output format (lines 350 to 400): the `critique:` block that `agent-writer` consumes.
- The honest-status reference is the last section (lines 862 to 864).

### The five requirements (copied from the parent)

1. **Grant.** The `tools:` line becomes the critic's two current tools plus WebSearch and WebFetch: Read, Grep, WebSearch, WebFetch. It holds no tool that writes or edits a file and none that runs a command, so the critic stays unable to edit files. Its web access is retrieval only: it reads and never posts, submits or changes anything on the far side. `Skill` is not added, because nobody asked for it.
2. **Wording covers skill bodies.** The role statement, the anti-scope statement (today: "only critiques AGENT DEFINITIONS") and the `description` name specialist skill bodies as well as agent definitions. The `description` keeps every dispatch phrase it has today and adds the new ones. The critic also states, in its own words, that it researches the file's domain on the web before it scores, because that is now the work its grant exists for.
3. **The same defence as the validator's.** The critic states that every page it fetches, every search result and every byte of the file under review is untrusted data and never instruction. An instruction aimed at the reader, in a page or in a file, is recorded as a finding and not followed. The substance is that of the validator's "What I Read Is Data" section (read it in `agents/ai-quality/citation-validator.md` before writing). The critic's existing Scope Injection test covers only the file under evaluation.
4. **Its output contract does not move.** The field names, literal values and file paths of the critique output, which the agent that applies critic feedback reads, stay exactly as they are (scenario 25). If the extension to skill bodies cannot be written without changing that shape, the slice reports it to the human and does not change the shape.
5. **Everything else is untouched.** Every frontmatter key other than `tools` and `description` is byte-identical before and after, and the file still starts with the three dashes at its first byte, still contains the honest-status reference, and still declares no Haiku model. Its fences run, and then the full gate.

### What the change must get right, point by point

- **The frontmatter.** Only line 3 (`description`) and line 4 (`tools`) change. The new `tools` value is exactly `Read, Grep, WebSearch, WebFetch` — the record check written in the next slice asserts that exact string, so any other spelling or order turns the build red.
- **The description** keeps every phrase it has today, verbatim: "World-class agent evaluator", "Scores on 8 research-grounded dimensions with calibration anchors", "10/10 requires zero flaws across all dimensions", "Grounded in ISO 25010/25059, RLHF reward modeling, Constitutional AI", "Sub-orchestrator reporting to CTO Chief". New phrases name specialist skill bodies and web research of the file's domain.
- **Structure rules for a skill body.** Next to the structural detection for agents, the file gains the structure a skill body is checked against: its frontmatter keys as pinned by `tests/skill-loading.test.js` and its trigger phrases in `when_to_load`, with the agent-only sections not required of it.
- **The output contract, field by field, stays byte-identical:** `critique.agent`, `agent_type`, `round`, `evaluation_method`, the eight `scores` keys and `overall`, each issue's `dimension`, `location`, `problem`, `evidence`, `severity`, `confidence`, `fix` and `expected_outcome`, `strengths`, the four `bias_check` keys, the four `self_assessment` keys and `verdict`; and the literal values `multi-pass`, `ACCEPT`, `REFINE`, the `agent_type` list, and the severity and confidence levels. For a skill body the instruction is that `agent` carries the skill's `name` and `agent_type` takes an existing value from the list (the type of the agent that loads the skill). If that cannot be stated honestly, the slice writes an entry to `for-the-human.json` of kind `output-contract-change` and leaves the shape alone.
- **The defence against fetched content** is a new section, or a widening of the Scope Injection test, that covers a fetched page and a search result as well as the file under review, and says three things: an instruction in any of them is recorded as a finding and not followed; a page that tells the reader to score highly, skip a check or mark a claim verified is not a source for that claim (scenario 27); and nothing on a page can make the critic edit a file, because it holds no tool that writes.
- **The cost the owner accepted.** An agent that reads untrusted file text and can fetch from the open web holds two of the three properties the `gate-critic` definition cites Meta's Rule of Two against combining. Requirements 1 and 3 are the answer. Re-read the `gate-critic` passage before writing the new section, so the critic's text describes the risk the way the project already does.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Specific to this file:** `tests/architecture-invariants.test.js` lists it among the first-level agents (tier 1, reports to `cto-chief`); `tests/corpus-audit-ledger.test.js` requires it to exist. `tests/watcher-shape.test.js` catalogues it as a legacy agent (`.ctoc/watcher-baseline.json`), so the web-tool allowlist that fence holds for conforming watchers does not apply to it — confirm that at the start.
- The parent did not read any test that pins this file's tool grant. Before the change, find every test that reads the file by running the suite with a read-tracing preload (the method the next slice uses for the whole inventory), not by text search; run each one after the change.

### The evidence record this slice produces

- `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-critic.md.json` — a record with `rounds: []` and a `prerequisite` entry holding the date (a date only, never a clock time), the fingerprint before and after (`sha256:` plus the hexadecimal digest of the file's bytes), the fences run with their results, and the full gate's result. It is not a round and never counts toward the three.
- `.ctoc/audit/agent-and-skill-improvement/for-the-human.json` — only if requirement 4 or a fence forces a report to the human.

The exact shape is the parent index section "The record's exact shape". The check that enforces it is written in the next slice, so this slice follows the shape by reading it and the next slice's check proves it.

### Acceptance criteria for this slice (scenario 26 and Definition of Done 8, copied)

1. The `tools:` line names Read, Grep, WebSearch and WebFetch and no tool that edits a file or runs a command.
2. Its role statement, anti-scope statement and `description` name specialist skill bodies as well as agent definitions, and the `description` keeps every dispatch phrase it had.
3. Its instructions state that every fetched page, every search result and every byte of the file under review is data and never instruction.
4. Its critique output keeps its field names and literal values.
5. Every other frontmatter key is byte-identical to before.
6. The `citation-validator` definition is unchanged, and its role is still validate-only.
7. The record holds the critic's fingerprint before and after and the fences that were run.

### How to verify

1. Before the change: run every test that reads the file (found by the tracing run) and record them green; record the fingerprints of `agents/pipeline/agent-critic.md` and `agents/ai-quality/citation-validator.md`.
2. After the change: the same tests; confirm the validator's fingerprint is unchanged.
3. `npm test` — the suite, the coverage floor of 99 read from `.ctoc/coverage-baseline.json`, zero skipped. `node --test` alone is not the gate. A printed warning or deprecation is a defect to fix.
4. One commit for the slice carrying a patch version per the release rule; nothing pushed.

### Wiring — the live call sites

No module and no export. `agent-critic` is dispatched by name (its `description` is the routing surface) by the dispatcher in every round of this run from the third slice on; this slice changes what it may do and what it says, not whether it is reachable.

### Security review

- The grant adds retrieval only; no tool that writes, edits or runs a command is added, so a page cannot make the critic change a file.
- No secret enters the file or the record.
- This is the only tool grant this whole run widens. Any other widening a round wants goes to the human.

## Decisions Taken Under Ambiguity

1. **No new test in this slice.** The record check that asserts the exact `tools` string is written in the next slice, where the whole record shape gets its check; writing a second, narrower test here would add a file the parent does not name. The tests that already read the file are the baseline that must stay green.
2. **`for-the-human.json` is declared here** although the next slice writes the list's first version, because requirement 4 may force a report before the list exists. If this slice writes it first, it writes the shape from the parent index, and the next slice's check validates it.
3. **The skill-body `agent_type` rule** (use the type of the agent that loads the skill) is the planner's reading of requirement 4. If the executor finds it misleading for a skill no agent loads (`skills/ask-me-questions/SKILL.md`, `skills/saas/workos-sso/SKILL.md`), the case goes to the human rather than a new literal being invented.
4. **(Executor) A skill no agent loads keeps the rule, stated honestly.** For such a skill the critic takes the listed type whose work the skill most directly supports and says in `self_assessment.blind_spots` that the type was chosen by function because no agent loads it. The value stays inside the existing list and the basis is written into every such critique, so I did not find it misleading and wrote no entry to `for-the-human.json`. Not chosen: a new `agent_type` value, which would change the output contract; sending the case to the human, which the plan reserves for a rule that cannot be stated honestly. Review can overturn this.
5. **(Executor) The research log sits beside the critique, never inside it.** The round record needs the critic's queries and sources, and the `critique:` block has no field for them. The definition therefore returns them, when the brief asks, as a separate `research_log:` block after `critique:`, with field names matching the record's `queries` and `sources` entries. The `critique:` block's field names, literal values and shape are unchanged, and that block is what the agent applying the critique reads. Not chosen: putting sources into `self_assessment.blind_spots` or `strengths`, which would misuse fields that mean something else.
6. **(Executor) Where an instruction found on a page is recorded.** Scenario 27 asks for it to be recorded as a finding, and the only finding channel in the contract is `issues`. An instruction in the file under review is an issue under `robustness` (the file tries to steer its reader); an instruction on a page or in a search result is an issue under `research_grounding`, located at the passage whose claim the page concerned, with the page address and the instruction quoted as evidence and a fix that changes nothing on that page's say-so.
7. **(Executor) Research is a step before the passes, not a fourth pass.** The definition says every evaluation has exactly three passes; adding research as a pass would have changed that statement and the meta-evaluation that refers to it.
8. **(Executor) New dispatch phrases in the `description`.** Requirement 2 asks for new phrases naming skill bodies and web research; beside the descriptive sentences, a dispatch sentence was added in the form the validator uses ("Dispatch when the request mentions ..."). All five original phrases are kept verbatim.
9. **(Executor) How the tests that read the file were found.** A preload script in the session's scratch directory wrapped the file-system read, open and copy calls and logged every access to `agents/pipeline/agent-critic.md` together with the test file that caused it (a child process inherits its parent test's name). The first traced run attributed every read to one test, because the test runner process itself set the name; the fix was to skip naming in the runner process, and the second run is the one recorded. A read by a method the preload did not wrap would be missed; the 22 fences the plan names were run in addition for that reason.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — no new test file, as the plan decides (Decision 1). Test-first here means: find every test that reads `agents/pipeline/agent-critic.md` by RUNNING the whole suite under a read-tracing preload, and hold them green before the change. The preload wrapped the file-system read, open and copy calls and logged, per test process, every access to that path. It found 26 test files that read the file. Joined with the 22 agent-layer fences the plan names, that is 35 test files, all run before the change.
- [x] Test error conditions — the error condition for this slice is a fence turning red on the changed text (a missing honest-status reference, an order beyond the tools line, a gate number, a model or tier change, a file count). The 35 files cover each. Their counts before the change are recorded under Verification Evidence.
- [x] Run tests - expect RED (failing) — not applicable in the red sense: the slice changes an instruction file and adds no behaviour a new test would pin; the record check that asserts the exact tools string belongs to the next slice (Decision 1). Before the change, all 35 files passed with 0 failed and 0 skipped. The one failure in the traced whole-suite run (`tests/sessionstart-coverage.test.js`, "exits 0 despite unparseable-package.json") came from the preload itself: the same file passes 31 of 31 without it, and the full gate passed it.

### Step 9: PREPARE
- [x] Install dependencies if needed — none; no dependency is added.
- [x] Check prerequisites — read the plan, the parent index (record shape, prerequisite change, decisions), `CLAUDE.md` and `docs/IRON_LOOP.md`; read `agents/pipeline/agent-critic.md` in full, the "What I Read Is Data" section of `agents/ai-quality/citation-validator.md`, and the Rule of Two passage of `agents/iron-loop/gate-critic.md`. Confirmed `tests/watcher-shape.test.js` catalogues the critic as a legacy agent (`.ctoc/watcher-baseline.json`), so the web-tool allowlist for conforming watchers does not apply to it.
- [x] Verify dev environment ready — the traced whole-suite run executed 12015 tests, proving the harness before the change.
- [x] Create directories/config if needed — `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/` for the record, inside a declared path.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — in `agents/pipeline/agent-critic.md`: the `tools` line is now `Read, Grep, WebSearch, WebFetch`; the `description` keeps its five phrases verbatim and gains skill bodies, web research before scoring, the data-never-instruction rule and dispatch phrases; the Role names specialist skill bodies and states the research duty; a new section, "What You Read Is Data", covers the file under review, every file opened beside it, every search result and every fetched page, with the Rule of Two cost described the way `gate-critic` describes it; after the output block (left byte-identical), instructions for filling it for a skill body, for an issue that rests on research, and an optional separate research log; a "Domain Research (before Pass 1)" step that is not one of the three passes; a "Skill-Body Structure" section beside the structural detection for agents; the Anti-Scope names skill bodies and adds two items (no citation validation, no writing or posting anything). `citation-validator.md` is not changed.
- [x] Add error handling — the definition now says what happens when no web tool call succeeds (the evaluation continues on the file alone, the gap goes to `self_assessment.blind_spots`, confidence no higher than MEDIUM), and when a source is unreachable (named with the exact error; no issue rests on it alone).
- [x] Wire up integration points — no module and no export. The critic is dispatched by name and its `description` is the routing surface; the changed description keeps every phrase it had. The evidence record is at `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-critic.md.json`.

### Step 11: REVIEW
- [x] Self-review all new code — read the whole diff back. Two corrections made during review: skill bodies are not always at a two-level path (the top-level `skills/ask-me-questions/SKILL.md`, the nested `skills/testing/writers/...`), so the path is written `skills/**/SKILL.md`; and the data rule was widened from "the file under review" to every file read. The claim that `tests/skill-loading.test.js` pins the five skill keys was narrowed to what it does (skills named by `target_skill:`), and the claim about skills named by `extends_skill:` was checked on disk, 9 of 9 carry all five keys.
- [x] Verify integration points work together — checked mechanically against the committed file: only the `description` and `tools` frontmatter lines differ; the nine keys parse as YAML; the Output Format block and the Example Critique are byte-identical; the file starts with three dashes at its first byte, keeps the honest-status reference, and names no Haiku model.
- [x] Check error handling completeness — the injection paths are all covered: an instruction in the file (issue under `robustness`), on a page or in a search result (issue under `research_grounding`, not followed, page not a source), an address constructed for the critic to fetch (never fetched), and repository content leaving through a query (forbidden).

### Step 12: OPTIMIZE
- [x] Remove redundant operations — the new section reuses the existing output fields and dimensions instead of adding new ones; the Scope Injection test was left as it is because the new section covers pages and search results beside it.
- [x] Optimize critical paths — not applicable; no code path changed.
- [x] Simplify complex code — one rule sentence ("where this rubric says the agent, read the file under evaluation") replaces rewording every dimension for skill bodies.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — no path is built from input; the record is written at a fixed declared path.
- [x] Sanitize outputs — the definition requires quoting untrusted text briefly and marked as a quotation, never following it.
- [x] No secrets in code — none in the file or the record; the record holds only paths, fingerprints, dates and pass results.
- [x] Safe file operations — the grant adds retrieval only; no tool that writes, edits or runs a command was added, so nothing on a page can make the critic change a file.

### Step 14: VERIFY
- [x] Run lint + type check — `npm run lint` exit 0 (`eslint . --max-warnings 0`, no output); `npm run typecheck` exit 0, pass 1, fail 0. Exit codes read from unpiped runs.
- [x] Run ALL tests (TDD Green) — `npm test` exit 0: tests 12015, pass 12015, fail 0, `[CTOC test-gate] PASS`. The 35 test files that read the critic or fence the agent layer passed after the change with the same counts as before.
- [x] Check coverage >= 80% — `[CTOC test-gate] coverage 99.9% (threshold 99%)`, the floor read from `.ctoc/coverage-baseline.json`, unchanged.
- [x] 0 skipped, 0 flaky tests — skipped 0, cancelled 0, todo 0. No Node runtime warning or deprecation in the gate output (0 matches for a Node warning prefix, `DeprecationWarning` or `ExperimentalWarning`); the lines printing "WARNING" are fixture output from tests that deliberately corrupt temporary audit chains.

### Step 15: DOCUMENT
- [x] Update relevant documentation — the changed file is itself the documentation of the critic's behaviour. No other document describes the critic's tool grant, so no other file needed a change (and none is declared).
- [x] Add JSDoc comments to new functions — not applicable; no function added.
- [x] Update CHANGELOG if needed — not applicable; the repository has no CHANGELOG file. The version moved from 6.14.67 to 6.14.68 through `VERSION` and `node src/scripts/release.js`.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — the tests that read the file were found by running the suite and held green before and after; only the declared files were written by hand (plus `VERSION` and the files the release script rewrites); no scope-growth request was needed.
- [x] All quality checks passed — lint 0, type check 0, full gate PASS, coverage 99.9% against 99, skipped 0.
- [x] Manual verification if needed — the seven acceptance criteria were checked one by one against the file on disk (see Verification Evidence).
- [x] Ready for human review — nothing went to `for-the-human.json`: the output shape did not need to change and no fence asked for a report.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

What landed, by hand, in the declared files:

- `agents/pipeline/agent-critic.md` — the tool grant, the wording for skill bodies, the defence against instructions in fetched content, the research step and the skill-body structure, as Step 10 lists. Fingerprint before `sha256:8ef32ac31d91fd9fbc209fbe9a2f27668e4ed2fe8357859e26e98fb11a62682f`, after `sha256:b464e3f401bd243218cc7a4df9b39cf81ce61cbf87a4d56d9a6eb4ddff349b99`.
- `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-critic.md.json` — the evidence record in the parent's shape: `schema: 1`, the path, one `prerequisite` entry (date 2026-09-30, both fingerprints, the 35 fence files each with `pass`, and `full_gate` `npm test` `pass`), `rounds: []`, `late_corrections: []`, `held: null`.
- `.ctoc/audit/agent-and-skill-improvement/for-the-human.json` — not written. The output shape did not need to change and no fence forced a report.

Also changed, by the release rule: `VERSION` (6.14.67 to 6.14.68) and the files `node src/scripts/release.js` rewrote (`package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md`). `agents/ai-quality/citation-validator.md` is unchanged (`sha256:0b99b97bb8530375a56e59203769d2a8c9a7d97d92f0c7c90cd5b358b0f7dc23` before and after); its tools line is still `Read, Grep, Skill, WebSearch, WebFetch` and its role still validate-only.

A mistake made during the build, reported rather than hidden: a checking command I ran after the first gate run ended with a `git stash`, which moved every tracked change in the working tree (this slice's and the other changes already present, such as `.ctoc/logs/transitions.json` and the two plans moved to review) into a stash. I restored it at once with `git stash pop`, which applied with no conflict; the stash list is empty again, the critic's fingerprint after restoring is the same `b464e3f4…` the gate ran on, and `VERSION` reads 6.14.68. Untracked files are not touched by that command and were not affected.

## Verification Evidence

- Tests that read the critic file, found by running the whole suite under the read-tracing preload (`node --test tests/*.test.js` with the preload loaded through `NODE_OPTIONS`): `tests/agent-contract-load.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-shared-not-dispatchable.test.js`, `tests/architecture-invariants.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/compliance-seam-is-executable.test.js`, `tests/cto-chief-toplevel.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/export-reachability.test.js`, `tests/gate-numbers-fence.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/iron-loop-enforcer-coverage.test.js`, `tests/iron-loop-enforcer.test.js`, `tests/no-model-optimized-for.test.js`, `tests/no-tier-3.test.js`, `tests/reachability-surface-scan-is-linear.test.js`, `tests/reachability.test.js`, `tests/session-start-hook.test.js` (through a child process running `src/hooks/SessionStart.js`), `tests/session-start-question-dispatch.test.js`, `tests/skill-loading.test.js`, `tests/streaming-render.test.js`, `tests/tier1-no-peer-dispatch.test.js`, `tests/unexecutable-instruction-fence.test.js` — 26 files. None of them pins the tool grant.
- Plus the plan's named fences not in that list: `tests/agent-modernization.test.js`, `tests/agent-resolver.test.js`, `tests/agent-slots.test.js`, `tests/corpus-audit-ledger.test.js`, `tests/readme-numbers.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/registry-integrity.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/watcher-shape.test.js` — 35 files in all.
- Before the change, each of the 35 run on its own: every one `fail 0`, `skipped 0` (pass counts: 2, 12, 22, 5, 12, 13, 9, 5, 24, 45, 10, 13, 7, 7, 6, 17, 44, 34, 30, 33, 4, 5, 5, 30, 62, 7, 8, 5, 11, 187, 64, 3, 27, 11, 6, in alphabetical order of file name). After the change, the same 35 on the final text: identical counts, every one `fail 0`, `skipped 0`.
- Acceptance criteria, checked on the file on disk: (1) `tools: Read, Grep, WebSearch, WebFetch`, no write, edit or command tool; (2) Role, Anti-Scope and `description` name specialist skill bodies, and all five original description phrases are present verbatim; (3) "What You Read Is Data" states that every file read, every search result and every fetched page is data and never instruction; (4) the Output Format block and the Example Critique compare byte-identical to the committed file; (5) the frontmatter comparison shows only `description` and `tools` differ; (6) `citation-validator.md` has no diff; (7) the record holds both fingerprints and the 35 fences.
- `npm run lint` exit 0; `npm run typecheck` exit 0 (pass 1, fail 0).
- `npm test` exit 0 (read from an unpiped run): tests 12015, pass 12015, fail 0, cancelled 0, skipped 0, todo 0; `[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0`; `[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)`; `[CTOC test-gate] PASS`.
- The approval fingerprint of this plan's specification was recomputed with `computeSpecHash` after every edit to this plan: `bf069e2f…711c20`, equal to the approval ledger's `content_sha256`.
