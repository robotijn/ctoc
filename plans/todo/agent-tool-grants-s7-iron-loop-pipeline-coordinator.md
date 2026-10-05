---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for four Iron Loop agents, the pipeline agents, the coordinators and the citation validator"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/iron-loop/iron-loop-critic.md
  - agents/iron-loop/iron-loop-integrator.md
  - agents/iron-loop/iron-loop-executor.md
  - agents/iron-loop/gate-critic.md
  - agents/pipeline/agent-critic.md
  - agents/pipeline/agent-publisher.md
  - agents/pipeline/agent-qa.md
  - agents/pipeline/agent-tester.md
  - agents/pipeline/agent-writer.md
  - agents/coordinator/cto-chief.md
  - agents/coordinator/ivv-chief.md
  - agents/coordinator/synthesizer.md
  - agents/ai-quality/citation-validator.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
  - tests/agent-and-skill-improvement-record.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.922Z
gate_crossed: implementation → todo
---

# Tool grants for four Iron Loop agents, the pipeline agents, the coordinators and the citation validator

**Scope (one line):** the builder, the integrator and the Iron Loop critic gain search; `agent-publisher` gains Edit and search and stops rewriting its shared records whole; `agent-tester` gains Glob and keeps the Bash it never uses until slice 11 measures it; `agent-critic` and `citation-validator` gain Glob, with the two exact pins in the improvement run's record check updated (question 5); the two chiefs keep their grants; all twelve gain the shared search section and leave the test's debt. `gate-critic` gains Edit and nothing else (the CTO Chief's decision 17(a), under the owner's Write-and-Edit ruling, index decision 16): it holds Write without Edit today. It gains no Glob and no search section, because its read fence stands (question 4). The other four gate critics are not in this slice: they keep their grants (question 4).

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `agent-tester`'s loss of Bash is a least-privilege removal and is held (slice 11); every other change here is an addition and goes ahead. The owner chose the recommended option on questions 4, 5 and 6: the gate critics keep their grants (save `gate-critic`'s Edit, decision 5 below), the two record-test pins gain Glob, and these slices build before the "improved three times" run's rounds reach the affected files.

Read first: the index `plans/implementation/agent-tool-grants.md` (questions 4, 5 and 6), slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `iron-loop/iron-loop-critic` | `Read, Grep` | `Read, Grep, Glob` | Reads and critiques plans |
| `iron-loop/iron-loop-integrator` | `Read, Write, Edit` | `Read, Write, Edit, Grep, Glob` | Writes the execution steps into implementation plans |
| `iron-loop/iron-loop-executor` | `Read, Write, Edit, Bash` | `Read, Write, Edit, Bash, Grep, Glob` | Builds, runs tests and the menu's completion recipe |
| `iron-loop/gate-critic` | `Read, Grep, Write` | `Read, Grep, Write, Edit` | Fenced reads; creates one quarantined pending file per run (line 93, "Your ONE write"); holds Write, so it gains Edit (rule 1); no Glob and no search section (question 4) |
| `pipeline/agent-critic` | `Read, Grep, WebSearch, WebFetch` | `Read, Grep, WebSearch, WebFetch, Glob` | Reads the agent under review, searches the repository, fetches sources |
| `pipeline/agent-publisher` | `Read, Write, Bash` | `Read, Write, Bash, Edit, Grep, Glob` | Writes the agent file; "Update `.ctoc/agents/grades.yaml`" and "capability-index.yaml"; "Append to `.ctoc/agents/audit.log`"; `git commit` |
| `pipeline/agent-qa` | `Read, Grep` | `Read, Grep, Glob` | Reads agent files |
| `pipeline/agent-tester` | `Read, Bash, Grep` | `Read, Bash, Grep, Glob` (Bash held, slice 11) | Reasons over test cases; no command ordered |
| `pipeline/agent-writer` | `Read, Edit, Write` | `Read, Edit, Write, Grep, Glob` | Writes agent files |
| `coordinator/cto-chief` | `Read, Grep, Glob, Task, Bash` | unchanged | Dispatches; runs `node -e` recipes (pinned by `tests/agent-contract-load.test.js`) |
| `coordinator/ivv-chief` | `Read, Grep, Glob, Task, Bash` | unchanged | Re-dispatches; re-runs verification |
| `coordinator/synthesizer` | `Read, Grep` | `Read, Grep, Glob` | Reads the plan ancestry and the findings |
| `ai-quality/citation-validator` | `Read, Grep, WebSearch, WebFetch` | `Read, Grep, WebSearch, WebFetch, Glob` | Reads files and the cited sources |

