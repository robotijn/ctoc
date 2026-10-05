I couldn't run `git diff`, so I checked each changed passage against the plan's approved wording, line by line. Every passage the plan specifies reads exactly as approved. The old texts it replaced are gone, and no new order in the four agent files asks for a tool that agent lacks. What I can't prove without a diff is that no line outside those passages changed.

**Verdict: pass.** One item can't wait. The slice made three documents outside its file list wrong about which model two agents run on. That has to go to the owner as a scope-growth request before the documentation step is ticked. It is not a send-back to the implement step, because the executor may not edit those files without approval.

## Your six checks

1. **Changed passages match the plan.** All of them do, in all four agent files: the tools lines, the `model:` lines, every `product-owner` passage, every `vision-advisor` passage, every `vision-decomposer` passage and every `implementation-planner` passage. The shared search section is word for word in all four, and `product-owner`'s extra paragraph is word for word at line 62. `effort:` stayed `xhigh` on both agents that moved to Opus.
2. **No order asks for a tool the agent lacks.** `product-owner` mentions WebSearch and WebFetch nowhere. A web lookup at line 539 now becomes a `needs-input` request naming `deepthink-researcher`. That agent's profile holds only WebSearch and WebFetch, so "reads the web and touches no file" is true.
3. **No Write over an existing plan where Edit fits.** Each agent now uses Write only for new files, plus `product-owner`'s status file, which the plan allows. All other changes to existing plans, stubs and visions are Edits.
4. **Limits are the same in both test files, and none was raised.**

| Limit | Main test | Limits test |
|---|---|---|
| Agents in debt | 114 entries, maximum 114 | 114 |
| Write without Edit | 18 entries, maximum 18 | 18 |
| Safety-floor exceptions | 5, maximum 5 | 5 |
| Tools those exceptions excuse | 5 | 5 |
| Held removals | 50 (unchanged) | 50 |

   The never-rise anchor in the limits test (`tests/agent-tool-grants-maxima.test.js` line 125: 118, 22, 6, 50, 6) is unchanged, which is correct. The closing comment now reads "lowering or raising one means editing both files in the same change".
5. **Model-floor exemptions.** Both entries are gone from the Sonnet exemption list in `tests/agent-model-floor.test.js` (lines 165–182). Neither agent appears in the effort exemption list or anywhere else, so either one going back to Sonnet now fails the build. `.ctoc/operations-registry.yaml` already lists `product-owner` as Opus.
6. **Personal information.** None in the seven files or the plan. The executor's run note writes `<home>` instead of a real path.

## Findings, ranked by severity

**Medium: three documents now say the two agents run on Sonnet.**
- `CLAUDE.md` lines 739–741 say "vision-advisor, product-owner (sonnet)" and "product-owner (sonnet)".
- `agents/coordinator/cto-chief.md` lines 217 and 228 say "`product-owner` (planning, sonnet)". Line 209 already says `vision-advisor` is Opus.
- `docs/IRON_LOOP.md` line 659 lists `product-owner` as Sonnet. That table is out of date in other rows too.

The plan's documentation step only says "the agents' own bodies are the documentation of their tools", which doesn't cover these. The `cto-chief.md` lines matter most, because the coordinator reads its own file before dispatching. I believe, but have not checked, that a dispatch can override the agent's model; if so, the coordinator could undo the owner's Opus decision at run time. **Needed:** file a scope-growth request now covering those five lines. Whether the file list widens is the owner's decision.

**Low: the decomposer's added content can be erased by `product-owner`.** This is in the approved wording, not a departure from it.
- `vision-decomposer.md` line 414 inserts the story map, dependency list and validation status just above `## Scope`, without giving it a heading of its own.
- `product-owner.md` line 319 tells it to replace `## Problem Statement` "together with the text under it".
- If the decomposer's content has no `##` heading, "the text under it" runs down to `## Scope`, so one Edit erases the decomposer's hand-off. That is the silent-loss problem this slice exists to stop.
- **Fix, for the owner to schedule:** give the decomposer's block its own heading in the decomposer's file.

**Low: the executor's recorded decision 10 is correct and harmless.** `createStub` in `src/lib/vision-decomposer.js` (lines 199–202) writes three placeholder checkboxes, not "the placeholder checkbox". The instruction still works because it replaces the heading together with everything under it. A side effect of the insertion rule at line 320 is that the finished plan has Scope before Acceptance Criteria, unlike the Output Format. Nothing checks section order, so this is cosmetic.

**Low: creating a new vision has no existence check.** This is approved as unchanged. `vision-advisor.md` line 225 still uses `Write()` to create the vision file without first checking the path, unlike the new check for functional plans at line 385. `createVision` in `src/tabs/vision.js` (line 343) also overwrites without checking. Two ideas whose titles slugify the same would wipe the first vision's answers. Line 293 forbids writing over an existing vision, but nothing tells the agent to look first.

**Notes, not caused by this slice:**
- Some orders were already there and still can't be carried out, because none of these agents can run JavaScript:
  - in `product-owner.md`, "by calling `writeStatus(...)`" (line 381), plus `markNeedsInput` (358), `readStatus` (377), `writeStatus` (540) and `writePlanQuestions` (600–601);
  - in `implementation-planner.md`, `markComplete` (514–516) and `markNeedsInput` (545–547).
- The new `vision-advisor` instruction at line 301 to "ask which one" relies on the ask-the-user tool. Claude Code removes that tool from dispatched agents. Slice 1 already recorded this, and it is a separate plan.
- In `tests/agent-tool-grants.test.js`, the header comment (lines 39–40) uses the same corrected "lowering or raising" wording as the closing comment. The execution record mentions only the closing comment. The odd line break suggests the header was edited in this slice too. If so, the change is harmless but should be recorded.
