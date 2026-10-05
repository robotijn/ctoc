The fix pass is done and Step 14 passes on the final files. Two steps remain for the session: the security re-scan and the final review. I have not run the task completion, and I have not touched git.

**Step 14 (re-run on the final files)**
- `tests/agent-tool-grants.test.js`: 16 pass, 0 fail, 0 skipped.
- `npm run lint`: clean.
- `npm run typecheck`: 1 pass, 0 fail.
- `npm test` (the gated suite): 12087 tests, 12087 pass, 0 fail, 0 skipped, 0 cancelled. Coverage is 99.9% against the 99% floor, and the test gate says PASS.
- There are 546 test files on disk.

**Test first.** First I made the loader read through a file reader passed in, and turned checks 3 and 5 into plain functions over a list of agents; the suite stayed green. Then I wrote six new fixture tests: 15 tests ran, 6 failed, each for its own fix:
- "Edit alone" still passed because of the `editsOnly` exception.
- `Tools:` with a capital T was not refused.
- NotebookEdit next to WebFetch did not break the safety floor.
- An unreadable file threw an error instead of being named.
- Check 3 ignored the debt and exception tables it was given.
- An exception reason that names no slice was accepted.

Fixture (f)'s passing case passed on the old code; it was a missing assertion, not new behaviour.

**The checks and their counts**
1. Census: 125 definitions, no load error, no unreadable or non-regular entry, every grant readable whether in debt or not.
2. Every profile is a lawful reading of the policy, and every safety exception's tools are valid.
3. A tool an agent holds that its orders do not need now fails on every agent; debt only suspends the missing tools. 118 agents are in debt.
4. The debt list's size must equal its maximum: 118 = 118.
5. Safety floor as an allowlist: 6 exceptions, each written as `{ reason, tools }` and naming the slice that removes it.
6. One `product-owner` definition (two assertions).
7. Fixtures (a) to (l), plus new tests 7.1 to 7.6.
8. Held removals: 50 = 50.
9. Write and Edit go together: 22 = 22, and Edit without Write always fails.
10. Each maximum is stated a second time in `HISTORICAL_MAXIMA` (118, 22, 6, 50), and neither copy may rise.

**Bite runs (in a scratch copy, deleted afterwards): 19 of 19 fail by name.** Each failing run exited non-zero.
- Your four:
  - Deleting `code-reviewer`'s tools line fails check 1 ("has 0 tools keys").
  - Adding Bash to `code-reviewer` fails check 3.
  - Adding `WebFetch, NotebookEdit` to the debt agent `code-smell-detector` fails the safety floor.
  - A symbolic link under `agents/` fails the census.
- The security report's grant shapes:
  - a quoted grant, and a bracketed list of quoted tools;
  - `Tools:` with a capital T, and `tools :` with a space;
  - two tools lines;
  - WebSearch with Task, and WebFetch with Agent;
  - an external server's tool;
  - a closing `---` with a trailing space.
- Load failures: an unreadable file, and a missing `agents/` folder.
- The earlier three, plus `MAX_DEBT` raised to 119.

**Debt lists**
- **Grant debt: 118**, unchanged.
- **Held removals: 50 tools on 27 agents** (Bash 21, Write 14, Edit 14, Task 1). This adds Bash on `product-reviewer` to the earlier 49.
- **Write without Edit: 22**, with the slice that clears each:

| Clears it | Agents |
|---|---|
| Slice 2 | `product-owner`, `vision-advisor`, `vision-decomposer`, `implementation-planner` |
| Slice 3 | `kpi-planner`, `stack-chooser`, `unit-economics-modeler`, `product-reviewer`, `experiment-designer` |
| Slice 4 | `vercel-deploy` gains Edit; `legal-scaffold` drops Write |
| Slice 5 | `ci-runner-setup`, `deployment-setup` |
| Slice 6 | `coverage-mapper`, `smart-test-runner` |
| Slice 7 | `agent-publisher`, `gate-critic` (once slice 7 declares its file) |
| Slice 8 | `security-scanner`, `clm-obligations`, `dsar-handler`, `cra-incident-clocks` |
| Slice 9 | `quality-gate` |

For `experiment-designer`, `vercel-deploy`, `clm-obligations`, `dsar-handler` and `cra-incident-clocks`, the Write and Edit pair then stays held for slice 11.

**Decisions recorded** (all inside the decisions sections, outside the approval record; I checked afterwards that both approvals still match).
- **Slice plan:**
  - Decision 10 is rewritten to list every way the test departs from its specification.
  - 13: `gate-critic` gains Edit.
  - 14: the five held-Write agents gain Edit in the slices that own their files.
  - 15: `product-reviewer` drops WebFetch only, keeps Write, gains Edit, and its Bash is held.
  - 16: AskUserQuestion is removed from every dispatched agent, recorded as fact.
  - 17: the corrections after Step 9, old text beside new.
  - 18: the new counts.
- **Index:**
  - 17: the three decisions above, with the counts.
  - 18: the AskUserQuestion fact.
  - 19: the Step 9 corrections 4 to 10.

**Where I differ from the brief**
1. **Edit gains are 22, not 21.** The 15, plus `gate-critic`, the five held-Write agents and `product-reviewer`, come to 22; 21 leaves out `product-reviewer`. Held removals are 50, and agents whose grant changes in slices 2 to 10 are 79, both as you said.
2. **The safety exceptions excuse six tools, not eight.** Under the `product-reviewer` decision, its Write is now needed and its Bash is held, so only WebFetch is excused for it.
3. **Not done:** the review's finding 14 (a comment on `complexity-reducer`'s profile) was outside the brief's list. The stale counts in slice 11's own file are also not changed, since that file is not this slice's.

**Still owed by the session:**
- The security re-scan, then the final review, then `menu task complete t126`.
- Before slice 3 is approved for build, it must be changed to keep `product-reviewer`'s Write.
- Slice 7 must declare `agents/iron-loop/gate-critic.md`.

The security report's other findings also need their own plans; when to build them is your decision:
- The settings files can switch edit protection off without a plan.
- The test gate cannot see a suite that fails while loading.
- Shell commands that write through a script interpreter skip plan coverage.

**Files changed**
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s1-the-test.md` (decisions, checkboxes, execution record)
- `<home>/Code/ctoc/plans/todo/agent-tool-grants.md` (decisions 17 to 19)
- `<home>/Code/ctoc/CLAUDE.md` and `<home>/Code/ctoc/README.md` were already changed in the first pass (count 546) and were not touched in this one.