`agent-critic` and `citation-validator` read the web and hold no write or command tool: within the safety floor before and after.

### Body edits, exactly

**`agent-publisher`.**
- Lines 68-70, "Write the final `agent_content` to `agent_path` using the Write tool (your only file-writing capability — you have Read, Write, and Bash, not a JavaScript runtime)." becomes: "Write the final `agent_content` to `agent_path` with `Write`: the reviewed content replaces the file whole, on purpose. You hold Read, Write, Edit, Bash, Grep and Glob, not a JavaScript runtime."
- Line 74, "Update `.ctoc/agents/grades.yaml` (project-relative, …):" becomes "Update this agent's entry in `.ctoc/agents/grades.yaml` with `Edit`, after a fresh `Read`, leaving every other agent's entry as it is (project-relative, …):" — the parenthesis kept as it is.
- Line 94, "Update `.ctoc/agents/capability-index.yaml` (project-relative, alongside `grades.yaml`):" becomes "Update this agent's entry in `.ctoc/agents/capability-index.yaml` with `Edit`, after a fresh `Read`, leaving every other entry as it is (project-relative, alongside `grades.yaml`):".
- Line 140, "Append to `.ctoc/agents/audit.log`:" becomes "Append to `.ctoc/agents/audit.log` with `Edit`, after a fresh `Read`: the `old_string` is the log's last entry and the `new_string` is that entry followed by the new one. Create the log with `Write` only when it does not exist; never rewrite it whole:".

**`gate-critic`** (lines 1-200 read on 2026-10-05; its test profile stays `{ fenced: true, creates: true }`, and check 3 judges Edit nowhere but in check 9, so the profile does not change). Its body quotes its grant, and check 3 fails on a stale quoted grant for every agent outside `DEBT`, which `gate-critic` is.
- Line 81: "Your `tools: Read, Grep, Write` line is a load-bearing control" becomes "Your `tools: Read, Grep, Write, Edit` line is a load-bearing control".
- Line 81: "so your Write tool cannot reach the live questions path" becomes "so your Write and Edit tools cannot reach the live questions path". The rest of the sentence stays: the `PreToolUse.Edit` deny-ahead it names guards Edit as it guards Write.
- Line 93: "You hold a `Write` tool for exactly one purpose and exactly one path family." becomes "You hold a `Write` tool for exactly one purpose and exactly one path family. You also hold `Edit`, only because Write and Edit are granted together (the owner's ruling of 2026-10-05); you never use it, because your one write creates a new file and you never read it back."
- Lines 201-537 were not read for this plan. Step 9 Greps the whole file for every other backticked span of two or more tool names, and each one found is changed to the new grant in the same build.

**`citation-validator`, line 142.** "I never edit — Read, Grep, and read-only web retrieval only." becomes "I never edit — Read, Grep, Glob, and read-only web retrieval only."

**The shared search section**, in all twelve, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The pinned tools lines — `tests/agent-and-skill-improvement-record.test.js` (question 5)

Contract from outside the test: the owner's answer to question 5 (index), given on 2026-10-05 as the recommended option ("the two record-test pins are updated (Glob added)"), applying the grant policy's rule 2 to the two web-reading reviewers. Why the test and not the code: the test pins the exact line that the policy changes, and its case at lines 724-733 names "gains a tool" — with `Glob` as the example — as a rejection. What newly fails after the change: either line without `Glob`; what still fails: either line holding Write, Edit, Bash, Task or `Skill`, or losing any other tool. The test is tightened toward the new contract, not loosened.

