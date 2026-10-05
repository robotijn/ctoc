# deepthink slice 2 — Step 16 FINAL-REVIEW, second pass — iron-loop-critic report (verbatim)

Dispatch d-deepthink-s2-step16-final-review-2, received 2026-10-02 09:38 CEST. Verdict: READY (five plan-record corrections A–E; two remaining program defects deferred to slice 5). Saved by the session without edits.

---

**Verdict: READY.** Every finding from my first pass is closed in the skill and the test, and nothing has regressed. Before or with the move to review, the session should make five small corrections to the plan record (listed below). All five are in the plan body only. They change no code, no test and no frontmatter, so they need no return to the test step and no new test run. Only the plan validator should be run again afterwards.

## The checks, from disk

**(1) A paper already in the library: closed.**
- **Program, line 361:** `let dest = '';`
- **Program, line 371:** `dest = path.join(...)`
- **Program, line 373:** `already in the library ${dest}: ${shown}`
- **Program, line 392:** the "already exists" error from the write now prints the same line.
- **Skill lines 94, 194, 196–197 and 427:** each now says what I proposed.
- **Decision 28's extra sentence (skill line 200):** "Each paper neither kept nor already in the library is marked `[paper not fetched]`". This is correct, and was a real catch by the executor.
- **Decision 22 (plan line 239):** reworded as proposed. One harmless sentence was added: "The brief of a second run still replaces the first."
- **Test line 655:** expects the `held` line, built with `path.join`, so it holds on every platform.
- **Test line 673:** asserts `already exists` is absent.
- **`RUN_ORDER_SENTENCE` (test lines 291–297):** re-pinned, with all three parts of the justification beside it.

**(2) One time limit for the whole download: closed.**
- **Program line 267:** `const signal = AbortSignal.timeout(TIMEOUT_MS);`
- **Program line 272:** every hop passes that same `signal`.
- **Program comment, lines 262–265, and skill line 192:** both now say "every redirect included". The comment also says the name lookups are bounded by the system's resolver.
- **The stub (test lines 536–542):** a `WeakMap` gives each signal its identity, and the stub's own `lastSignal` counter gives it a number, as decision 29 says.
- **Test line 676:** no request may log `signal=none`.
- **Test line 681:** the number must be digits.
- **Test line 682:** the redirect hop and its target must carry the same signal.

**(3) The three "should fix" items: closed.**
- **The timeout case (S1):**
  - Test line 551 adds the `/stall` case.
  - There are now 19 cases (test lines 615–633).
  - Line 669 expects `not fetched, error TimeoutError`.
  - Line 670 expects `papers in the list: 19; kept: 3`.
  - Line 674 asserts `error 23` is absent.
  - `errorCode` skips the numeric `DOMException.code` and falls through to `error.name`, so the assertion is real.
- **The shell tool's time limit (S2):**
  - Skill line 186 holds the time-limit sentence, pinned at test line 299 and asserted at line 416.
  - Skill line 202 holds the reworded fallback sentence, with its justification at test lines 262–267.
- **Cleanup (S3):** `t.after` removes the temporary project in checks 14, 15 and 16.

**(4) The record fixes from my first pass: closed.**
- Decision 13 (plan line 230) now matches my proposal word for word.
- "Answered" appears at plan lines 281, 454 and 547. Line 283 says "answered" too, and the word "resolved" survives only in the history at line 520.
- Line 454 carries both facts: a push before slice 5 lands ships the skill in this state, and nothing on disk holds slice 3.
- The heading at line 393 now says it shows the first program.
- The two request-count sentences are at lines 277 and 406.

**(5) The failing run and the return count: closed, with one small gap.**
- Plan line 526 records the failing run: checks 5, 6 and 15 failed. It also records the probe showing signals 5 and 6, the `NaN` defect in the stub that the probe caught, and the timeout assertions labelled as a guard on an earlier fix.
- Plan line 512 says "two returns, both to the test step, two in total".
- The gap: the `signal=none` assertion is not labelled as a guard (correction E below).

**(6) Nothing regressed.**
- The frontmatter is exactly as the plan prescribes.
- Check 9 passes on the new prose (no abbreviation, no capital-letter word outside backticks, no gate number), and the session's run gave 22 passed, 0 failed, 0 skipped.
- README counts:
  - Line 12 reads `skills-430-blue`.
  - Line 16 reads 430, 102 and 328 (pattern matched).
  - Line 727 reads 430 and 102 (pattern matched).
  - Lines 986, 990 and 1138 are correct.
