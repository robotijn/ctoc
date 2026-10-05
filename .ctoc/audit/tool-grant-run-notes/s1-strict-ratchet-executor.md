The stricter ratchet is in. Each limit in the main test must now equal its ceiling in the maxima file, so moving a limit up or down takes both files changing in the same slice. All checks pass. I have not run the task completion and have not touched git.

**Test runs**
- **Both tool-grant tests:** 20 pass, 0 fail, 0 skipped.
- **`npm test`:** 12091 tests, 12091 pass, 0 fail, 0 skipped, 0 cancelled. Coverage is 99.9% against the 99% floor; the test gate says PASS.
- **Lint:** clean.
- **Type check:** 1 pass, 0 fail.
- **Approval:** still reads as approved (kind backfilled). The plan is in `plans/in-progress/`.

**Test first.** I first changed the fixture so that a limit lowered in the main file alone must fail. It went red against the old "at or below" check. Then I changed the check to equality, and both files went back to 20 of 20.

**Bite proof** (scratch copies, deleted afterwards)
- **Raised alone:** `MAX_DEBT` set to 119 in the main file only, with `red-team-critic` added to the debt list and stripped of Grep.
  - The main test stays green, 17 of 17.
  - The maxima test fails by name: "MAX_DEBT is 119 in the main test but 118 here."
- **Lowered alone:** `MAX_DEBT` set to 117 in the main file only, with `ai-code-quality-reviewer` taken off the debt list.
  - The maxima test fails by name: "MAX_DEBT is 117 in the main test but 118 here."
  - The main test also fails once, on check 3. That is correct: `ai-code-quality-reviewer` does not yet meet the policy, so it cannot leave debt.

**Recorded**
- **Decision 22 is revised** in the plan's decisions section. It now records equality as the CTO Chief decision of 2026-10-05, and that the earlier "at or below" choice is superseded.
- **It notes that slices 2 to 10 add the maxima file to their `files:`.** I did not make that edit; the separate agent is doing it.
- **The execution record** has the red run and both bite proofs.
- **The comments in both test files** now describe the equality rule.

**Files changed in this pass**
- `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js`
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js` (header comment only)
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s1-the-test.md` (decisions section and execution record)

**Still owed by the session:** the Step 13 security re-scan, which should include the maxima file; then the Step 16 final review; then `menu task complete t126`.
