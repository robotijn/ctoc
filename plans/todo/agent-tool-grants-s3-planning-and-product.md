---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the remaining planning agents and the two product agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: small
files:
  - agents/planning/kpi-planner.md
  - agents/planning/stack-chooser.md
  - agents/planning/unit-economics-modeler.md
  - agents/product/experiment-designer.md
  - agents/product/product-reviewer.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.774Z
gate_crossed: implementation → todo
---

# Tool grants for the remaining planning agents and the two product agents

**Scope (one line):** the three planning agents that ask the human and write plan files gain Edit, Grep and Glob; `product-reviewer` gets the safety separation by dropping WebFetch only, keeps its Write, gains Edit, Grep and Glob, and keeps its Bash, whose removal is held (slice 11); `experiment-designer` gains Grep, Glob and Edit and keeps its Write, the Write and Edit pair held together (slice 11); both product agents get descriptions that say they review; all five gain the shared search section and leave the test's two debt lists.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `product-reviewer`'s separation is one of the six safety fixes and goes ahead here; `experiment-designer`'s Write removal is a least-privilege removal and is held. **The CTO Chief's decision 17 of 2026-10-05 (index):** the approved removal of `product-reviewer`'s Write rested on a misreading, because its method file orders two file writes (its Step 8: the weekly review and its actions file). So this slice drops WebFetch only, which alone clears the safety floor; Write stays and Edit is added; Bash is held for slice 11. Under the owner's Write-and-Edit ruling (index, decision 16), `experiment-designer` gains Edit here and its Write and Edit are held as a pair.

