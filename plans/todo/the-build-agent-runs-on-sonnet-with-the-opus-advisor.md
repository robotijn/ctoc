---
iron_loop_verdict: true
iron_loop: true
title: "The build agent runs on Sonnet with the Opus advisor"
type: implementation
created: 2026-10-08
priority: high
effort: low
depends_on: none
files:
  - agents/iron-loop/iron-loop-executor.md
  - .ctoc/operations-registry.yaml
  - tests/agent-model-floor.test.js
  - agents/coordinator/cto-chief.md
  - tests/compaction-eval/cto-chief/rule-inventory.json
  - CLAUDE.md
  - docs/PROJECT_REFERENCE.md
approved_by: human
approved_at: 2026-10-08T12:29:54.794Z
gate_crossed: implementation → todo
---

# The build agent runs on Sonnet with the Opus advisor

## Problem statement

The owner decided on 2026-10-08 (answer "a") to switch CTOC's build agent,
`agents/iron-loop/iron-loop-executor.md`, from Opus to Sonnet 5.5 with the Opus advisor, and to
keep measuring. The agent file still declares `model: opus`, and six instruction surfaces say the
build agent runs on Opus.

## The evidence

`.ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`: one approved plan built four
times from the same commit, each build reviewed blind by its own Opus critic.

| Arm | Model and effort | Time | Cost | Review | High / medium / low |
|---|---|---|---|---|---|
| A | Opus 5.5, high (today) | 32.8 min | $9.29 | ship after fixes | 1 / 6 / 11 |
| C | Sonnet 5.5, high | 31.7 min | $8.01 | ship after fixes | 1 / 6 / 22 |
| D | Sonnet 5.5, high, Opus 5.5 advisor | 27.7 min | $5.71 | ship after fixes | 1 / 6 / 11 |

Arm D against arm A: 39% cheaper ($5.71 / $9.29), 15% faster (27.7 / 32.8), same review band.
The trial's own caveat: one task, one run per arm. Evidence, not proof.

The advisor is not CTOC's to set. Stated by the session's brief (2026-10-08), not read by this
planner: the user's Claude Code settings hold `advisorModel: opus` in every profile; a subagent
inherits the configured advisor and applies the pairing check against its own model, and a
Sonnet 5.5 main model accepts an Opus 5 or later advisor. Nothing in CTOC's code sets the
advisor, and this plan adds nothing that does. The smoke dispatch in Step 14 is the runtime check
that the inheritance holds.

## Technical approach

Every line below was read in this session. Line numbers are as of this writing.

### Changed

1. `agents/iron-loop/iron-loop-executor.md:5` — `model: opus` → `model: sonnet`. `effort: high`
   (line 6) stays byte-identical: the owner measures effort separately. The body (lines 13–334)
   states no model, so it does not change.
2. `.ctoc/operations-registry.yaml:78` — `model: opus` → `model: sonnet` under the
   `iron-loop-executor:` entry (line 76). `tests/agent-dispatch-resolution.test.js:192–196`
   asserts that the registry's model equals the model the agent file declares, so the two change
   together.