- Line 45: `const CRITIC_TOOLS = 'Read, Grep, WebSearch, WebFetch';` becomes `const CRITIC_TOOLS = 'Read, Grep, WebSearch, WebFetch, Glob';`.
- Lines 285-291: the validator's expected line becomes its recorded start line with `Skill` removed and `, Glob` appended, written so an absent start line still yields no expectation:

  ```js
  // The validator's grant is its recorded start line with ONLY the Skill tool
  // removed (human ruling, 2026-09-30) and Glob appended (owner's answer to the
  // tool-grant audit, plans/implementation/agent-tool-grants.md, question 5). Still
  // an exact comparison: keeping Skill, gaining another tool, or losing any fails.
  const validatorBase = isObj(inv.tools_at_start) ? withoutTool(inv.tools_at_start[VALIDATOR], 'Skill') : undefined;
  const want = p === CRITIC
    ? `tools: ${CRITIC_TOOLS}`
    : validatorBase === undefined ? undefined : `${validatorBase}, Glob`;
  ```
- Lines 517-518 (the well-formed fixture's agent files): both tools lines become `tools: Read, Grep, WebSearch, WebFetch, Glob`. Lines 536-537 (`tools_at_start`) do not change: they record the starting lines.
- Line 720: the replacement becomes `.replace('tools: Read, Grep, WebSearch, WebFetch, Glob', 'tools: Read, Grep, WebSearch, WebFetch, Glob, Write')`.
- Lines 724-733: the case is renamed "rejects a validator tools line that keeps Skill, gains a tool, or loses one" and checks four wrong lines, each replacing `'tools: Read, Grep, WebSearch, WebFetch, Glob'`: `'tools: Read, Grep, Skill, WebSearch, WebFetch, Glob'`, `'tools: Read, Grep, WebSearch, WebFetch, Glob, Bash'`, `'tools: Read, Grep, WebSearch, WebFetch'` and `'tools: Read, Grep, WebSearch, Glob'`.

The two agent lines must read exactly `tools: Read, Grep, WebSearch, WebFetch, Glob` (Glob last), so the exact comparison holds.

### The test edits — `tests/agent-tool-grants.test.js`

Remove the twelve keys from `DEBT`; lower `MAX_DEBT` by 12 (`gate-critic` is not in `DEBT`). Remove `pipeline/agent-publisher` and `iron-loop/gate-critic` from `WRITE_EDIT_DEBT` (each now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 2. `HELD_REMOVALS` is unchanged: `'pipeline/agent-tester': ['Bash']` stays until slice 11. Lower `MAX_DEBT` by 12 and `MAX_WRITE_EDIT_DEBT` by 2 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling.

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents throughout the Iron Loop and the agent pipeline; the coordinators are dispatched by the session. This slice changes what they may do, not whether they are reached.

### Security review

- `agent-tester` keeps its unused shell until slice 11 measures it; it holds no web tool, so the safety floor holds.
- `agent-publisher`'s shared records (`grades.yaml`, `capability-index.yaml`, `audit.log`) are changed entry by entry instead of being rewritten whole, so one publish cannot drop another agent's record.
- Glob on the two web readers adds file-name enumeration only; `tests/watcher-shape.test.js` already permits it for `citation-validator` as a conforming reviewer.
- `gate-critic`'s Edit adds no reach beyond its Write: it holds no web tool, the `PreToolUse.Edit` deny-ahead confines every editing-tool write under `.ctoc/streaming/` to the pending quarantine, and its body orders it never to read its file back, which an `Edit` requires. Its read fence (question 4) is unchanged: no Glob, no whole-repository search order.

### Neighbouring plans (technical facts; the order the owner chose)

- The owner answered question 6 on 2026-10-05: these slices build before the "improved three times" run's rounds reach the affected files.
- `tests/agent-and-skill-improvement-record.test.js` is the "improved three times" run's record check, and that run has a slice in progress (`plans/in-progress/00266-…-s6-dependency-analyzer.md`). Two builds never run at once, but a slice of that run built after this one sees the new pins.
- `agent-critic` and `citation-validator` are that run's instruments, and `agent-critic` already has recorded rounds; this edit changes its file after its last recorded fingerprint (index, question 6). Step 9 reads how that run's final check treats such an edit before any change here.

### Acceptance criteria

1. The eleven changed tools lines read as in the table (`gate-critic`'s included); the two chiefs' lines are unchanged.
2. `agent-publisher`'s four passages, `gate-critic`'s passages and `citation-validator`'s line 142 read as above; no quoted grant in `gate-critic` is stale.
3. `tests/agent-and-skill-improvement-record.test.js` passes with the new pins, and its rejection cases fail each wrong line named above.
4. All twelve carry the shared search section and are out of `DEBT`; `agent-publisher` and `gate-critic` are out of `WRITE_EDIT_DEBT`; `MAX_DEBT` and `MAX_WRITE_EDIT_DEBT` are lowered by 12 and 2 in both test files.
5. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

**The shared no-stub line in the four read-only agents** (slice 1 final review, finding 3, carrying the Step 11 review's finding 13). In `agents/iron-loop/iron-loop-critic.md` (line 23), `agents/pipeline/agent-qa.md` (line 21), `agents/pipeline/agent-tester.md` (line 21) and `agents/pipeline/agent-critic.md` (line 21), `old_string`: `Make a documented choice in the plan's "## Decisions Taken Under Ambiguity" section and continue.` — `new_string`: "Make a documented choice, report the choice in your output, and continue." None of the four holds Write or Edit, so the old order told them to write a plan section they cannot write. Step 9 confirms each `old_string` occurs exactly once in its file.

## Decisions Taken Under Ambiguity

1. **The chiefs gain no Write**: their bodies describe their audit logs in the passive voice and order no file write of the agent itself; `cto-chief`'s grant is pinned exactly.
2. **`agent-publisher` keeps a whole-file `Write` for the agent file**: the reviewed content is a deliberate whole replacement, which rule 1 allows.
3. **Seen while reading, not changed:** `agent-publisher` commits in Step 5 and appends the audit entry in Step 6, while Step 5 stages `audit.log` — so the commit cannot hold the entry Step 6 writes. Reported here for the owner; out of this slice's scope.
4. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `agent-tester`'s loss of Bash is held (slice 11); every other change here is an addition.
5. **`gate-critic` gains Edit** (the CTO Chief's decision 17(a), 2026-10-05): the owner's Write-and-Edit ruling (index, decision 16) supersedes question 4's "keep their grants exactly as they are" for that one tool. Its fence, and its grant otherwise, are unchanged.

6. **Read-only agents report their choices instead of writing them into a plan** (slice 1 final review, finding 3, carrying the Step 11 review's finding 13). The shared no-stub line in `iron-loop-critic`, `agent-qa`, `agent-tester` and `agent-critic` ordered a write to the plan's decisions section, and none of the four holds a write tool. The line is reworded to "report the choice in your output"; the profiles in the test stay `reads`, as the audit read them.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the edits to `tests/agent-tool-grants.test.js` and the pin edits to `tests/agent-and-skill-improvement-record.test.js`
- [ ] Test error conditions: the record check's rejection cases for each wrong line
- [ ] Run tests - expect RED (failing): both files fail on the current tools lines, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the thirteen agent files; confirm each `old_string` occurs exactly once; Grep `agents/iron-loop/gate-critic.md` for every backticked span of two or more tool names and list each one the new line makes stale; Grep `tests/` for `gate-critic` and record any test that pins its tools line (a pin found there is a scope-growth question, never a silent edit); read the improvement run's final record-check rules for an edit after recorded rounds (question 6)
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the tools lines (`gate-critic`'s included), the body edits (`gate-critic`'s and any stale quoted grant found at Step 9 included), the twelve search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/agent-contract-load.test.js`, `tests/watcher-shape.test.js`, `tests/citation-validator.test.js`, `tests/refinement-loop-claims-match-code.test.js` and `tests/unexecutable-instruction-fence.test.js` pass
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent, the safety floor for the two web readers, Task held only by the coordinators, and `gate-critic`'s Edit confined to its quarantine path
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: `agent-publisher`'s entry-by-entry edits

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies themselves and the record check's comment
- [ ] Add JSDoc comments to new functions: none
- [ ] Update CHANGELOG if needed: no changelog file exists

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly: through CTOC's final review agent
- [ ] All quality checks passed: `npm test`
- [ ] Manual verification if needed: none
- [ ] Ready for human review: through the menu's task completion


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
