**Verdict: pass.** All four findings from my first scan are closed inside this slice's files. The fix pass added no new problem: no new strict-YAML failure, no secret, no personal information, and no lost protection. The items still open are older problems in files outside this slice. The plan records each of them as carried.

**Something you should know first.** The diff you gave me no longer matches the working tree. At 23:29, during my scan, someone else edited two agent bodies. I don't know which agent it was; it wasn't me. I checked both changes and they are harmless. Neither touches the frontmatter, the search section or any pinned sentence, and both frontmatters still parse. The test counts below were taken after those changes.
- `kpi-planner` gained "On a second run, revise the existing kpis.yaml with `Edit`; `Write` only creates it."
- `unit-economics-modeler` gained "If the canvas plan already holds a `unit_economics:` block, replace it instead of adding a second."

## The four findings

**1. The product reviewer could fetch from the web through Bash: closed in this slice.**
- The exports-only paragraph sits after the ninth check in `agents/product/product-reviewer.md`, before "### Skills you reuse". It is pinned in `AGENT_BODY_SENTENCES`.
- I proved the pin on a scratch copy. Each of these made the policy test fail with "product/product-reviewer: the body lacks 'Review only the exports…'":
  - deleting the paragraph;
  - moving it into a fenced code block;
  - changing "Never call" to "Avoid calling";
  - cutting the "never run a command" clause.
- Still open, outside this slice's files and recorded in the plan as carried:
  - The method file still says `# OR call PostHog API` (line 80).
  - It still contains the script that calls PostHog and Stripe (lines 351–392).
  - Its own frontmatter still lists WebFetch (line 28).
  - Bash itself stays, under your hold.
- That method file is covered by the approved plan for the product-reviewer skill improvement (`plans/todo/00303-…-s43-product-reviewer.md`). Whether that plan should take the cleanup is your call.

**2. The colon that broke strict YAML in `experiment-designer`: closed.**
- `js-yaml` 4.2.0 is installed in `node_modules`, but only as a dependency of another package; this project does not declare it.
- It parses all five frontmatters. Each reads back the expected tools line.
- As a control, I put the old "still lacks: sample size" back and it fails again with "bad indentation of a mapping entry (2:206)", so the parser does catch the problem.
- Across all 125 agents, strict YAML still rejects exactly the same two as before the change: `dependency-auditor` and `security-scanner`. Both are pre-existing, belong to a later slice, and are recorded as carried.

**3. The sentences about the product agents' own output files: present and pinned.**
- `product-reviewer` covers "the weekly review and the actions file". `experiment-designer` covers "the experiment spec". Both sit in the search section and are pinned in `AGENT_SENTENCES`.
- Deleting either one fails the policy test, and the failure names the agent. So do moving the reviewer's sentence out of the search section and changing one word in the designer's.
- This matters because none of the three output paths is git-ignored: `.ctoc/product-loop/reviews/`, `actions/` and `experiments/` are all committed.

**4. The hand-kept list is now a rule: closed, and the rule catches the mutations below.**
- Check 11 binds every agent holding Grep with Write or Edit, whether or not it is in debt. That is 21 agents today: 9 carry the safety sentence and 12 are on `MATCH_IS_DATA_DEBT`.
- `MAX_MATCH_IS_DATA_DEBT` is 12 in the main test, 12 as the ceiling in the maxima file, and 12 as the historical first value.
- Mutation results on the scratch copy, which I deleted afterwards:

| Change | Result |
|---|---|
| Safety sentence deleted from each of the 9 bound agents in turn | check 11 fails, naming the agent, every time |
| Sentence fenced, moved under the honest-status heading, or "a plan" changed to "plans" (in `kpi-planner`) | check 11 fails |
| Grep newly given to `documentation-updater` (a debt agent with Write) | check 11 fails |
| Edit newly given to a reviewer that holds only Grep | checks 9 and 11 fail |
| `playwright-qa` taken off the debt list, both limits lowered | check 11 fails |
| `coverage-mapper` gains the sentence but stays listed | check 11 reports it as paid; check 4 also fails |
| A made-up agent added to the debt list | check 11 fails ("no such agent"); the ceiling test fails |
| The old escape: sentence deleted, agent added to the debt list, limit raised in the main file only | test 7.11 and the limits test fail |
| The same, with the ceiling also raised in the maxima file | the "ceilings only fall" test and test 7.11 fail |
| The rule's own logic broken (ignore Edit; always "carries") | test 7.11 fails |
| The new list's ceiling taken out of the maxima file's table | maxima test 3 fails |

The unchanged copy passed 26 of 26, and so did the restored copy.

There is a limit to this, by design. Two kinds of edit still pass:
- **The full escape.** It takes six coordinated edits across both test files, three of them inside assertions whose messages say "only fall".
- **Emptying check 11.** Replacing its call with an empty list passes. So does doing the same to check 3; I tried both.

The only guards against these edits are the requirement that every edit to `tests/` be covered by an approved plan, and review.

## Did the fix pass open anything new?
- **The protection that moved still holds.** The safety sentence left `AGENT_SENTENCES` for four planning agents, but check 11 now catches each of them (the deletion mutations above).
- **`experiment-designer` keeps Write and Edit.** This reverses a removal you had put on hold. The plan records it as decision 10, to be put to you when you give the final OK on the slice. The evidence is real: line 293 of its method file is "### Step 11: Write the experiment spec". The agent holds no web tool and no Bash, and the pinned output sentence covers the file it writes. From a security point of view it is acceptable; whether to accept it is your decision.
- **No secrets or personal data.** I scanned every added line, the plan and the fix-pass report for email addresses, home-directory paths, names and key-shaped tokens, and found none.
- **The approval still holds.** All four of the slice's files I checked still resolve to this approved in-progress plan.

## Tests (current tree, Node v24.14.1)
`node --test tests/agent-tool-grants.test.js tests/agent-tool-grants-maxima.test.js tests/agent-model-floor.test.js`: 38 tests, 38 pass, 0 fail, 0 cancelled, 0 skipped.

| File | Tests | Pass |
|---|---|---|
| Main tool-grant test | 21 | 21 |
| Maxima test | 5 | 5 |
| Model-floor test | 12 | 12 |

I did not re-run `npm test`. The fix pass reports it red: 3 failures from two unapproved plans in `plans/implementation/`, neither of them part of this slice.

**One low, older gap for you to decide on.** The rule is keyed on tool names, and Bash can both search and write. It does not reach:
- 38 agents that hold Grep and Bash but no Write or Edit;
- 14 agents that hold Write or Edit and Bash but no Grep.

This change did not open the gap.

```yaml
- {agent: security-scanner, severity: critical, internal_tier: high, confidence: high, baselineState: updated, status: closed-in-slice,
   file: agents/product/product-reviewer.md, message: "Bash web channel: prohibited by a pinned order; method-file line 80 and script lines 351-392 carried"}
rollup: {verdict: pass, critical: 0, high: 0, medium: 0, low: 1, closed: 4,
   analyzers: "no SARIF supplied; js-yaml strict parse, mutation run, own pattern scan for secrets; no policy or baseline in the repository, so the skill's default policy applied"}
```

I edited no project file and touched nothing in git. My temporary files in the scratchpad are deleted.

**Risk:** this verdict covers the tree as of 23:35. Another agent is editing these files at the same time, so a later change has not been scanned.
