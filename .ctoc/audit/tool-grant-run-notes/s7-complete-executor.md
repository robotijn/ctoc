Completed: `agent-tool-grants-s7-iron-loop-pipeline-coordinator`. Task `t133` is done; the plan is in `plans/review/` with passing verification evidence, built and waiting for the owner's OK to call it done.

**Fix pass (test first, then the files):**
- **Builder** (`agents/iron-loop/iron-loop-executor.md`): the network paragraph is replaced with your merged text. The section list agrees with the seven rows of `EXECUTION_SECTION_PRODUCERS` ("the decisions sections" stands for the two decisions rows), so I used it as given. Pinned as `EXECUTOR_NETWORK_SCOPE`, `RUN_OUTPUT_IS_DATA` and `EXECUTOR_OTHER_TEXT_IS_DATA`, joined.
- **`ivv-chief`**: the isolation exception follows the search rule and is pinned in `AGENT_SENTENCES`.
- **`citation-validator`**: the "Nothing leaves through a query" paragraph is added and pinned.
- **`agent-publisher`**: both entry edits say "the published agent's entry" and carry the no-entry-yet clause; all four phrases are pinned.
- **Plan record**: decisions 17 to 22 hold the four fixes, your approval-record correction, and both backlog lists as one-line items with the checkbox-hash item first. Every step from 8 to 16 is ticked.

**Verification on the final bytes (load 5.7 at the start):**
- Fix-pass red run: 22 tests, 1 failing, naming all four agents. Mutation proof: 18 of 18 caught by name.
- Lint and type check: exit 0.
- Tool-grant test, limits test, model floor, unexecutable-order fence, watcher-shape, architecture invariants and the record test: 135 of 135, 0 skipped.
- `npm test`: 12098 of 12098, 0 failed, 0 skipped, coverage 99.89% against the 99% floor.
- Completion's own run: lint, type check and tests passed. Its entry-point launch check reported not applicable, because no entry point is declared in `.ctoc/settings.json`.

No limit moved in this pass (63, 5, 5; 48 held). Nothing in git was touched. Edits were again made by exact-once scripts through the shell, not the Edit tool; the record says so.

The plan is at `<home>/Code/ctoc/plans/review/agent-tool-grants-s7-iron-loop-pipeline-coordinator.md`.