3. `tests/agent-model-floor.test.js`:
   - `SONNET_EXEMPT` (lines 165–182) gains one entry, placed after
     `'infrastructure/deployment-setup'`:
     ```js
     'iron-loop/iron-loop-executor':
       "Actuator — the builder; it writes the code the watchers judge, and is not a watcher. Sonnet with the Opus advisor by the owner's decision of 2026-10-08, on the measured trial in .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md: the same blind-review quality as Opus, 39% cheaper, about 15% faster. Every watcher stays on Opus, above it.",
     ```
   - One new case in `describe('fence: agent model floor')`, after "the sonnet exemption list is
     exhaustive and accurate":
     ```js
     it("the build agent declares `model: sonnet`, justified by the owner's decision of 2026-10-08", () => {
       const id = 'iron-loop/iron-loop-executor';
       const builder = AGENTS.find((a) => a.id === id);
       assert.ok(builder, `agents/${id}.md is missing`);
       assert.equal(builder.model, 'sonnet',
         `agents/${id}.md declares model: ${builder.model ?? '(none)'}; the owner chose sonnet with the Opus advisor on 2026-10-08`);
       const reason = SONNET_EXEMPT[id] ?? '';
       assert.match(reason, /2026-10-08/);
       assert.match(reason, /MODEL-TRIAL-2026-10-08\.md/);
       assert.ok(!WATCHERS.includes(id), 'the builder is not a watcher');
     });
     ```
   - Text that says the builder is Opus, and only that text. No comparison, list, count or
     threshold changes.
     - Lines 5–6, comment. Old: "The code writer at Iron Loop Step 10 is Opus. Any agent that
       READS CODE OR ARTIFACTS AND EMITS FINDINGS — a "watcher" — is therefore Opus too." New:
       "The code writer at Iron Loop Step 10 is Sonnet with the Opus advisor (owner's decision,
       2026-10-08). Any agent that READS CODE OR ARTIFACTS AND EMITS FINDINGS — a "watcher" — is
       Opus, above the builder."
     - Lines 123–124, comment. Old: "Every one of these judges Opus-written code, so every one
       of these runs on Opus." New: "Every one of these runs on Opus, above the Sonnet builder
       whose code it judges."
     - Lines 393–395, failure message. Old: "The code it judges was written at Iron Loop Step 10
       by OPUS. A reviewer weaker than the builder does not review — it produces a green record.
       Every watcher runs on opus." New: "The code it judges was written at Iron Loop Step 10 by
       Sonnet with the Opus advisor. A reviewer weaker than the builder does not review — it
       produces a green record. Every watcher runs on opus, above the builder."
     - Line 444, failure message. Old: "Sonnet is below the floor set by the builder (Opus
       writes the code at Step 10)." New: "Sonnet is below the watcher floor: every watcher runs
       on Opus, above the Sonnet builder."
     - Line 525, failure message. Old: "A watcher reads Opus-written code and emits findings".
       New: "A watcher reads the built code and emits findings".
   - The rule still holds, and it is still enforced: no agent outside `SONNET_EXEMPT` may
     declare sonnet, none may declare haiku, and every `WATCHERS` member must declare opus. So
     every reviewer is Opus, which is above the Sonnet builder.
4. `CLAUDE.md:129, 130, 131, 133, 135, 136` — the Iron Loop table rows for Steps 8, 9, 10, 12, 14
   and 15: `iron-loop-executor (opus)` → `iron-loop-executor (sonnet)`, plus 12 bytes.
   `tests/fixtures/claude-md-rule-inventory.json` holds no rule with these rows (it has no
   `(opus)` and no `executor` text), so no replaced-rule entry is needed.
5. `docs/PROJECT_REFERENCE.md:180, 181, 182, 184, 186, 187` — the same six rows, same change.
   Model rules: one paragraph is inserted after line 26, before `## Step-driven question
   routing`:
   > **The build agent runs on Sonnet with the Opus advisor** (owner's decision, 2026-10-08, on the measured trial in `.ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`: the same blind-review quality as Opus, 39% cheaper, about 15% faster). `iron-loop-executor` declares `model: sonnet`. The advisor comes from the user's Claude Code setting `advisorModel`, which a subagent inherits; CTOC sets and checks nothing about it. When the advisor is off (`CLAUDE_CODE_DISABLE_ADVISOR_TOOL`, or a variable that turns telemetry off), the builder runs on Sonnet alone, which the trial measured in the same review band but slower and dearer than with the advisor. Every watcher stays on Opus, so no reviewer thinks with a smaller model than the builder; `tests/agent-model-floor.test.js` holds both.
6. `agents/coordinator/cto-chief.md:329, 340, 353, 410, 445, 473` — the "Owner sub-orchestrator"
   lines of Steps 8, 9, 10, 12, 14 and 15: `` `iron-loop-executor` (opus). `` →
   `` `iron-loop-executor` (sonnet). ``, plus 12 bytes.
7. `tests/compaction-eval/cto-chief/rule-inventory.json` — the six orders that hold those lines
   word for word:

   | Order (inventory line) | Unit (inventory line) | Old anchor → new anchor |
   |---|---|---|
   | R-197 (6416) | 197 (1648) | `` ests FIRST) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |
   | R-204 (6466) | 204 (1707) | `` shift-left) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |
   | R-213 (6536) | 213 (1784) | `` n one step) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |
   | R-257 (6916) | 257 (2168) | `` erformance) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |
   | R-284 (7146) | 284 (2403) | `` ality gate) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |
   | R-306 (7346) | 306 (2597) | `` ion update) Owner sub-orchestrator: `iron-loop-executor` (opus). `` → `(sonnet).` |

   Each order keeps its `id`, `says`, `now_in`, `anchors`, `pinned_by` and `wire` and gains
   `"fate": "replaced"` and:
   ```json
   "replaced_by": {
     "instruction": "The owner, 2026-10-08 (answer \"a\"): the build agent iron-loop-executor runs on Sonnet 5.5 with the Opus advisor instead of Opus, on the measured trial in .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md, and keeps being measured.",
     "date": "2026-10-08",
     "plan": "the-build-agent-runs-on-sonnet-with-the-opus-advisor",
     "new_anchors": ["<the old anchor with (opus) replaced by (sonnet)>"]
   }
   ```
   Each of the six units goes from `"fate": "kept"` to `"fate": "replaced"`; its `kind` stays
   `order`. `maxBytes` (line 6, 54,303) changes only if Step 9 measures that the agent plus 12
   bytes exceeds it, and then by exactly the overage. The baseline
   (`tests/compaction-eval/cto-chief/baseline-agent.md`, lines 359, 370, 383, 440, 475 and 503
   carry the old words) is pinned by its sha256 and is never edited.

