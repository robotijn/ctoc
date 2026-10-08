---
iron_loop_verdict: true
iron_loop: true
title: "The iron-loop critic thinks at high effort"
type: implementation
created: 2026-10-08
priority: high
effort: low
depends_on: none
files:
  - agents/iron-loop/iron-loop-critic.md
  - tests/agent-model-floor.test.js
  - docs/AGENT_ARCHITECTURE.md
approved_by: human
approved_at: 2026-10-08T20:11:43.190Z
gate_crossed: review → done
---

# The iron-loop critic thinks at high effort

## Problem statement

The owner decided on 2026-10-08 (answer "a") to move the iron-loop critic,
`agents/iron-loop/iron-loop-critic.md`, from `effort: xhigh` to `effort: high`. The security
scanner stays at `xhigh`, and both stay on Opus. This changes his ruling of 2026-07-17 (every
watcher thinks at the top effort, "ok let the agents have xhigh") for this one agent only.

`tests/agent-model-floor.test.js` holds every watcher at `xhigh` and keeps watchers out of the
effort exemption map, so the change needs one narrow exception there: this agent, exactly `high`.

## The evidence

`.ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`, section "Effort trial": the same
critic instructions reviewed one build three times, headless, scored against six known important
problems in that build.

| Effort | Time | Cost | Known problems found | High findings |
|---|---|---|---|---|
| extra-high (today) | 21.9 min | $4.54 | 5 of 6 | 2 |
| high | 12.5 min | $4.03 | 5 of 6 | the same 2 |
| medium | 10.7 min | $3.39 | 4 of 6 | the same 2 |

High against extra-high: 43% less time (12.5 / 21.9), 11% cheaper, the same findings. The trial's
own caveat: one build each, evidence, not proof.

## Technical approach

Every line below was read in this session. Line numbers are as of this writing.

### Changed

1. `agents/iron-loop/iron-loop-critic.md:6` — `effort: xhigh` → `effort: high`. `model: opus`
   (line 5) and every other byte stay as they are. Line 25 ("name effort levels") is about the
   critic's own prompts, not its effort, and stays.