- CLAUDE.md line 703 is correct.
- `/ctoc:deepthink` appears on README lines 59, 615 and 980.
- `citation-validator` still reads `tools: Read, Grep, WebSearch, WebFetch`.

**(7) Honest and safe to move to review: yes.**
- The skill (lines 51–58) and the plan (line 454) say plainly that the reading agent is still `citation-validator`, that it holds `Read`, and that the brief's limit on local files is only an instruction.
- The inbox question `1790877923785-g7rtsc` now reads `status: answered` and has its `## Answer`.
- One fact for the session about holding slice 3. A draft of slice 5 now exists at `plans/implementation/NNNNN-deepthink-ships-with-ctoc-s5-web-only-reading-agent.md`. It is still before the owner's approval of the technical approach. Meanwhile `plans/todo/00399-…s3…` still depends only on this slice. So the moment this slice enters review, slice 3 becomes the buildable item. The session's commitment in decision 30 has to hold until the owner has approved slice 5 and slice 5 is built, not merely until slice 5 has been written.

## Record corrections (plan file body only)

**A. A live checklist line went stale when the timeout case was added.**
- **Line 256, current:** "checks 14 to 16 run the program on eighteen cases and two staging refusals"
- **Proposed:** "checks 14 to 16 run the program on nineteen cases and two staging refusals"

**B. Line 487 still claims the first return's bytes are final.**
- **Current:** `**The passing runs, on the final bytes:**`
- **Proposed:** `**The passing runs, on the bytes of the first return (superseded by the second return below):**`

**C. Line 474 describes the program before the already-in-the-library fix.**
- **Current fragment:** `so a duplicate reports "already exists";`
- **Proposed:** `so a duplicate reported "already exists" (since the second return it is reported as already in the library, M1);`

**D. The cleanup record's number disagrees with the executor's report.**
- Plan line 518 says fifteen leftover projects were removed. The executor's fourth report, line 214, says "I removed 32".
- **Current:** "(fifteen, all from earlier runs); those were then removed,"
- **Proposed:** reconcile the two from the scratch outputs. If that is not possible, use: "Before and after the passing run, the temporary folder held the same count of such projects, all from earlier runs; every leftover was then removed, and after the verification list and the full gate it held none."

**E. One guard assertion is unlabelled.**
- Append to line 526, after "…not evidence of new work.":
- "The assertion that no request carries `signal=none` also passed before the edit, because the old program gave every hop its own signal; it is a guard, and the shared-limit assertion is the evidence."

## Two remaining defects (not blocking review)

When these get fixed is the owner's call. Technically, slice 5 is the natural place, because it moves this program into `skills/deepthink/fetch-papers.cjs`.

- **Skill line 392, a flaw in my own first-pass proposal.**
  - Every "already exists" error is reported as "already in the library", but two cases that are not papers raise it too:
    - Line 386's `mkdirSync(..., { recursive: true })` raises it when `.ctoc/papers/<topic>` exists as an ordinary file. This is what I believe Node's recursive folder creation does; I did not run it.
    - The `wx` write raises it when a broken symbolic link sits at `dest`.
  - **Proposed:** ``console.log(code === 'EEXIST' && fs.existsSync(dest) ? `already in the library ${dest}: ${shown}` : `not fetched, error ${code}: ${shown}`);``
- **A run cut off by the shell tool's limit leaves kept files with no index row.**
  - On a rerun, those papers are reported as already in the library and are never added to the index, because only `kept` papers enter the run's block.
  - The brief stays honest. The index is incomplete.

## Not verified by me

- Both fingerprints and every test count. I hold only Read and Grep, so I could neither hash nor run anything.
- The shell tool's default and maximum time limits.

```json
{"scores":{"completeness":5,"clarity":4,"edgeCases":5,"efficiency":5,"security":4}}
```

Clarity is 4 until corrections A–E are made. Security is 4 because the agent can still read local files, a high finding that stands in this slice's files until slice 5 lands. The owner has answered it, and it cannot be fixed within this slice's files, so it does not block review.

Files:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js
- <home>/Code/ctoc/plans/in-progress/00398-deepthink-ships-with-ctoc-s2-deepthink-skill-and-counts.md
- <home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s2-steps-8-15-executor.md
- <home>/Code/ctoc/.ctoc/inbox/questions/1790877923785-g7rtsc.md
- <home>/Code/ctoc/plans/todo/00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds.md
- <home>/Code/ctoc/plans/implementation/NNNNN-deepthink-ships-with-ctoc-s5-web-only-reading-agent.md