### Read and left as they are

- `docs/IRON_LOOP.md:660–681`, "Agent Registry". It never names `iron-loop-executor` or the
  build agent's model, and nothing else in the file names a model. The table lists the ten step
  agents retired when the work folded into the iron-loop trio (`test-maker | opus | 8`,
  `implementer | sonnet | 10`, and eight more). It is untrue on a subject of its own, so it is
  listed here for the owner and not corrected.
- `docs/PROJECT_REFERENCE.md:12`: "Tier 2 Watchers / specialists (99) Opus". The executor is
  tier 1 (its frontmatter says `tier: 1`), so this line stays true.
- `docs/PROJECT_REFERENCE.md:26` (held word for word by `tests/fixtures/claude-md-rule-inventory.json:49`),
  `docs/AGENT_ARCHITECTURE.md:205` and `:235`, `tests/no-tier-3.test.js:102` and
  `tests/agent-model-floor.test.js:419` speak of "Opus-written code". Each one is either the
  history of why Haiku was removed on 2026-07-17 or a conditional rule that stays true. None
  states the builder's model.
- `agents/coordinator/cto-chief.md:132`: watchers "think with Opus". This stays true.
- `tests/agent-model-floor.test.js:232–233`, the effort exemption for the executor ("the BUILDER
  the watchers judge, not a watcher"). This stays true.

## Agent rules this slice replaces or adds

The owner replaced the build agent's model on 2026-10-08. These are the compaction-inventory
orders this slice may mark replaced or added, and no others:

- `agents/coordinator/cto-chief.md` — replaced: R-197, R-204, R-213, R-257, R-284, R-306; added: none.

## Wiring

No new module. Claude Code reads `model:` from `agents/iron-loop/iron-loop-executor.md` each time
the build agent is dispatched, so the next build runs on Sonnet, and the advisor attaches from the
user's settings. The changed tests already run inside `npm test`. The smoke dispatch in Step 14 is
the runtime check that the change reaches a real dispatch.

## Acceptance criteria

- [x] Test first: with only the test file and the inventory edited, the run is red on exactly
  four cases. In the model-floor test: the new case and "the sonnet exemption list is exhaustive
  and accurate" (the new entry is stale while the agent still says opus). In the CTO Chief
  inventory: checks 4 and 10 (the new anchors are absent and the old words are present). Every
  other case is green.
- [x] `agents/iron-loop/iron-loop-executor.md` declares `model: sonnet` and `effort: high`.
  No other byte of the file changes.
- [x] `.ctoc/operations-registry.yaml:78` reads `model: sonnet`, and
  `tests/agent-dispatch-resolution.test.js` passes unchanged.
- [x] `tests/agent-model-floor.test.js` loosens nothing. `WATCHERS`, `HAIKU_EXEMPT`,
  `EFFORT_EXEMPT`, `EFFORT_LEVELS`, `TOP_EFFORT`, `MIN_AGENT_FILES` and every comparison are
  byte-identical. `SONNET_EXEMPT` grows by exactly one entry. Only the five texts named above
  change.
- [x] The six rows in `CLAUDE.md`, the six rows in `docs/PROJECT_REFERENCE.md` and the six lines
  in `agents/coordinator/cto-chief.md` say `(sonnet)`. No instruction surface still says
  `iron-loop-executor (opus)` or `` `iron-loop-executor` (opus) `` (a literal presence check over
  `agents/`, `docs/`, `skills/` and `CLAUDE.md`). The model-rules paragraph stands after
  `docs/PROJECT_REFERENCE.md:26` as written above.
- [x] `CLAUDE.md` is at or under 15,000 bytes, and `tests/claude-md-keeps-every-rule.test.js`
  passes. `agents/coordinator/cto-chief.md` is at or under the inventory's `maxBytes`, and
  `tests/cto-chief-compaction.test.js` passes all ten checks.
- [x] `npm test`: 0 failed, 0 skipped, coverage at or above `.ctoc/coverage-baseline.json`
  `minPct`.
- [x] Measured: one smoke dispatch of `iron-loop-executor` after the change. Its transcript shows
  the model identifier and whether the Opus advisor answered, and the record quotes both. If the
  transcript holds no advisor call, the record says the advisor was not exercised, never that it
  works.

## Risks

| Risk | Mitigation |
|---|---|
| The advisor is off when `CLAUDE_CODE_DISABLE_ADVISOR_TOOL` or a telemetry-disabling variable is set, when a user has no `advisorModel`, or when the pairing check refuses the advisor. The builder then runs on Sonnet alone | Recorded, not prevented. The trial measured Sonnet alone in the same review band (arm C: ship after fixes, 1 / 6 / 22), 3% faster and 14% cheaper than Opus, but slower and dearer than with the advisor. The reviewers at Steps 11, 13 and 16 stay on Opus either way. The model-rules paragraph says so. CTOC detects nothing here; only the smoke dispatch observes it |
| The evidence is one task, one run per arm | The owner's decision is to keep measuring. This plan changes the model and adds no measuring tool. Its one measurement is the smoke dispatch |
| A dispatcher passes the Agent tool's own `model` setting and overrides the frontmatter | The smoke dispatch shows the model the agent actually ran on |
| `CLAUDE.md` has little room: last recorded at 14,971 bytes (`plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md:47`), and about twenty in-flight plans declare `CLAUDE.md` | Plus 12 bytes gives 14,983. Measured at Steps 9 and 14. If it does not fit, the build stops and asks the owner. The 15,000 ceiling is never raised and no other sentence is cut to make room |
| `agents/coordinator/cto-chief.md` may sit at its ceiling (54,303) | Measured at Step 9. The ceiling rises only by the measured overage, at most 12 bytes, recorded as one correction |
| This plan is built after a machine crossing instead of the owner's own approval | Inventory check 3 accepts a replaced order only under a human (or backfilled) approval of this plan's current specification, so Step 14 would fail. Step 9 checks the approval first and stops if it is not the human's |
| Other plans edit the same files (`00376` CTO Chief and `00378` build-agent improvement slices in `todo/`; `the-manual-and-the-docs-stop-claiming-what-ctoc-no-longer-does`, the hotfix slice 4 and `dispatched-agents-route-their-questions-to-the-session` declare `cto-chief.md`, its inventory or `PROJECT_REFERENCE.md`) | The scheduler serializes by file. The CTO Chief inventory's new anchors hold `(sonnet)`, so a later rewrite cannot drop it silently. Slice 00378 keeps every frontmatter key, `model:` included, byte-identical by its own rule. Step 11 checks that whichever lands second keeps the other's text and records |
| The trial file is cited in a test's reason string but may not be tracked by git | Step 9 runs `git ls-files` on it. If it is untracked, the execution record says so, so the commit carries it with this change |

## Decisions Taken Under Ambiguity

1. **One plan for seven files.** It is one decision made of text edits plus one red case.
   Splitting it would leave the suite red between slices: the registry would disagree with the
   agent file, and the inventory would disagree with the CTO Chief.
2. **The rows say `(sonnet)`, not `(sonnet, Opus advisor)`.** `CLAUDE.md` has little room. The
   advisor is stated once, in the `docs/PROJECT_REFERENCE.md` model rules.
3. **The three failure messages change along with the two comments.** They are what a reader
   of a red run sees, and they would state the old builder as fact. They are text, not assertion
   logic.
4. **No assertion is added for "a reviewer is never smaller than the builder".** It already
   follows from the cases that stand: no sonnet outside the exemption list, no haiku, every
   watcher opus. A rank comparison would duplicate them.
5. **`docs/IRON_LOOP.md` is not changed.** It never names the build agent or its model. Its
   registry of ten retired step agents is listed for the owner.
6. **This plan needs the owner's own approval before it is built** (inventory check 3; same as
   Decision 21 of `ctoc-keeps-working-and-asks-only-what-matters-s3-instructions-say-what-the-code-does`).
