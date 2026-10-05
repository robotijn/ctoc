The build of slice 3 is done up to the review step and has stopped there for you. The review, the security scan and the final review are yours to dispatch. The task is `t128`, still running, and the plan is in `plans/in-progress/`.

**One thing needs your decision: `product-reviewer`'s description.** Your brief said its description must say it writes the weekly review and its actions file. The approved replacement text in the plan does not say that; the plan's own decision 5 says the new wording "claims no write either way". So I kept the approved text word for word and added one sentence before "Dispatch when": "Writes the weekly review and its actions file." Your brief also says this order comes from the index's decision 17. The index's decision 17, as it reads today, does not contain it: its `product-reviewer` part covers only WebFetch, Write, Edit and Bash. This is recorded as executor decision 7 in the plan. If the sentence should go, it is a one-line change.

**What changed:**
- **Tools lines:**
  - `kpi-planner`, `stack-chooser` and `unit-economics-modeler` now hold Read, Write, AskUserQuestion, Edit, Grep and Glob.
  - `experiment-designer` holds Read, Write, Grep, Glob and Edit. Its Write and Edit pair is still held for slice 11.
  - `product-reviewer` holds Read, Write, Bash, Grep, Glob and Edit. WebFetch is gone, so it no longer reads the web while holding tools that change files. Its Bash is still held.
- **Search section:** all five agents now have the shared search section, with the safety sentence (`MATCH_IS_DATA`) as its own paragraph.
- **`stack-chooser` step 4:** it now orders an Edit that adds keys to the plan's existing frontmatter. It never adds a second frontmatter block and never rewrites the plan with Write.
- **Descriptions:** both product agents' descriptions are reworded. The "Dispatch when" text in each is byte-identical to before.
- **Main test (`tests/agent-tool-grants.test.js`):**
  - The five agents are out of the debt list and out of the Write-and-Edit debt list.
  - `product-reviewer` is out of the safety-floor exceptions.
  - `AGENT_SENTENCES` now requires `MATCH_IS_DATA` for all five.
  - The safety-sentence fixture test now covers all eight agents that carry the sentence.
- **Limits:** each was lowered by the same amount in both test files, in one change, and none was raised:

| Limit | Before | After |
|---|---|---|
| Debt list | 114 | 109 |
| Write-and-Edit debt list | 18 | 13 |
| Safety-floor exceptions | 5 | 4 |
| Tools those exceptions excuse | 5 | 4 |

The held-removals list is unchanged at 50 tools on 27 agents.

**Test-first runs:**
- **First run (test changes only):** 17 of 20 passed and 3 checks failed. One check failed on each agent missing Grep, missing Glob and missing the search section, and on `product-reviewer` holding WebFetch. The safety-floor check failed on `product-reviewer`. The Write-and-Edit check failed on all five.
- **After the tools lines changed:** 19 of 20 passed. The one failure named all five agents' missing search sections.
- **After the search rule was added without the safety sentence:** 19 of 20 passed. The one failure named all five agents' missing safety sentence, so that check bites on the real files.
- **After all edits:** main tool-grant test 20 of 20, limits test 5 of 5, model-floor test 12 of 12, unexecutable-order fence 27 of 27. All 0 skipped.

**Checks before review:**
- `npm run lint` is clean, and `npm run typecheck` gives 1 pass, 0 fail.
- `npm test` ran 12,096 tests: 12,096 passed, 0 failed, 0 skipped. Coverage is 99.9% against the 99% floor, and the test gate passed.
- The full suite ran on a working tree that also holds plan 00266's uncommitted edits.
- The plan checker (`validateForReview`) accepts the plan with no errors and did not refuse any quoted "create <path>". The build approval still holds after my plan edits.
- I left the VERIFY step unticked. It gets ticked only after a re-run on the final files once the review passes are back.

**Also for your review:**
- No test checks the two descriptions or the new `stack-chooser` order, because the plan's test changes name none. I checked those by exact comparison instead.
- The shared safety sentence says "into a plan", but the two product agents write a weekly review, an actions file or an experiment report. I kept the one shared sentence rather than make a version per agent.
- No other test pins any of the five tools lines, so I did not need a scope-growth request.

Files changed:
- `<home>/Code/ctoc/agents/planning/kpi-planner.md`
- `<home>/Code/ctoc/agents/planning/stack-chooser.md`
- `<home>/Code/ctoc/agents/planning/unit-economics-modeler.md`
- `<home>/Code/ctoc/agents/product/experiment-designer.md`
- `<home>/Code/ctoc/agents/product/product-reviewer.md`
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
- `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js`
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s3-planning-and-product.md` (new decisions 6 to 9, the ticked steps and the Execution Record)
