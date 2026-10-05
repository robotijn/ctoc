Slice 1 is complete: `menu task complete t126` moved the plan to review, Step 14 VERIFY passed, and the evidence is saved for the owner's decision. I did not touch git.

**Completion result**
- **Returned:** `ok: true`, "Task t126 → done · moved to review (the checks passed; the evidence is saved for when you decide it's finished)".
- **Plan:** now at `<home>/Code/ctoc/plans/review/agent-tool-grants-s1-the-test.md`.
- **Evidence:** `.ctoc/state/verify/agent-tool-grants-s1-the-test.json`.
  - VERIFY passed; it ran lint, the type check and `npm test`.
  - The app-launch check was "not applicable".
  - The task registry records the task as claimed, started 15:02.

**Step 14 on the final files, before the completion**
- **Both tool-grant tests:** 24 pass, 0 fail, 0 skipped (main 19, maxima 5).
- **Lint:** clean.
- **Type check:** 1 pass, 0 fail.
- **`npm test`:** 12095 tests, 12095 pass, 0 fail, 0 skipped, 0 cancelled. Coverage is 99.9% against the 99% floor, and the test gate says PASS.
- **Test files on disk:** 547.

**The seven fixes, each with its fixture seen red first**
1. **Invisible characters.** `parseFrontmatter` refuses any line holding an invisible character, tab exempt; the check sits right after the `---` check. A NUL fails as "holds the invisible character U+0000". Fixtures in 7.9 cover a NUL in a description, a nested item and a value, plus U+200B, all written as escapes.
2. **The stub runs `describe` bodies.** `it` bodies still never run. The maxima header's "cannot catch" now also names values changed while the suite runs, and a main test that detects the stub.
3. **Time limit.** `runInContext` now has a 10-second limit (test 3.1). Before the fix, the red run hung until I killed it at 30 seconds.
4. **Names.** Each agent's `name` must equal its file's base name, and no two definitions may share a name. This runs in the census (check 1 and test 7.10).
5. **Repairable keys.** Every key in `FRONTMATTER_KEYS` must match `^[a-zA-Z_-]+$` (check 2 and test 7.10).
6. **Failure values** are printed with `JSON.stringify`, so a string reads as `"2"`.
7. **Nested keys** are compared without regard to letter case, so `null` and `Null` count as the same key.

**The scanner's 84 rows** (`harness4.js`): 78 fail by name and 6 stay green.
- **Three correct greens:** no change; Windows line endings with the grant unchanged; a `tools:` line in the body.
- **Three named in the "cannot catch" sentences:**
  - check 3 handed a wider debt set;
  - a main test that tests for `process`;
  - a main test that replaces `JSON.stringify` in its own context.
- **Named failures:**
  - The three NUL rows fail by name. I confirmed the exact message in a separate scratch run.
  - The describe-body row fails in the maxima file.
- **Caveat:** the harness copied both test files before I changed their header comments. The Step 14 run above is on the final bytes.

**Recorded**
- **Test header and decision 23:** both say "verified against Bun 1.4.2 and 1.4.3-canary on all 125 agents; the exact embedded build is unpublished; re-run on each Claude Code update".
- **Step 13:** "Validate inputs" is ticked and points to the fourth scan.
- **Execution record:** has the fourth pass.
- **Approval:** still matched before the completion.

**Things to know**
- **One fixture was itself wrong.** It used the debt list before the list was declared. I fixed its order rather than loosening the check, and confirmed it is red against the old stub in a scratch copy.
- **The Edit tool turned the `\u200b` escape into a raw character.** I put it back as the six-character escape with a checked replacement. Neither test file holds a raw NUL, byte-order mark or zero-width space.
- **I ticked the last box, "Ready for human review", just before the completion.**
- **A leftover status file remains:** `plans/in-progress/agent-tool-grants-s1-the-test.md.status`. CTOC's start step appears to have created it; I left it alone.
- **The scheduler offered four queued tasks to promote** (t43, t44, t45, t48). I dispatched none; promoting them is the session's call.

**For the owner, word for word, before he approves this slice as done** (the final review's finding 4):
- "Your answer to question 4 (the gate critics keep their grants) was superseded for `gate-critic` by your later Write-and-Edit ruling: it gains Edit in slice 7."
- "You approved removing `product-reviewer`'s Write, Bash and WebFetch. That rested on a misreading: its method file orders two writes. Slice 3 now drops WebFetch only, keeps Write, adds Edit, and holds Bash for measurement."

The built test is now waiting for his OK to call it done.

**Before the session commits.** The review asked for one check on plan 00266's uncommitted edit to `agents/architecture/dependency-analyzer.md`. If any hunk starts at line 12 or earlier, it touches the frontmatter the test reads. In that case, re-run the two tests on the staged tree.

**Files changed in this pass**
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
- `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js`
- `<home>/Code/ctoc/plans/review/agent-tool-grants-s1-the-test.md` (moved there by the completion; decisions section, execution record and checkboxes)