7. **The smoke dispatch is the session's to run.** The build agent does not dispatch agents.
8. **This planner holds no shell**, so neither byte count was measured here. Both are measured
   at Step 9.

## Execution Plan

### Step 8: TEST
- [x] Add the `SONNET_EXEMPT` entry and the new case to `tests/agent-model-floor.test.js`,
  exactly as written above.
- [x] Mark the six orders and six units in `tests/compaction-eval/cto-chief/rule-inventory.json`
  as written above.
- [x] Run `node --test tests/agent-model-floor.test.js tests/cto-chief-compaction.test.js`. It must
  be red on exactly the four cases named in the first acceptance criterion, and green on every
  other case.

### Step 9: PREPARE
- [x] Read `.ctoc/approvals/the-build-agent-runs-on-sonnet-with-the-opus-advisor.json`. It must
  carry `approved_by: human` and `hash_scope: specification`, and its `content_sha256` must equal
  `computeSpecHash` (`src/lib/approval-ledger.js`) of this plan. If it does not, stop and say so.
- [x] Measure the bytes of `CLAUDE.md` and of `agents/coordinator/cto-chief.md`, and record both
  with the cto-chief `maxBytes`. If `CLAUDE.md` plus 12 exceeds 15,000, stop and ask.
- [x] Run `git ls-files .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md` and
  record the result. Record `claude --version`.

