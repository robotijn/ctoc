The fix pass is done, but the full suite (`npm test`) is not green: 3 of its 12,097 tests fail, all caused by two plan files outside this slice. Everything else in the verification step passes, and I have stopped before the final review.

**The three failures.** They are all in `tests/iron-loop-enforcer.test.js`, and all come from one finding: plans sitting in `plans/implementation/` with no approval record. The check names exactly two files:
- `plans/implementation/a-quotation-is-not-a-file-claim.md`
- `plans/implementation/goal-titles-cannot-write-frontmatter-lines-into-a-stub.md`

Both were written during my run, at 23:20 and 23:22, and neither is tracked in git or belongs to this slice. I did not touch them. Once they have an approval record or are removed, `npm test` needs one more run on these files before the verification step can be ticked.

**Verification counts:**

| Check | Result |
|---|---|
| Main tool-grant test | 21 of 21 pass |
| Limits test | 5 of 5 pass |
| Model-floor test | 12 of 12 pass |
| Unexecutable-order fence | 27 of 27 pass |
| `npm run lint` | clean |
| `npm run typecheck` | 1 pass, 0 fail |
| `npm test` | 12,094 pass, 3 fail, 0 skipped, 0 cancelled; coverage 99.9% against the 99% floor; test gate FAIL |

All test runs had 0 skipped. There are still 547 test files. The plan checker accepts the plan with no errors, and the build approval still holds.

**Your eight decisions, as built.** Each is recorded under Decisions as yours (decisions 10 to 17), and the two items you left out are recorded as carried (decision 18).
- **`experiment-designer` keeps Write and Edit.**
  - Its profile now writes, with a comment that cites line 293 of its method file.
  - Its Write and Edit pair is off the held-removals list. The held-removals limit went from 50 to 48, and the per-tool counts to Write 13 and Edit 13, in both test files.
  - The comment now reads "48 tools on 26 agents".
  - Its description now ends "Writes the experiment spec." before "Dispatch when".
- **Plan corrections.** The wrong statements are approval-protected text, so I recorded old and new wording in decision 10 instead of editing them. That covers plan lines 40, 45 and 85, and also lines 25, 27, 75, 92 and the first item of Step 13, which said the same wrong thing. Decision 4 now points to decision 10, and decision 5 is marked superseded by decision 7.
- **YAML colon.** The description now reads "still lacks — sample size". `js-yaml` 4.2.0 is installed, though only as a dependency of another package, not one this project declares. It now parses all five frontmatters, and the version before the fix failed with "bad indentation of a mapping entry (2:206)".
- **`product-reviewer` exports paragraph.** It sits after its ninth check and is pinned in `AGENT_BODY_SENTENCES`.
- **Output-file sentences.** Both are in the product agents' search sections and pinned in `AGENT_SENTENCES`.
- **The rule replaces the hand-kept list.**
  - A new check 11 requires every agent whose tools include Grep together with Write or Edit to carry the safety sentence in its search section.
  - The new `MATCH_IS_DATA_DEBT` list holds 12 agents, each commented with the slice that clears it. Its limit of 12 is stated in both test files, with 12 as its starting ceiling.
  - The safety sentence is no longer in `AGENT_SENTENCES`.
  - Test 7.11 now works out its agents from the rule over the real grants. It finds 9 today and fails below 9.
- **`stack-chooser`:** the sentence about not repeating keys was added.
- **`unit-economics-modeler`:** the "Edit, never a rewrite" sentence was added.

**Test first.**
- Changing the profile alone failed check 2: "Write is needed by its profile, so holding its removal means nothing".
- The new pinned sentences failed check 3 three times, by name, before any agent text changed.
- Check 11 passed at once, because the debt list named exactly the agents lacking the sentence. Its failing cases are shown by mutation instead.

**Mutation proof** was run on a scratch copy, deleted afterwards; the unchanged copy passed 21 of 21 and 5 of 5. Each change below failed by name:
- removing the safety sentence from `kpi-planner`, and separately from `product-owner`, failed check 11;
- taking `playwright-qa` off the debt list failed check 11;
- giving `security-scanner` the sentence while it is still on the debt list failed check 11, which reports it as paid;
- the old escape (sentence removed, the agent added to the debt list, the limit raised in one file only) was caught by both test 7.11 and the limits test;
- removing any of the three new pinned sentences failed check 3;
- putting `experiment-designer`'s pair back on the held-removals list failed checks 2 and 8 and the limits test;
- raising the new limit in the limits file alone failed that file's tests 1 and 2.

**Carried, for you:**
- The index's audit row for `experiment-designer` (line 316) and its held-removals count still say 50 tools on 27 agents. The index is outside this slice's files.
- `gate-critic` is on the new debt list for slice 7. But it is a fenced agent with no order to search the whole repository, and check 11 asks for the sentence inside a search section. Slice 7 either gives it one, or the rule must say where a fenced agent carries the sentence.
- The review did not read the method files of the other agents whose Write is held, so the same misreading may recur in slice 11.

I left Steps 11 and 13 unticked, because you decide whether those passes run again.

Files changed in this pass:
- `<home>/Code/ctoc/agents/product/experiment-designer.md`
- `<home>/Code/ctoc/agents/product/product-reviewer.md`
- `<home>/Code/ctoc/agents/planning/stack-chooser.md`
- `<home>/Code/ctoc/agents/planning/unit-economics-modeler.md`
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
- `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js`
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s3-planning-and-product.md`
