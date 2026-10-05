Slice 4 is complete: the security fix is in, the full run is green, and `menu task complete t129` moved the plan to review with passing evidence. The built work is waiting for the owner's OK to call it done.

**The fix, test first**
- With only the sentence pinned for `vercel-deploy`, the tool-grant test ran 20 pass, 1 fail, naming `saas/vercel-deploy` ("the body lacks 'and hand its answer back to you in your brief…'").
- `agents/saas/vercel-deploy.md` lines 30 and 205 now carry your exact text: no web page read, Bash never a way to the web, and lookups go through `needs-input` to `deepthink-researcher`.
- `agents/saas/legal-scaffold.md` line 180 (`regulatory_dates_verified_at`) is now worded like line 133.
- After the edits: 21 of 21.

**Full verification on the final bytes**
- Tool-grant test 21 of 21, limits test 5 of 5, model floor 12 of 12, unexecutable-order fence 27 of 27.
- Lint clean; type check 1 pass, 0 fail.
- `npm test`: 12097 tests, 12097 pass, 0 failed, 0 skipped, coverage 99.9% against the 99% floor, gate PASS.

**Completion**
- The completion route ran lint, the type check and the tests itself and recorded them as passed (coverage 99.89%, 0 skipped).
- It reported the app-launch check as not applicable, because no entry point is declared in `.ctoc/settings.json`.

**Recorded in the plan**
- Decision 13 corrects the plan's claim that the Vercel documentation order "stays unexecutable"; Bash could reach the web.
- Decision 14 lists the scan's backlog as carried items.
- The security boxes and Steps 14, 15 and 16 are ticked, citing the scan and review notes. The Execution Record ends with final fingerprints for all 14 files.

Git untouched.

Files:
- `<home>/Code/ctoc/plans/review/agent-tool-grants-s4-saas.md`
- `<home>/Code/ctoc/agents/saas/vercel-deploy.md`
- `<home>/Code/ctoc/agents/saas/legal-scaffold.md`
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