### Step 10: IMPLEMENT
- [x] `agents/iron-loop/iron-loop-executor.md:5`: `model: sonnet`.
- [x] `.ctoc/operations-registry.yaml:78`: `model: sonnet`.
- [x] `agents/coordinator/cto-chief.md`: the six lines, `(opus)` → `(sonnet)`. Raise the inventory
  `maxBytes` only by a measured overage.
- [x] `CLAUDE.md` and `docs/PROJECT_REFERENCE.md`: the six table rows each.
- [x] `tests/agent-model-floor.test.js`: the five texts at lines 5–6, 123–124, 393–395, 444 and
  525.

### Step 11: REVIEW
- [x] The critic reads the diff of `tests/agent-model-floor.test.js`. It may contain only the new
  entry, the new case and the five texts; every list, constant and comparison is byte-identical.
- [x] The critic re-reads every line listed under "Changed" and "Read and left", and runs the
  literal presence check for the two old forms.

### Step 12: OPTIMIZE
- [x] Confirm the new case reuses `AGENTS` and `SONNET_EXEMPT` and reads nothing new from disk.

### Step 13: SECURE
- [x] The security scanner confirms that the build agent's `tools:` line, its network rule and its
  refusal rules are byte-identical, that the reviewers at Steps 11, 13 and 16 still declare opus,
  and that nothing writes the user's Claude Code settings.

### Step 14: VERIFY
- [x] `npm test`: 0 failed, 0 skipped, coverage at or above the floor. Re-measure `CLAUDE.md` and
  `agents/coordinator/cto-chief.md`.
- [x] Name the smoke dispatch for the session to run: `iron-loop-executor` with a brief that
  changes no file, names the model it runs on and puts one question to its advisor. The session
  quotes the model identifier and the advisor lines from the transcript into the execution
  record, or writes that the advisor was not exercised.

### Step 15: DOCUMENT
- [x] Insert the model-rules paragraph after `docs/PROJECT_REFERENCE.md:26`, word for word as
  above.

### Step 16: FINAL-REVIEW
- [x] Check every acceptance box against its evidence. The smoke result is quoted, not
  summarised.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

Built on a worktree based on main at `56fb8b43` (v6.14.121), 2026-10-08. Steps 11, 13 and 16, and
the smoke dispatch named in Step 14, are the session's.

### Step 9 measurements (taken before any agent or instruction file changed)

