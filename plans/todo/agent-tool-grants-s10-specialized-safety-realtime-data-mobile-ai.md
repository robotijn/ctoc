---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the specialized, safety, real-time, data, mobile and artificial-intelligence-quality agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/specialized/accessibility-checker.md
  - agents/specialized/api-contract-validator.md
  - agents/specialized/configuration-validator.md
  - agents/specialized/database-reviewer.md
  - agents/specialized/error-handler-checker.md
  - agents/specialized/health-check-validator.md
  - agents/specialized/memory-safety-checker.md
  - agents/specialized/observability-checker.md
  - agents/specialized/performance-profiler.md
  - agents/specialized/resilience-checker.md
  - agents/specialized/translation-checker.md
  - agents/safety/fault-tree-builder.md
  - agents/safety/fmeda-analyzer.md
  - agents/safety/redundancy-pattern-picker.md
  - agents/realtime/hil-harness.md
  - agents/realtime/wcet-budget.md
  - agents/data-ml/data-quality-checker.md
  - agents/data-ml/feature-store-validator.md
  - agents/data-ml/ml-model-validator.md
  - agents/mobile/android-checker.md
  - agents/mobile/ios-checker.md
  - agents/mobile/react-native-bridge-checker.md
  - agents/ai-quality/ai-code-quality-reviewer.md
  - agents/ai-quality/hallucination-detector.md
  - agents/ai-quality/llm-security-tester.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.730Z
gate_crossed: implementation → todo
---

# Tool grants for the specialized, safety, real-time, data, mobile and artificial-intelligence-quality agents

**Scope (one line):** the readers that lack them gain Grep or Glob; `llm-security-tester` drops WebSearch (question 2), which takes it off the safety-floor list; two bodies that state their own grant in prose are corrected; six checklist reviewers keep the Bash their bodies never use until slice 11 measures it; all twenty-five gain the shared search section and leave the test's debt. `deepthink-researcher` (web only) is unchanged and not in this slice.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `llm-security-tester`'s loss of WebSearch is one of the six safety fixes and goes ahead; the six Bash removals are least-privilege removals and are held (slice 11).

Read first: the index `plans/implementation/agent-tool-grants.md` (question 2, the audit table), slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `specialized/accessibility-checker` | `Bash, Read, Grep, Glob` | unchanged | `npx axe` |
| `specialized/api-contract-validator` | `Bash, Read, Grep, Glob` | unchanged | spectral, graphql-inspector, buf, pact-broker |
| `specialized/configuration-validator` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | "You validate that configuration is correct …" — a checklist; no command |
| `specialized/database-reviewer` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` (Bash held, slice 11) | "You review database changes …" — a checklist; no command |
| `specialized/error-handler-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads error handling |
| `specialized/health-check-validator` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | A checklist with example code; no command |
| `specialized/memory-safety-checker` | `Bash, Read, Grep, Glob` | unchanged | Sanitizer builds, Miri |
| `specialized/observability-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads instrumentation |
| `specialized/performance-profiler` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | py-spy, `node --prof`, pprof |
| `specialized/resilience-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads retry and timeout code |
| `specialized/translation-checker` | `Read, Grep, Glob` | unchanged | Reads locale files |
| `safety/fault-tree-builder` | `Read, Grep, Glob` | unchanged | Reads |
| `safety/fmeda-analyzer` | `Read, Grep, Glob` | unchanged | Reads |
| `safety/redundancy-pattern-picker` | `Read, Grep, Glob` | unchanged | Reads |
| `realtime/hil-harness` | `Read, Grep, Glob` | unchanged | Reads |
| `realtime/wcet-budget` | `Read, Grep, Glob` | unchanged | Reads |
| `data-ml/data-quality-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | No command; the skill's first phase is `rg` (a search) |
| `data-ml/feature-store-validator` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | No command; the skill's `feast apply` and `feast materialize-incremental` change a registry and are not ordered of this agent |
| `data-ml/ml-model-validator` | `Read, Grep, Glob` | unchanged | "You have `Read`, `Grep`, and `Glob` only" |
| `mobile/android-checker` | `Bash, Read, Grep, Glob` | unchanged | gradlew lint, build, tests |
| `mobile/ios-checker` | `Bash, Read, Grep, Glob` | unchanged | swiftlint, xcodebuild |
| `mobile/react-native-bridge-checker` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | A checklist; no command |
| `ai-quality/ai-code-quality-reviewer` | `Read, Grep` | `Read, Grep, Glob` | Reads named files; orders Grep searches |
| `ai-quality/hallucination-detector` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` | Registry lookups by fixed Bash recipes |
| `ai-quality/llm-security-tester` | `Bash, Read, Grep, Glob, WebSearch` | `Bash, Read, Grep, Glob` | A fixed Bash lookup of MITRE's data file; "WebSearch … never settles an identifier or a count" (line 28) |

