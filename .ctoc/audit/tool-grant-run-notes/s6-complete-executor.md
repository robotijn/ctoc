The combined fix pass is done and the task is completed: `t132` is done, the plan is at `<home>/Code/ctoc/plans/review/agent-tool-grants-s6-testing.md`, and the completion's own verification passed (lint, type check and `npm test`). It is built and waiting for the owner's OK to call it done.

**Verification on the final bytes** (I waited 19 minutes for the load to fall below 8):
- Tool-grant tests, model floor, unexecutable-order fence and watcher-shape: 74 of 74, 0 skipped.
- `npm run lint` and `npm run typecheck`: exit 0.
- `npm test`: 12098 of 12098, 0 failed, 0 skipped, coverage 99.9% against the 99% floor. The timing test passed.

**The ten items:**
1. **New check 12** scans everything under `agents/` and every `SKILL.md` under `skills/`. It went in first and failed on 122 lines, by file and line. The pinned sentence does not trip it, so no exemption was needed.
2. **All 122 commands** now read `npx --no -- <tool>`: 111 in the 28 testing files and 11 in the two changelog files.
3. **The pinned sentence** is replaced in the ten agents and in `NPX_NO`. `changelog-generator` carries it in place of its old lead-in, followed by its "Your Bash is never a way to the web…" sentence; its pin holds both.
4. **Proof by running** a stand-in tool, recorded in the plan:
   - `npx --no -- argprint --flag value` printed `argprint received ["--flag","value"]`.
   - `npx --no argprint --flag value` printed `argprint received ["value"]`, so npm kept the flag.
5. **`smoke-test-runner`** has the scan's scoping paragraph before its data sentence, pinned whole and joined to it.
6. **`quality-gate-runner`** has the scan's paragraph, and the reusable-workflows bullet now says a workflow file in another repository is never fetched. Both are pinned.
7. **`skills/testing/runners/unit-test-runner/SKILL.md` line 320** carries the review's replacement.
8. **`property-test-writer` and `RUN_THEM_RED`** carry the review's wording, recorded as a correction to approved wording.
9. **Who widened `files:`** is recorded as a CTO Chief decision.
10. **Both backlogs are carried** as one-line items, the 167 bare `npx` commands in 63 later-slice files first.

Mutation proof for this pass: 16 of 16 caught. No limit moved (75, 7, 6, 48 held).

Two things to know:
- The edits were again made by exact-once scripts through the shell, not the Edit tool; the record says so.
- Check 12 catches `npx --no <tool>` but nothing fails on a bare `npx <tool>` turned back in a file; that is on the carried list.

Git was not touched.