- Approval record: `approved_by: human`, `hash_scope: specification`, `content_sha256`
  `34779259d49d4bf775d22879b184873d78b6d3735ce181f1957121e041db0c51`; `computeSpecHash` of this
  plan returned the same digest before editing and again after this record was written.
- `CLAUDE.md`: 14,971 bytes before, 14,983 after (ceiling 15,000).
- `agents/coordinator/cto-chief.md`: 54,303 bytes before (inventory `maxBytes` 54,303), 54,315
  after. Measured overage 12 bytes; `maxBytes` raised 54,303 → 54,315, recorded once under
  `ceiling_corrections` (2026-10-08).
- `git ls-files .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`: empty. The trial
  file is NOT tracked on main; it exists only in the main checkout's working tree. It is outside
  this plan's `files:`, so this commit does not carry it; the session must commit it so the test's
  reason string and the reference paragraph cite a tracked file.
- `claude --version`: 2.1.293 (Claude Code).

### Step 8 red (test file and inventory edited only)

`node --test tests/agent-model-floor.test.js tests/cto-chief-compaction.test.js`: tests 33, pass
29, fail 4, skipped 0. The four red cases, exactly the four the first acceptance criterion names:

| Case | Red reason |
|---|---|
| model floor: the sonnet exemption list is exhaustive and accurate | stale entry `agents/iron-loop/iron-loop-executor.md` |
| model floor: the build agent declares `model: sonnet`, justified by the owner's decision of 2026-10-08 | declares `opus` |
| CTO Chief inventory check 4 | six `(sonnet).` anchors missing (R-197, R-204, R-213, R-257, R-284, R-306) |
| CTO Chief inventory check 10 | the same six orders: old `(opus).` anchors replaced-but-present |

Inventory check 3 (replaced order under a human approval) was green from the start.

### Step 10 green

After the five source edits, `node --test` over `tests/agent-model-floor.test.js`,
`tests/cto-chief-compaction.test.js`, `tests/agent-dispatch-resolution.test.js` and
`tests/claude-md-keeps-every-rule.test.js`: tests 52, pass 52, fail 0, skipped 0. Every one of
the four red cases is green.

### Step 14 VERIFY

- `npm test`: tests 12,757, pass 12,757, fail 0, cancelled 0, skipped 0, todo 0; coverage 99.87%
  (floor 99%); corpus claims verified 3, refuted 0; `[CTOC test-gate] PASS`.
- `eslint --max-warnings 0 tests/agent-model-floor.test.js`: clean.
- Literal presence check for `iron-loop-executor (opus)` and `` `iron-loop-executor` (opus) `` over
  `agents/`, `docs/`, `skills/` and `CLAUDE.md`: 0 occurrences.
- `git diff` of `agents/iron-loop/iron-loop-executor.md` and `.ctoc/operations-registry.yaml`:
  one line each, `model: opus` → `model: sonnet`; `effort: high` unchanged.
- `tests/agent-model-floor.test.js` diff: the one `SONNET_EXEMPT` entry, the one new case, the five
  texts. `WATCHERS`, `HAIKU_EXEMPT`, `EFFORT_EXEMPT`, `EFFORT_LEVELS`, `TOP_EFFORT`,
  `MIN_AGENT_FILES` and every comparison untouched.
- Smoke dispatch for the session to run: dispatch `iron-loop-executor` with a brief that changes no
  file, asks it to state the model it runs on, and puts one question to its advisor. Quote the
  model identifier and the advisor lines from the transcript here, or write that the advisor was
  not exercised.

### Step 15

The model-rules paragraph stands after the "No agent declares `model: haiku`" paragraph in
`docs/PROJECT_REFERENCE.md`, before `## Step-driven question routing`, word for word.

### Builder's decisions

1. These decisions live here and not under `## Decisions Taken Under Ambiguity`, because that
   section is inside the approved specification hash and this record is not.
2. The trial file is left uncommitted (see Step 9): committing it would touch a file outside
   `files:`. Recorded for the session instead of asked through scope growth, because no write to
   it is needed — only its tracking.
3. The `ceiling_corrections` entry follows the shape of the existing 2026-10-07 entry
   (`date`, `from`, `to`, `reason`).

### Step 13 tightening (the security check's warning, 2026-10-08)