`llm-security-tester` breaks the safety floor today (WebSearch with Bash); without WebSearch it is off the list. Its Bash still fetches MITRE's data file from a fixed host (index, stated limit).

### Body edits, exactly

- `ai-code-quality-reviewer`, line 18: "Your tools are Read and Grep, and every order in this file is one those two tools can carry out." becomes "Your tools are Read, Grep and Glob, and every order in this file is one those three tools can carry out."
- `hallucination-detector`, line 18: "Your tools are Read, Grep and Bash. You read and search with Read and Grep." becomes "Your tools are Read, Grep, Glob and Bash. You read and search with Read, Grep and Glob."
- `llm-security-tester`, line 28: "**Looking an identifier up.** WebSearch returns a summary, not the source: it can tell you that a newer release or edition exists, but it never settles an identifier or a count. The only route your tools give to the source is Bash:" becomes "**Looking an identifier up.** The only route your tools give to the source is Bash:".

**The shared search section**, in all twenty-five, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

The owner answered question 2 on 2026-10-05 with the recommended option: `llm-security-tester` drops WebSearch and its line 28 is rewritten as above.

### The test edits — `tests/agent-tool-grants.test.js`

- Remove the twenty-five keys from `DEBT`; lower `MAX_DEBT` by 25 (to 0 if every earlier slice has landed).
- Remove `ai-quality/llm-security-tester` from `RULE6_EXCEPTIONS`; lower `MAX_RULE6_EXCEPTIONS` by 1.
- `HELD_REMOVALS` is unchanged: the six `['Bash']` entries for `configuration-validator`, `database-reviewer`, `health-check-validator`, `data-quality-checker`, `feature-store-validator` and `react-native-bridge-checker` stay until slice 11.
- Lower `MAX_DEBT` by 25 and `MAX_RULE6_EXCEPTIONS` by 1 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling. Also lower `CEILINGS.EXCUSED_TOOLS` by 1 in `tests/agent-tool-grants-maxima.test.js`: the safety-floor exception this slice removes excuses 1 tool (slice 1 decision 24).

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents on their triggers (`agents/coordinator/cto-chief.md`). This slice changes what they may do, not whether they are reached.

### Security review

- Six reviewers keep an unused shell until slice 11 measures it; until then `feature-store-validator` can still run the registry-changing `feast` commands its skill shows. None of the six holds a web tool, so the safety floor holds.
- `llm-security-tester` no longer combines web search with a shell.
- No agent here loses Bash, so `tests/unexecutable-instruction-fence.test.js` scans no new agent; that moves to slice 11.

### Neighbouring plans (technical facts; the order the owner chose)

The owner answered question 6 on 2026-10-05: these slices build before the "improved three times" run's rounds reach the affected files. `ai-code-quality-reviewer`, `hallucination-detector` and `llm-security-tester` already have rounds recorded by the "improved three times" run; this slice changes their files after their last recorded fingerprint (index, question 6). Step 9 reads how that run's final check treats such an edit first.

### Acceptance criteria

1. The eleven changed tools lines read as in the table; fourteen are unchanged (`health-check-validator`'s and `react-native-bridge-checker`'s among them, their Bash held).
2. The three body sentences read as above.
3. All twenty-five carry the shared search section and are out of `DEBT`; `llm-security-tester` is out of `RULE6_EXCEPTIONS`.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **A skill's shell example is not an order to a reviewer** (index, readings): `feast apply` and `rg` in the data skills do not justify Bash.
2. **`llm-security-tester`'s line 94 ("every search result") stays**: it names results of any search, Grep's included, as data.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `llm-security-tester`'s loss of WebSearch is a safety fix and goes ahead; the six Bash removals are held (slice 11).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each agent and each wrong tool
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the twenty-five files; confirm each `old_string` occurs exactly once; read the improvement run's rule for an edit after recorded rounds
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the tools lines, the three sentences, the twenty-five search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` and `tests/agent-and-skill-improvement-record.test.js` pass
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent, the safety floor for `llm-security-tester`
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: n/a

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies themselves
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