Read first: the index `plans/implementation/agent-tool-grants.md` (policy, questions 3 and 6, the audit table) and slice 1.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) | Body edits |
|---|---|---|---|---|
| `planning/kpi-planner` | `Read, Write, AskUserQuestion` | `Read, Write, AskUserQuestion, Edit, Grep, Glob` | Asks the founder or product manager (Step 3 "Ask the user for target customization", Step 4 "Ask the founder/pm"); writes `plans/canvas/<slug>-kpis.yaml` (Step 5); reads the vision and `.ctoc/templates/product-kpis.yaml` | Search section |
| `planning/stack-chooser` | `Read, Write, AskUserQuestion` | `Read, Write, AskUserQuestion, Edit, Grep, Glob` | Asks (Step 2 "Use AskUserQuestion"); "Write to `plans/implementation/<slug>-impl.md` as a frontmatter block" (line 81) — a change to an existing plan | Line 81 (below); search section |
| `planning/unit-economics-modeler` | `Read, Write, AskUserQuestion` | `Read, Write, AskUserQuestion, Edit, Grep, Glob` | "Asked via AskUserQuestion" (line 39); "Output (added to canvas plan)" (line 120) — a change to an existing plan | Search section |
| `product/experiment-designer` | `Read, Write` | `Read, Write, Grep, Glob, Edit` (Write and Edit held together, slice 11) | "You are the standing observer …"; "Judge these" (line 43); no write ordered | Description (question 3); search section |
| `product/product-reviewer` | `Read, Write, Bash, WebFetch` | `Read, Write, Bash, Grep, Glob, Edit` (Bash held, slice 11) | "You are the standing observer …"; "Judge these" (line 50); its method file orders two file writes, the weekly review and its actions file (its Step 8; the CTO Chief's decision 17(c)); no command or fetch ordered | Description (question 3); search section |

`product-reviewer` breaks the safety floor today (WebFetch with Write and Bash). Dropping WebFetch alone clears it: after this slice it holds no web tool. That removal is the separation the owner approved, so it is not held. Write stays because its method file orders two writes, and Edit comes with it (rule 1). Its Bash is a least-privilege removal, held until slice 11 measures it; the test lists it as `'product/product-reviewer': ['Bash']`.

`experiment-designer` keeps Write and gains Edit: Write and Edit are granted together and removed together (the owner's ruling, index decision 16), and a reviewer holding a Write it never uses is a least-privilege removal, held until slice 11 measures it. The test lists the pair as `'product/experiment-designer': ['Write', 'Edit']`. It holds no web tool, so keeping Write and Edit leaves it within the safety floor.

If either body quotes its own grant in backticks (two or more tool names), that quote is changed to the new grant in the same build: check 3 fails on a stale quoted grant for every agent outside `DEBT`. Step 9 finds any such quote with Grep.

### Body edits, exactly

**`stack-chooser`, line 81.** The example under it (lines 83-100) shows the whole frontmatter, `---` lines included. Replace the line `Write to \`plans/implementation/<slug>-impl.md\` as a frontmatter block:` with:

```markdown
Add the `tech_stack:` block and the `stack_decision_at:` line below to the existing frontmatter of `plans/implementation/<slug>-impl.md`, with `Edit` after a fresh `Read`: the `old_string` is the plan's last frontmatter line before its closing `---`, and the `new_string` is that same line followed by the new keys. The `---` lines in the example only show where the keys sit; never add a second frontmatter block, and never rewrite the plan with `Write` — a whole-file rewrite can drop text the planner already wrote:
```

**The shared search section**, in all five, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

**Descriptions (question 3, the owner's answer of 2026-10-05: the recommended option).** Only the text before "Dispatch when" changes; every dispatch phrase stays word for word.

- `experiment-designer` — from "Designs A/B tests from a hypothesis — control vs variant, success metric, minimum sample size, duration, feature-flag config. Outputs a runnable experiment spec with sample-size, SRM check, CUPED, and pre-registered analysis plan." to "Reviews an A/B test design before it launches — control vs variant, success metric, minimum sample size, duration, feature-flag config — and reports what a runnable experiment spec still lacks: sample size, SRM check, CUPED, and a pre-registered analysis plan."
- `product-reviewer` — from "Weekly product review. Reads KPI data from PostHog/Stripe, compares against targets, identifies funnel drop-offs, surfaces 2-3 hypotheses for improvement." to "Weekly product review watcher. Judges whether the review happened and whether the KPI data handed to it from PostHog/Stripe can be trusted, compares against targets, identifies funnel drop-offs, surfaces 2-3 hypotheses for improvement."

### The test edits — `tests/agent-tool-grants.test.js`

- Remove the five keys from `DEBT`; lower `MAX_DEBT` by 5.
- Remove `product/product-reviewer` from `RULE6_EXCEPTIONS`; lower `MAX_RULE6_EXCEPTIONS` by 1.
- Remove `planning/kpi-planner`, `planning/stack-chooser`, `planning/unit-economics-modeler`, `product/experiment-designer` and `product/product-reviewer` from `WRITE_EDIT_DEBT` (each now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 5.
- `HELD_REMOVALS` is unchanged: `product/experiment-designer`'s `['Write', 'Edit']` and `product/product-reviewer`'s `['Bash']` stay until slice 11.
- Lower `MAX_DEBT` by 5, `MAX_WRITE_EDIT_DEBT` by 5 and `MAX_RULE6_EXCEPTIONS` by 1 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling. Also lower `CEILINGS.EXCUSED_TOOLS` by 1 in `tests/agent-tool-grants-maxima.test.js`: the safety-floor exception this slice removes excuses 1 tool (slice 1 decision 24).

### Wiring — the live call sites

No module is added. `kpi-planner`, `unit-economics-modeler`, `experiment-designer` and `product-reviewer` are dispatched by the founder or product manager in the Product Loop (`docs/PRODUCT_LOOP.md`); `stack-chooser` by CTO Chief before the implementation planner. This slice changes what they may do, not whether they are reached.

### Security review

- `product-reviewer` no longer combines web reading with write and command tools (rule 6).
- `product-reviewer` keeps its unused Bash, and `experiment-designer` its unused Write and Edit pair, until slice 11 measures them; neither holds a web tool, so the safety floor holds. Every Edit added here adds no reach beyond the Write the agent already holds.
- No agent in this slice loses Bash, so `tests/unexecutable-instruction-fence.test.js` scans no new agent here; that moves to slice 11.

### Acceptance criteria

1. The five tools lines read as in the table: all five change, every one holds Write and Edit together, `product-reviewer` holds no web tool and keeps Bash; the two descriptions as above, dispatch phrases unchanged.
2. `stack-chooser` line 81 orders an `Edit` that adds keys to the existing frontmatter, never a second block and never a whole-file `Write`.
3. All five carry the shared search section and are out of `DEBT` and `WRITE_EDIT_DEBT`; `product-reviewer` is out of `RULE6_EXCEPTIONS`; `MAX_DEBT`, `MAX_WRITE_EDIT_DEBT` and `MAX_RULE6_EXCEPTIONS` are lowered by 5, 5 and 1 in both test files; `HELD_REMOVALS` is unchanged.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **Reviewer or builder is decided by the body** (index, question 3).
2. **`kpi-planner` gains Edit although it creates its file:** a second run revises the same `kpis.yaml`, and rule 1 makes no create-only exception outside the fenced critics.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `product-reviewer`'s loss of WebFetch is the separation the owner approved as a safety fix; its Bash and `experiment-designer`'s Write and Edit pair are held (slice 11). The owner chose question 3's recommended option, so both descriptions are reworded here.
4. **`experiment-designer` gains Edit while its Write is held**, and the pair is held together: the owner's ruling (index, decision 16) is that Write and Edit are granted together and removed together, and the CTO Chief's decision 17(b) places this Edit in this slice. This replaces the earlier reading that Edit would widen a grant whose removal is pending.
5. **`product-reviewer` keeps Write and gains Edit** (the CTO Chief's decision 17(c)): its method file orders two file writes, so the earlier approved removal of its Write rested on a misreading. Its description is still reworded as question 3 approved; the reworded text claims no write either way.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each of the five agents and each wrong tool
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the five files; confirm each `old_string` occurs exactly once; Grep each of the five for a backticked span of two or more tool names and list every quoted grant the new tools line makes stale; Grep `tests/` for each agent's file name and record any test that pins its tools line (a pin found there is a scope-growth question, never a silent edit)
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the five tools lines, the `stack-chooser` line, the two descriptions, any stale quoted grant found at Step 9, the five search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` passes
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent, confirm no agent in this slice holds a web tool with a mutation tool, `experiment-designer`'s held Write and Edit and `product-reviewer`'s held Bash included
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: n/a

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies and descriptions themselves
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