The security check warned that the model-floor test's header claims no reviewer thinks with a
smaller model than the builder, while `iron-loop/iron-loop-critic` (Steps 11 and 16) and
`security/security-scanner` (Step 13) were not on `WATCHERS`, so only the Sonnet exemption list
guarded them. By the coordinator's direction this round changes `WATCHERS`, which the plan's
fourth acceptance criterion had held byte-identical; it only tightens.

- Before adding: both agents declare `model: opus` and `effort: xhigh`; neither is in
  `EFFORT_EXEMPT`, so the watcher effort guard ("no agent the owner ruled on is exempt from the
  effort floor") holds for both. No other test reads `WATCHERS`. `iron-loop/iron-loop-integrator`
  is left alone (classed as an actuator).
- Change in `tests/agent-model-floor.test.js`: `loadAgents` now maps through a one-file
  `loadAgent(file, id)`; the watcher comparison moved, text unchanged (`a.model !== 'opus'`), into
  `watchersBelowFloor(byId)`, which the existing watcher case calls. New case "the reviewers of
  Steps 11, 13 and 16 are watchers: a sonnet copy of either fails the watcher floor": for each of
  the two agents it writes a temporary copy of the real file with only `model: opus` →
  `model: sonnet`, parses its frontmatter, swaps it into the corpus map, and asserts the watcher
  floor reports exactly that agent.
- Red: `node --test tests/agent-model-floor.test.js`: tests 14, pass 13, fail 1, skipped 0; the new
  case failed with `actual: []` (the sonnet copy was not caught).
- Green after adding both ids to `WATCHERS` (in sorted position): the model-floor, CTO Chief
  compaction, dispatch resolution, `CLAUDE.md` rule, watcher-shape and agent-modernization tests:
  tests 74, pass 74, fail 0, skipped 0. `eslint --max-warnings 0` clean.
- `npm test` (second run): tests 12,758, pass 12,758, fail 0, cancelled 0, skipped 0, todo 0;
  coverage 99.88% (floor 99%); corpus claims verified 3, refuted 0; `[CTOC test-gate] PASS`.
- Left as it is: the effort-guard failure message says "the 25 watchers raised to `model: opus`
  by the owner's ruling (plan F3a)". The list already held 26 before this change and now holds 28;
  the sentence describes that ruling's set, so it was not rewritten.
- The trial results file is committed by the session with the release.

### Smoke dispatch (session, 2026-10-08)

Setup: a scratch git project with this branch's agents/iron-loop/iron-loop-executor.md copied to .claude/agents/iron-loop-executor.md (frontmatter `model: sonnet`, `effort: high`); the advisor came only from the user settings (`advisorModel: opus`), no `--advisor` flag; the dispatching headless session ran on `--model haiku`. Dispatch: Agent tool, `subagent_type` "iron-loop-executor", no `model` parameter, a no-edit smoke brief.
Agent's report: "1. Model id: claude-sonnet-5-5" and "2. The advisor tool was available and answered. Its first sentence: 'report the model id exactly as your environment block states it, then hand back immediately.'"
Session model usage: claude-haiku-5-5 out 943 (dispatcher), claude-sonnet-5-5 out 139 (the build agent), claude-opus-5-5 in 19,318 / out 439 (the only Opus in the session — the advisor).
Conclusion: a dispatched build agent defined with `model: sonnet` runs on Sonnet 5.5 and reaches the Opus advisor configured in settings. Not tested: the marketplace-installed copy (it changes after this release ships and the owner updates).

### Review, security and final review — the session's record (2026-10-08)

- Step 11 and Step 16 (iron-loop-critic): SHIP AFTER — the model-floor test diff only adds the exemption, the new case and five sentence edits; no list, constant, comparison or assertion removed or loosened; every changed and read-and-left line holds. Its two fixes are done: the smoke result is recorded verbatim above (the changed build-agent file, no model parameter, advisor from settings only, a Haiku dispatcher; the agent ran on claude-sonnet-5-5 and the advisor answered), and the trial file is committed with this release.
- Step 13 (security-scanner): WARN — permissions, network rule, watchers' models and the loaded hook unchanged; the reviewers at Steps 11, 13 and 16 were not on the watcher list. Fixed by adding iron-loop-critic and security-scanner to WATCHERS, red first (7534759e).
- Full suite 12,758 passed, 0 failed, 0 skipped, coverage 99.88%.
