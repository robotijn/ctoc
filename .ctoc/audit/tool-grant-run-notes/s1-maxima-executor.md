The maxima file is built and passes. Each maximum now lives once in each file, and raising one past its limit now needs edits in two files. Step 14 passes again. I have not run the task completion and have not touched git.

**Step 14**
- **Both tool-grant tests:** 20 pass, 0 fail, 0 skipped (17 in the main test, 3 in the maxima test).
- **Together with the two count-line tests** (`doc-counts`, `readme-numbers`): 88 pass, 0 fail.
- **`npm run lint`:** clean.
- **`npm run typecheck`:** 1 pass, 0 fail.
- **`npm test`:** 12091 tests, 12091 pass, 0 fail, 0 skipped, 0 cancelled. Coverage 99.9% against the 99% floor; the test gate says PASS.
- **Test files on disk:** 547.

**Test first.** The new file first ran 3 tests: 2 pass, 1 fail. It failed for the right reason: the main test still held its second copy of the limits. After I removed that copy (and its check 10), both files went green.

**What the new file does** (`tests/agent-tool-grants-maxima.test.js`)
- It holds each limit's ceiling once: 118, 22, 6 and 50.
- It reads each `MAX_*` from the main test as a plain literal, and fails by name if one is:
  - missing;
  - declared twice;
  - assigned again;
  - computed rather than a plain number.
- It fails if the main test states the limits a second time.
- A third test checks that the ceilings themselves never rise above those numbers.

**Bite proof** (scratch copy, deleted afterwards). I raised every copy of `MAX_DEBT` in the main file to 119; there is exactly one. I also added `red-team-critic` to the debt list and removed its Grep.
- The main test stays green, 17 of 17.
- The maxima test fails by name: "MAX_DEBT is 119, above its ceiling 118." That edit used to leave the whole test green.

**Decision for you: how strict the ratchet is.** I chose "a limit may fall below its ceiling but never rise above it", the same direction as the coverage floor test. Recorded as decision 22.
- **Why:** slices 2 to 10 pay debt by lowering limits, and they declare only the main test file.
- **The cost:** a limit a slice has lowered can later be raised back up to its ceiling with one edit in one file.
- **The stricter option:** require each limit to equal its ceiling, so that file must change in step with the main test. That means adding the maxima file to the `files:` list of slices 2 to 10, while they are still unapproved.

**Approval state**
- **Approval:** reads as approved, kind backfilled.
- **Plan:** still in `plans/in-progress/`.

**Files changed in this pass**
- `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js` (new)
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js` (second copy and check 10 removed, header updated)
- `<home>/Code/ctoc/CLAUDE.md` (two count lines, 546 to 547)
- `<home>/Code/ctoc/README.md` (one count line, 546 to 547)
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s1-the-test.md`: decision 22 added and decision 20 marked superseded, both in the decisions section; a new entry in the execution record.

**Still owed by the session:** the Step 13 security re-scan, which should now include the new file; then the Step 16 final review; then `menu task complete t126`.