2. `tests/agent-model-floor.test.js`:
   - **New, after line 349** (`const TOP_EFFORT = 'xhigh';`):
     ```js
     /**
      * WATCHER_EFFORT — the ONLY watchers held to an effort other than TOP_EFFORT, each at exactly
      * one level, with the owner's decision that set it. This is NOT an exemption: EFFORT_EXEMPT
      * stays closed to watchers (case 5 below), and a watcher here is held to its one level as
      * strictly as every other watcher is held to TOP_EFFORT. Lower fails, and higher fails too:
      * a decision nobody uses is removed, like a stale exemption.
      */
     const WATCHER_EFFORT = {
       'iron-loop/iron-loop-critic': {
         effort: 'high',
         reason:
           "The owner's decision of 2026-10-08 (answer \"a\"), changing his ruling of 2026-07-17 for this agent only: on the effort trial in .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md the critic at high found the same 5 of 6 known problems and the same two high findings as at extra-high, in 43% less time. It stays on Opus; the security scanner stays at xhigh.",
       },
     };

     /** The one effort `id` must declare: its owner decision in WATCHER_EFFORT, else TOP_EFFORT. */
     function requiredEffort(id) {
       return Object.hasOwn(WATCHER_EFFORT, id) ? WATCHER_EFFORT[id].effort : TOP_EFFORT;
     }

     /** The agents outside EFFORT_EXEMPT whose declared effort is not exactly the one required. */
     function offEffortFloor(agents) {
       return agents.filter((a) => !(a.id in EFFORT_EXEMPT) && a.effort !== requiredEffort(a.id));
     }
     ```
     `Object.hasOwn` is in Node 16.9 and later; `package.json` requires Node 18 or later.
   - **Case 1** ("every non-exempt agent declares `effort: xhigh`"):
     - line 565, `const nonExempt = ...`, is removed (its only caller moves to `offEffortFloor`);
     - line 569, title → "every non-exempt agent declares `effort: xhigh`, or the one level
       WATCHER_EFFORT sets";
     - line 570, `nonExempt().filter((a) => a.effort !== TOP_EFFORT)` → `offEffortFloor(AGENTS)`;
     - line 581, `— must be ${TOP_EFFORT}` → `— must be ${requiredEffort(a.id)}`;
     - line 583, `FIX: set \`effort: ${TOP_EFFORT}\`.` → `FIX: set the effort named above.`
   - **Case 3** ("the effort exemption map is exhaustive and accurate"):
     - line 638, `a.effort !== TOP_EFFORT` → `a.effort !== requiredEffort(a.id)`;
     - line 643, "think below \`${TOP_EFFORT}\` without a written justification" → "think at an
       effort other than the one this file requires (\`${TOP_EFFORT}\`, or the level
       WATCHER_EFFORT sets) without a written justification".
     The stale check (line 650) and the reason check stay byte-identical.
   - **Line 208**, comment: "the ONLY agents permitted to declare an effort below `max`" → "the
     ONLY non-watchers permitted to declare an effort below `xhigh`". (Case 5 already keeps every
     watcher out of the map; the word `max` was left over from plan F3c.)
   - **New case A, after line 729** (after case 5):
     ```js
     it("the iron-loop critic declares `effort: high` by the owner's decision of 2026-10-08, the only watcher with an effort decision", () => {
       const id = 'iron-loop/iron-loop-critic';
       assert.deepEqual(Object.keys(WATCHER_EFFORT), [id],
         'WATCHER_EFFORT holds exactly the critic. Another watcher below xhigh needs its own owner decision, argued here in the open.');
       assert.ok(WATCHERS.includes(id), 'an effort decision for a watcher applies only to a watcher');
       assert.equal(WATCHER_EFFORT[id].effort, 'high');
       assert.match(WATCHER_EFFORT[id].reason, /2026-10-08/);
       assert.match(WATCHER_EFFORT[id].reason, /MODEL-TRIAL-2026-10-08\.md/);
       const critic = AGENTS.find((a) => a.id === id);
       assert.ok(critic, `agents/${id}.md is missing`);
       assert.equal(critic.model, 'opus', `agents/${id}.md stays on opus`);
       assert.equal(critic.effort, 'high',
         `agents/${id}.md declares effort: ${critic.effort ?? '(none)'}; the owner chose high on 2026-10-08`);
     });
     ```
   - **New case B, after case A** — the bite, on temporary copies of the real files, the same
     way as the existing case "the reviewers of Steps 11, 13 and 16 are watchers":
     ```js
     it('off its one level an effort fails: every other watcher at `high`, the critic at `medium`, `low` or `xhigh`', () => {
       const critic = 'iron-loop/iron-loop-critic';
       const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-effort-floor-'));
       try {
         const copyAt = (id, effort) => {
           const real = AGENTS.find((a) => a.id === id);
           assert.ok(real, `agents/${id}.md is missing`);
           const copy = path.join(dir, `${id.split('/').join('__')}.md`);
           fs.writeFileSync(copy, fs.readFileSync(real.file, 'utf8').replace(/^effort: .*$/m, `effort: ${effort}`));
           const agent = loadAgent(copy, id);
           assert.equal(agent.effort, effort, `the copy of agents/${id}.md must declare effort: ${effort}`);
           return agent;
         };
         const failing = [
           ...WATCHERS.filter((id) => id !== critic).map((id) => [id, 'high']),
           [critic, 'medium'],
           [critic, 'low'],
           [critic, 'xhigh'],
         ];
         for (const [id, effort] of failing) {
           assert.deepEqual(offEffortFloor([copyAt(id, effort)]).map((a) => a.id), [id],
             `agents/${id}.md at effort: ${effort} must fail the effort floor`);
         }
         assert.deepEqual(offEffortFloor([copyAt(critic, 'high')]), [], 'the critic at high meets its level');
       } finally {
         fs.rmSync(dir, { recursive: true, force: true });
       }
     });
     ```
   - Byte-identical: `WATCHERS`, `SONNET_EXEMPT`, `HAIKU_EXEMPT`, `EFFORT_EXEMPT`,
     `EFFORT_LEVELS`, `TOP_EFFORT`, `MIN_AGENT_FILES`, `watchersBelowFloor`, every model case,
     case 2, case 4, case 5 ("no agent the owner ruled on is exempt from the effort floor"), case 6
     and case 7. For every agent except the critic `requiredEffort` returns `TOP_EFFORT`, so cases
     1 and 3 compare exactly as before for all of them.

3. `docs/AGENT_ARCHITECTURE.md` — three places that would otherwise say every agent outside
   `EFFORT_EXEMPT` is at `xhigh`:
   - line 105, the Tier 1 contract: `effort: xhigh             # every agent not in EFFORT_EXEMPT; see below`
     → `effort: xhigh             # every agent not in EFFORT_EXEMPT, but iron-loop-critic: high; see below`;
   - a new paragraph after line 289, in "The effort floor":
     > **One watcher thinks at `high`: the iron-loop critic.** The owner decided on 2026-10-08 (answer "a") to move `iron-loop-critic` from `xhigh` to `high`, changing the 2026-07-17 ruling for this one agent. On the effort trial in `.ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`, the critic at `high` found the same 5 of 6 known problems and the same two high findings as at `xhigh`, in 43% less time; at `medium` it missed one. The critic stays on Opus, and the security scanner stays at `xhigh`. The fence holds the critic in its own map, `WATCHER_EFFORT`, never in `EFFORT_EXEMPT`: at exactly `high`, so a lower level fails, and `xhigh` fails too until the entry is removed.
   - lines 296–298: "names every agent permitted below `xhigh`, each with a written reason;
     everything else must be `xhigh`." → "names every non-watcher permitted below `xhigh`, each
     with a written reason; everything else must be `xhigh`, save the critic's one level above."

### Every surface that states the critic's effort, or the rule it falls under

| Surface | What it says | This plan |
|---|---|---|
| `agents/iron-loop/iron-loop-critic.md:6` | `effort: xhigh` | changed to `high` |
| `tests/agent-model-floor.test.js:146` | the critic is on `WATCHERS` | unchanged |
| `tests/agent-model-floor.test.js:569–587` (case 1), `:625–670` (case 3) | every agent outside `EFFORT_EXEMPT` is at `xhigh` | rewired to `requiredEffort` |
| `tests/agent-model-floor.test.js:716–729` (case 5) | no watcher in `EFFORT_EXEMPT` | unchanged; the critic stays out |
| `docs/AGENT_ARCHITECTURE.md:105`, `:286–289`, `:296–298` | the Tier 1 contract and the effort floor say `xhigh` for all but `EFFORT_EXEMPT` | changed as above |
| `CLAUDE.md:125, 128, 132, 137` | `iron-loop-critic (opus)` in the Iron Loop table | model only; unchanged |
| `docs/PROJECT_REFERENCE.md:178, 181, 185, 190` | the same rows, `(opus)` | model only; unchanged |
| `docs/PROJECT_REFERENCE.md:28` | "Every watcher stays on Opus" | model only; still true |
| `docs/PROJECT_REFERENCE.md:123`, `CLAUDE.md:17` | every agent prompt declares its effort | still true |
| `.ctoc/operations-registry.yaml:85–92` | the critic's entry: `model: opus` at line 87, no effort key | unchanged |
| `agents/coordinator/cto-chief.md:209, 319, 391, 485` | `` `iron-loop-critic` (opus) `` | model only; unchanged |
| `tests/compaction-eval/cto-chief/rule-inventory.json`, orders R-129 (5848), R-191 (6338), R-243 (6823), R-314 (7460) | hold those four lines word for word | unchanged; they name no effort |
| `tests/agent-modernization.test.js:100` | effort is one of `low, medium, high, xhigh, max` | `high` passes; unchanged |
| `tests/citation-validator.test.js:81`, `tests/deepthink-ships-with-ctoc.test.js:664` | pin `xhigh` for citation-validator and deepthink-researcher | other agents; unchanged |
| `tests/agent-and-skill-improvement-record.test.js:124` | `declared_effort` is any string | shape only; unchanged |
| `plans/todo/00377-every-agent-and-specialist-skill-improved-three-times-s117-iron-loop-critic.md:58, 61` | the critic's `model` and `effort` stay byte-identical during that run | relative to that run's own start; unchanged |

Found while reading, not the critic, listed for the owner and left alone:
`.ctoc/templates/watcher.md:6`, the template for a new Tier 2 watcher, says `effort: high`, below
the fence's `xhigh` floor. `docs/AGENT_ARCHITECTURE.md:79` is the CTO Chief's own contract.

## Agent rules this slice replaces or adds

None. The critic has no rule inventory under `tests/compaction-eval/`. The CTO Chief inventory's
orders that name the critic (R-129, R-191, R-243, R-314) state its model, which does not change.
No inventory fixture under `tests/` holds `xhigh` or the effort floor. So no order id is marked
replaced or added, and this plan's approval needs no inventory check.

## Wiring

No new module. Claude Code reads `effort:` from the agent file's frontmatter each time the critic
is dispatched (the documented subagent field, quoted in the test's `EFFORT_LEVELS` comment), so the
next dispatch of the released file runs at `high`. The changed test already runs inside
`npm test`. The smoke dispatch in Step 14 is the runtime check.

## Acceptance criteria

- [x] Test first, in two red runs of `node --test tests/agent-model-floor.test.js`:
  1. With the helpers, an EMPTY `WATCHER_EFFORT`, cases 1 and 3 rewired and case B added: red on
     case B alone, at "agents/iron-loop/iron-loop-critic.md at effort: xhigh must fail the effort
     floor". Every other case green, which shows the rewiring changes nothing for the corpus.
  2. With the critic's entry and case A added: case B green; red on exactly cases 1, 3 and A,
     each naming only the critic, which still declares `xhigh`.
- [x] Case B is shown to bite, by two mutation runs, each reverted and recorded: (i)
  `requiredEffort` grants `high` to every member of `WATCHERS` → case B red at the first other
  watcher; (ii) the critic moved into `EFFORT_EXEMPT` and `WATCHER_EFFORT` emptied → case 5 red
  naming the critic, and case B red at the critic at `medium`.
- [x] `agents/iron-loop/iron-loop-critic.md` declares `model: opus` and `effort: high`; no other
  byte changes. `agents/security/security-scanner.md` still declares `model: opus` and
  `effort: xhigh`, untouched.
- [x] `tests/agent-model-floor.test.js` loosens nothing: every name listed as byte-identical above
  is byte-identical; `WATCHER_EFFORT` holds exactly one entry; the only other changes are the texts
  and the two comparisons named above.
- [x] `docs/AGENT_ARCHITECTURE.md` carries the three changes word for word.
- [x] `npm test`: 0 failed, 0 skipped, coverage at or above `.ctoc/coverage-baseline.json`
  `minPct`. `eslint --max-warnings 0 tests/agent-model-floor.test.js` is clean.
- [x] The smoke dispatch's result is recorded: the effort the transcript names, or that the level
  was not observable — never that it applied.

## Risks

| Risk | Mitigation |
|---|---|
| The evidence is one build, reviewed once at each effort | The owner's decision. Going back is one visible act: delete the `WATCHER_EFFORT` entry and set `xhigh`; case B and case 1 force both together |
| The trial measured build review only (the review step). The same file serves plan critique at the capture and specification steps and the final review | Recorded here for the owner; the decision is per agent file, which carries one effort for all four steps |
| The trial file's "Effort trial" section was an uncommitted change in the working tree when this plan was written | Step 9 checks it. If it is still uncommitted, the record says so and the session commits it with this change (it is outside `files:`) |
| This plan's own review runs on the installed plugin's critic, still at `xhigh` until the release ships and the owner updates | Stated in the record. The smoke dispatch uses the changed file |
| Improvement slice 00377 (in `todo/`) edits the critic's body and records its fingerprint as an instrument of that run | The scheduler serialises by file. 00377 keeps `effort` byte-identical from its own start, so it keeps `high`. Round records before and after this change carry different fingerprints for the critic, which is the honest record |

## Decisions Taken Under Ambiguity

1. **A separate map, not an `EFFORT_EXEMPT` entry.** Putting the critic in `EFFORT_EXEMPT` would
   break case 5, and an exemption holds an agent to no level at all. `WATCHER_EFFORT` holds the
   critic to exactly `high`, and case 5 stays byte-identical.
2. **Exactly `high`, not "`high` or above".** The critic at `xhigh` fails as a decision nobody
   uses, the same rule the file applies to a stale exemption. Returning it to `xhigh` means
   removing the entry in the open.
3. **Case A pins the map's keys** to the critic alone, so a second watcher below `xhigh` cannot be
   added without editing a pinned assertion. The security scanner needs no line of its own: it is
   not in the map, so case 1 holds it at `xhigh`, and case B fails its copy at `high`.
4. **`docs/AGENT_ARCHITECTURE.md` is corrected** because it states the rule this plan narrows.
   `CLAUDE.md`, `docs/PROJECT_REFERENCE.md` and `.ctoc/operations-registry.yaml` state only the
   critic's model and are not touched.
5. **Two failure messages and one comment change** because they would state the old rule as fact
   to a reader of a red run. They are text, not assertion logic.
6. **One plan for three files.** Splitting it would leave the suite red between slices.
7. **This planner holds no shell.** Nothing was measured here; line numbers were read, and Step 9
   checks the trial file's git state.
8. **The exemption maps match only their own keys (security scan finding, Step 13).** Every map
   lookup in `tests/agent-model-floor.test.js` that used JavaScript's `in` operator now uses
   `Object.hasOwn`: `offEffortFloor` (`EFFORT_EXEMPT`), the sonnet lookup (`SONNET_EXEMPT`), and case 5
   (`EFFORT_EXEMPT`). Reason: `in` also matches inherited property names, so a root-level
   `agents/constructor.md` (or `hasOwnProperty.md`) at `effort: low` passed the whole fence with 0
   failures, as the security scanner reproduced. To test it on synthetic records, the sonnet and haiku
   lookups moved into one helper, `unexemptOn(agents, model)` (the haiku list is an array read with
   `includes`, which was never affected), and case 3's own copy of the effort lookup now calls
   `offEffortFloor`, so the one fixed lookup serves cases 1 and 3. This changes the model cases 3 and 4
   and case 5, which the specification listed as byte-identical; each change only tightens them.
9. **Case 3's failure message gives the fix case 5 allows (review finding, Steps 11 and 16).** It
   told the reader to fix an unlisted agent by adding it to `EFFORT_EXEMPT`, which case 5 forbids for a
   watcher. It now says: raise the agent's effort to the level it needs, or, for a non-watcher only, add
   it to `EFFORT_EXEMPT` with the owner's reason. Case 5's message said "25 watchers" while `WATCHERS`
   holds 28; it now derives the number from `WATCHERS.length`, so it cannot drift again.

## Execution Plan

### Step 8: TEST
- [x] Add `WATCHER_EFFORT` (empty), `requiredEffort`, `offEffortFloor`, the case 1 and case 3
  changes, the line 208 comment and case B, exactly as written above. Run
  `node --test tests/agent-model-floor.test.js`: red on case B alone, at the critic at `xhigh`.
- [x] Add the critic's entry and case A. Run again: red on exactly cases 1, 3 and A, each naming
  only the critic.
- [x] Mutation (i), then (ii), as in the acceptance criteria. Record each red, revert each, and
  confirm with `git diff` that only the planned change remains.

### Step 9: PREPARE
- [x] Run `git status --short .ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md`
  and record the result.
- [x] Confirm no plan in `plans/in-progress/` declares `agents/iron-loop/iron-loop-critic.md`.

### Step 10: IMPLEMENT
- [x] `agents/iron-loop/iron-loop-critic.md:6`: `effort: high`.
- [x] Run `node --test tests/agent-model-floor.test.js`: green.

### Step 11: REVIEW
- [x] The critic reads the diff of `tests/agent-model-floor.test.js`: only the new map, the two
  helpers, the two new cases, the two rewired comparisons, the removed `nonExempt`, and the texts
  named above. Every name listed as byte-identical is byte-identical.

### Step 12: OPTIMIZE
- [x] Confirm the new code reuses `AGENTS` and `loadAgent`, and reads from disk only the temporary
  copies in case B.

### Step 13: SECURE
- [x] The security scanner confirms that the critic's `tools:` line and every frontmatter key but
  `effort` are byte-identical, that the security scanner still declares `opus` and `xhigh`, and that
  case B writes only inside its `mkdtemp` folder and removes it in `finally`.

### Step 14: VERIFY
- [x] `npm test`: 0 failed, 0 skipped, coverage at or above the floor.
  `eslint --max-warnings 0 tests/agent-model-floor.test.js`: clean.
- [x] Literal presence checks: `^effort: high$` in `agents/iron-loop/iron-loop-critic.md`;
  `^effort: xhigh$` in `agents/security/security-scanner.md`.
- [x] Name the smoke dispatch for the session: in a scratch project with the changed file under
  `.claude/agents/`, dispatch the critic on a brief that changes no file. Quote any effort level
  the transcript or session output names, or record that it was not observable.

### Step 15: DOCUMENT
- [x] `docs/AGENT_ARCHITECTURE.md`: the three changes, word for word as above.

### Step 16: FINAL-REVIEW
- [x] Check every acceptance box against its evidence. The red runs, the two mutation runs and the
  smoke result are quoted, not summarised.


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

Built 2026-10-08 by the iron-loop executor in an isolated worktree on main (v6.14.122).
`computeSpecHash` of this plan before any edit: `a035b987b7d9a54a992cbaf826a4e78e8b2656e1d4a346fe3ecf44b79f9da97d`,
equal to the approval record's `content_sha256`.

### Step 8: TEST

- Red run 1 (empty `WATCHER_EFFORT`, helpers, cases 1 and 3 rewired, line 208 comment, case B):
  `node --test tests/agent-model-floor.test.js` → `tests 15, pass 14, fail 1, skipped 0`. The one red:
  `✖ off its one level an effort fails: every other watcher at \`high\`, the critic at \`medium\`, \`low\` or \`xhigh\``,
  `AssertionError [ERR_ASSERTION]: agents/iron-loop/iron-loop-critic.md at effort: xhigh must fail the effort floor`.
  Every other case green, so the rewiring changes nothing for the corpus.
- Red run 2 (critic's entry and case A added): `tests 16, pass 13, fail 3, skipped 0`. Red on exactly
  case 1 (`agents/iron-loop/iron-loop-critic.md  declares effort: xhigh  — must be high`), case 3
  (unlisted: `agents/iron-loop/iron-loop-critic.md`) and case A
  (`agents/iron-loop/iron-loop-critic.md declares effort: xhigh; the owner chose high on 2026-10-08`).
  Each names only the critic. Case B green.
- Mutation (i), `requiredEffort` returns `'high'` for every member of `WATCHERS`: `pass 12, fail 4`. Case B red at
  the first other watcher: `agents/ai-quality/citation-validator.md at effort: high must fail the effort floor`
  (cases 1, 3 and A also red). Reverted by restoring the saved planned file; `cmp` identical.
- Mutation (ii), the critic added to `EFFORT_EXEMPT` and `WATCHER_EFFORT` emptied: `pass 12, fail 4`. Case 5 red:
  `1 of the 25 watchers raised to \`model: opus\` by the owner's ruling (plan F3a) have been exempted from the effort floor:`
  naming `agents/iron-loop/iron-loop-critic.md`; case B red:
  `agents/iron-loop/iron-loop-critic.md at effort: medium must fail the effort floor` (case 3 stale check and
  case A also red). Reverted the same way; `git diff` afterwards showed only the planned change.

### Step 9: PREPARE

- The trial file's git state is the session's check (the dispatch brief): in this worktree, on main,
  `.ctoc/audit/speed-and-size/benchmarks/MODEL-TRIAL-2026-10-08.md` carries no "Effort trial" section yet
  (`grep -c "Effort trial"` → 0); the session commits it with this release. Not edited or copied here.
- No plan in `plans/in-progress/` (main checkout or worktree) names `agents/iron-loop/iron-loop-critic.md`.

### Step 10: IMPLEMENT

- `agents/iron-loop/iron-loop-critic.md` line 6: `effort: xhigh` → `effort: high`; one line changed.
- `node --test tests/agent-model-floor.test.js` → `tests 16, pass 16, fail 0, skipped 0`.

### Step 12: OPTIMIZE

- The new code reuses `AGENTS`, `WATCHERS`, `EFFORT_EXEMPT` and `loadAgent`; only case B reads from disk,
  and only its own temporary copies inside its `mkdtemp` folder, removed in `finally`.

### Step 14: VERIFY

- `npm test` → `tests 12760, pass 12760, fail 0, cancelled 0, skipped 0, todo 0`;
  `[CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0`; `[CTOC test-gate] PASS`.
- `eslint --max-warnings 0 tests/agent-model-floor.test.js` → clean.
- Presence: `^effort: high$` in `agents/iron-loop/iron-loop-critic.md` → 1 line; `^effort: xhigh$` and
  `model: opus` in `agents/security/security-scanner.md` → present, file untouched.
- Smoke dispatch: left to the session, as the dispatch brief directs.

### Step 15: DOCUMENT

- `docs/AGENT_ARCHITECTURE.md`: the three changes, word for word as specified.

### Left to the session

Steps 11 (review), 13 (security) and 16 (final review), and the smoke dispatch. Recorded below.

### Step 11 and Step 16: REVIEW and FINAL-REVIEW

- The iron-loop critic: SHIP AFTER, both conditions met; every acceptance box passed. Its finding on case 3's
  and case 5's failure messages is fixed as decision 9.

### Step 13: SECURE

- The security scanner: PASS, nothing in this change. It found one older weakness: the exemption maps were
  read with the `in` operator, which matches inherited names, so `agents/constructor.md` at `effort: low`
  passed the fence. Fixed as decision 8.

### The two review findings, built test-first

- Behaviour-preserving extraction first (`unexemptOn`, case 3 calling `offEffortFloor`, every `in` kept):
  `node --test tests/agent-model-floor.test.js` → `tests 16, pass 16, fail 0, skipped 0`.
- New case "an agent named after a built-in object property gets no exemption from either floor"
  (`constructor`, `hasOwnProperty`, `toString`, `__proto__` as synthetic records fed to `offEffortFloor` and
  `unexemptOn`). Red run 1: `tests 17, pass 16, fail 1, skipped 0`,
  `AssertionError [ERR_ASSERTION]: agents/constructor.md at effort: low must fail the effort floor`.
- `offEffortFloor` switched to `Object.hasOwn`. Red run 2: `tests 17, pass 16, fail 1, skipped 0`,
  `AssertionError [ERR_ASSERTION]: agents/constructor.md on model: sonnet must fail the model floor`.
- The sonnet lookup and case 5 switched to `Object.hasOwn`, case 3's and case 5's messages fixed. Green:
  `tests 17, pass 17, fail 0, skipped 0`. `eslint --max-warnings 0 tests/agent-model-floor.test.js` → clean.

### Step 14: the smoke dispatch

- The changed critic was dispatched from a Haiku 5.5 session in a scratch project. Its own subagent
  transcript records model `claude-opus-5-5` and `"effort":"high"`, twice; the dispatcher ran at medium.

### Step 14: VERIFY, after the two review findings

- The worktree holds no `node_modules` (ignored by git), so the first `npm test` failed only the lint and
  typecheck gates: `ESLint is not installed ...`, `TypeScript is not installed ...`. The main checkout's
  install (same `package-lock.json`) was linked in for the run and the link removed afterwards.
- `npm test` → `tests 12761, pass 12761, fail 0, cancelled 0, skipped 0, todo 0`;
  `[CTOC test-gate] coverage 99.86% (threshold 99%), skipped 0, failed 0`; `[CTOC test-gate] PASS`.
- `eslint --max-warnings 0 tests/agent-model-floor.test.js` → clean.
- Presence: `agents/iron-loop/iron-loop-critic.md` lines 5 and 6, `model: opus`, `effort: high`;
  `agents/security/security-scanner.md` lines 5 and 6, `model: opus`, `effort: xhigh`.

### Decisions taken while building

1. The plan's line numbers for `docs/AGENT_ARCHITECTURE.md` are one off in this checkout (the effort floor's first
   paragraph runs to line 290, not 289). The new paragraph went after that first paragraph, which is what
   "after line 289, in 'The effort floor'" names; the alternative would split a sentence.
2. Case A sits directly after case 5 and case B after case A, as written; neither carries a `// ---- Case N`
   banner, since the plan's code has none.
