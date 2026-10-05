# deepthink slice 2 — Step 16 FINAL-REVIEW — iron-loop-critic report (verbatim)

Dispatch d-deepthink-s2-step16-final-review, received 2026-10-02 09:28 CEST. Verdict: KICKBACK to Step 8 (M1 a paper already in the library marked not fetched; M2 per-hop timeout; S1–S3; R1–R3; O1–O3 for the session). Saved by the session without edits.

---

**Verdict: send it back to Step 8, the test step.** This would be the second return for this plan, both to Step 8. That is within the limits of three returns to one step and five in total.

**Your central question.** It is honest for the skill to keep naming `citation-validator` until slice 5. Skill lines 57–58 say outright that the brief's limit on local files "is an instruction the agent is given, not a check that stops it". It is also safe for review, because review ships nothing. But the record says the security block is "resolved", and that is too strong: nothing in this slice's files has changed the risk. The record also leaves out two facts that follow from it (R2 and O1 below).

Neither of those is why I'm sending it back. The return introduced a new defect that the review and the security scan both missed: a paper that is already in the library gets marked `[paper not fetched]` in the brief. And one timing claim in the shipped skill is false. Both are changes to code and text, so each needs a failing test first.

I hold only Read and Grep. Everything below comes from reading files. I ran nothing and could not compute the fingerprints.

## Must fix in this slice (failing test first, then the fix)

**M1. A paper already in the library is reported as not fetched.** This came in at the return, with decision 22.
- **Where:** `skills/deepthink/SKILL.md` lines 367–370 and 387 (the program), line 94 (the sentence pinned as `RUN_ORDER_SENTENCE`), lines 191–192, 194–195 and 421–422.
- **What happens:**
  - The program prints `not fetched, already exists`.
  - Line 94 then says "mark every paper it did not keep `[paper not fetched]`, and name its reason under Failures".
  - Line 69 says a second run on the same item reuses its slug, and its brief replaces the first.
  - So the second brief marks every paper the first run downloaded as not fetched, while the files sit in `.ctoc/papers/`.
- **How often:** every rerun after a failed run whose program had already run; every second run on the same item; and every run where a paper's name matches one already in the library. The brief steers toward that last case, because it asks the reading agent to reuse existing topic folders.
- **Program, current (367–370):**
  ```js
        if (fs.existsSync(dest)) {
          console.log(`not fetched, already exists: ${shown}`);
          continue;
        }
  ```
  **Proposed:** add `let dest = '';` before the `try {` on line 357; change line 366 from `const dest =` to `dest =`; and use:
  ```js
        if (fs.existsSync(dest)) {
          console.log(`already in the library ${dest}: ${shown}`);
          continue;
        }
  ```
- **Program, current (387):**
  ``console.log(`not fetched, ${code === 'EEXIST' ? 'already exists' : `error ${code}`}: ${shown}`);``
  **Proposed:**
  ``console.log(code === 'EEXIST' ? `already in the library ${dest}: ${shown}` : `not fetched, error ${code}: ${shown}`);``
- **Line 94, current:** "then add "Papers downloaded" from the program's `kept` lines, mark every paper it did not keep `[paper not fetched]`, and name its reason under Failures;"
  **Proposed:** "then add "Papers downloaded" from the program's `kept` lines and its `already in the library` lines, listing the second kind as already in the library under that file name; mark every other paper `[paper not fetched]`, and name its reason under Failures;"
- **Lines 191–192, current:** "and an existing file is never overwritten."
  **Proposed:** "and an existing file is never overwritten: that paper is reported as already in the library under that name, never as not fetched."
- **Lines 194–195, current:** "The program prints one line per paper, kept, not fetched or refused,"
  **Proposed:** "The program prints one line per paper, kept, already in the library, not fetched or refused,"
- **Lines 421–422, current:** "then "Papers downloaded" with each kept file and its size,"
  **Proposed:** "then "Papers downloaded" with each kept file and its size, and each file already in the library,"
- **Test:** `tests/deepthink-ships-with-ctoc.test.js`.
  - Line 637, current: `'not fetched, already exists: "https://papers.example/ok"',`
    Proposed: ``const held = `already in the library ${path.join('.ctoc', 'papers', 'retrieval', 'kept-paper.pdf')}: "https://papers.example/ok"`;`` — add `held` to `expectLines`, and also assert `out.includes('already exists') === false`.
  - Update `RUN_ORDER_SENTENCE` (lines 286–287) to the new line 94, with a written justification beside it:
    - The contract comes from outside the test: skill lines 444–445 say a paper is marked `[paper not fetched]` only when it "could not be fetched", and the honest-status fragment applies.
    - Why the test and not the code: the pinned sentence itself orders the false marker.
    - What newly fails: a program or an instruction that reports a paper already in the library as not fetched.
- **Plan decision 22, line 239, current:** "a second run on the same item reports "already exists" for each paper it already holds."
  **Proposed:** "a second run on the same item reports each paper it already holds as already in the library, and the brief lists it so, never as `[paper not fetched]`; a different paper given the same name would be reported the same way, which the brief's file name lets the reader see."

**M2. "The whole download stops after sixty seconds" is false once a redirect is involved.**
- **Where:** skill lines 261 and 268. The comment says "The whole download stops after TIMEOUT_MS", but the code makes a new `AbortSignal.timeout(TIMEOUT_MS)` for each hop. A chain of five redirects can therefore take six minutes. Line 190 ("A download stops after sixty seconds") is false in the same way. The name lookups have no limit from this program at all.
- **Current (263–268):**
  ```js
  async function download(address) {
    let current = address;
  ...
      const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  ```
  **Proposed:**
  ```js
  async function download(address) {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let current = address;
  ...
      const response = await fetch(current, { redirect: 'manual', signal });
  ```
- **Line 261, proposed:** "The whole download, every redirect included, stops after TIMEOUT_MS; the name lookups are bounded by the system's resolver, not by this limit."
- **Line 190, proposed:** "A download, every redirect included, stops after sixty seconds, or past one hundred mebibytes counted after decompression."
- **Test (fails against today's code):**
  - In `STUB_PRELOAD` (lines 523–525), make the stub `async (input, init)`.
  - Give each distinct `init.signal` a number through a `WeakMap`, and log `url + ' signal=' + number` (or `signal=none`). The existing `startsWith`/`includes` checks still hold, because each log line still begins with the address.
  - In check 15, assert that the `https://papers.example/to-https` request and the `https://papers.example/ok` request that follows it carry the same signal number, and that no line carries `signal=none`.

## Should fix in the same return

**S1. The error path, and the fix for `error 23`, have no test in the suite.** That fix was made after a manual run against the stub server, never against a failing suite test. None of the 18 cases reaches the per-paper `catch` or `errorCode`.
- **Proposed:**
  - In the stub's `switch` (line 526), add `case '/stall': throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');`
  - In `CASES` (line 596), add `{ url: 'https://papers.example/stall', topic: 'retrieval', file: 'stalled' }`.
  - In `expectLines` (line 634), add `'not fetched, error TimeoutError: "https://papers.example/stall"'`, and change `'papers in the list: 18; kept: 3'` to `'papers in the list: 19; kept: 3'`.
  - Assert `out.includes('error 23') === false`.

**S2. The shell tool's time limit (believed, not verified).** I believe Claude Code's shell tool stops a command after two minutes by default. Two stalled papers at sixty seconds each exceed that.
- **What a killed run leaves:** kept files with no index row, the staging file still in place, and no closing line.
- **What the skill then says:** line 200, "every paper is marked `[paper not fetched]`", which is false for the papers already kept.
- **Proposed, line 183:** add after it: "Run it with the shell tool's time limit set to its maximum."
- **Proposed, line 200:** "If the program itself fails to run, or stops before printing `papers in the list:`, no paper is downloaded by any other means: every paper without a `kept` or `already in the library` line is marked `[paper not fetched]`, the program's error is named under Failures, and no download command is ever written by hand." This changes a pinned sentence, so it needs the same three-part justification beside it.

**S3. The test leaves three temporary projects behind on every run.** `projectWithProgram` (line 567) is never cleaned up.
- **Proposed:** the three tests take `(t)`, and each adds `t.after(() => fs.rmSync(dir, { recursive: true, force: true }))`.

## Fixes to the record (plan file only)

**R1. Decision 13 still describes the replaced design.** The brief asked for superseded statements to be rewritten; the review's item 1 also asked for the name in decision 13 to change.
- **Line 230, current:** "…`node .ctoc/papers/fetch-papers.js .ctoc/papers/.incoming-<slug>.json`, … A ninety-line program … the session writes the program unchanged from the skill with the Write tool, so it stays one fixed program on every platform."
- **Proposed:** "**The fixed program is written to a file and run from it**, `node .ctoc/papers/fetch-papers.cjs .ctoc/papers/.incoming-<slug>.json`, not as `node -e "<program>"`. A program of nearly two hundred lines with quotes inside a shell string breaks under the Windows command shell's quoting and puts the whole program into a command line. A fixed `node -e` command copies it byte for byte out of the plugin's copy of the skill: review 1 made it `.cjs`, and security finding 6 replaced the session's retyping with the copy. It stays one fixed program on every platform. The staging path is read as the program's first argument."

**R2. "Resolved" overstates, and two facts that follow are missing.**
- **Line 278, current:** "…its block is resolved by the owner's answers of 2026-10-02 (execution record, "For the human")"
  **Proposed:** "…its block is answered by the owner's decision of 2026-10-02, carried out in slice 5; until then the high finding stands in this slice's bytes (execution record, "For the human")"
- **Line 440:** change "**The block is resolved by the owner's decision.**" to "**The block is answered by the owner's decision.**" At the end of the paragraph, add: "Until slice 5 lands, the high finding is still true of this slice's bytes: the skill launches `citation-validator`, which holds `Read`, and the brief's limit is only an instruction. Two facts follow. A push made before slice 5 lands ships `/ctoc:deepthink` in that state to every installation. And nothing on disk yet holds slice 3 behind slice 5: slice 5 has no plan file, slice 3's only dependency is this slice, and the build queue counts a dependency that is in review as satisfied (`SATISFYING_STAGES` in `src/lib/continuation-queue.js`), so slice 3 becomes buildable the moment this slice enters review."
- **Line 506, current:** "The security scan's block is resolved by this decision carried out in slice 5."
  **Proposed:** "The security scan's block is answered by this decision; the finding itself closes only when slice 5 lands."

**R3. Three statements describe the earlier program without saying so.**
- **Line 390:** the heading "### The fixed program's two refusals" becomes "### The fixed program's two refusals (on the first program, before the return; checks 14 to 16 now run the current one)". Its output lines show the old wording and unquoted addresses.
- **Line 403, current:** "The fixed program makes one request per paper and no repeated work."
  **Proposed:** "The fixed program makes one request per paper, plus one per redirect hop (at most five) with a name lookup before each, and no repeated work."
- **Line 274, current:** "not applicable: one request per paper"
  **Proposed:** "not applicable: one request per paper, plus at most five redirect hops"

## Outside this slice's files: the session must handle these before or with the move to review

**O1. Nothing enforces "slice 5 before slice 3".** Verified by reading:
- No slice 5 file exists anywhere under `plans/`.
- `plans/todo/00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds.md` line 7 has `depends_on: 00398-deepthink-ships-with-ctoc-s2-deepthink-skill-and-counts` only.
- `nextBuildable` treats a dependency in `review/` as satisfied (`src/lib/continuation-queue.js` line 418).
- Making slice 3 depend on slice 5 means editing the frontmatter of an approved plan. That trips the approval check and needs your fresh approval. Which way to hold slice 3 is your decision. The technical fact is that today nothing holds it.

**O2. Your answered question is still shown to you as open.** `.ctoc/inbox/questions/1790877923785-g7rtsc.md` line 6 reads `status: open`, so the inbox lists it again. Following the existing answered example (`1790779151941-1s4114.md`):
- Set `status: answered`.
- Append "## Answer" with: "Answered by the human on 2026-10-02: ship `skills/deepthink/fetch-papers.cjs` as a plugin file, in slice 5 of deepthink-ships-with-ctoc."

**O3. Your decision exists only in this slice's record.** The parent plan, `plans/implementation/deepthink-ships-with-ctoc.md` line 215, still reads "A new agent: none. The existing `citation-validator` does the reading…". Slice 5 and the parent's record of your answers need the planner, starting from the functional stage.

## The seven checks, from disk

1. **Review items 1–14:** all fourteen are closed in the bytes, each pinned where the review proposed. Item 13 ("six") is corrected at plan line 330. Two things are not done: decision 13 (R1), and the optional local-date command, which is recorded as not applied because the plan prescribes the command.
2. **Scan findings 2–12:** closed in scope, with M2 as the exception (the time limit is per hop). Findings 1 and 13 went to you, with your answers. The scope-growth request is filed with all seven fields, but is still open (O2).
3. **The test that runs the program:**
   - It copies the program with the skill's own `node -e` line and checks the copy equals the `js` block byte for byte.
   - It runs under `{"type":"module"}`, with a preload that replaces both `fetch` and the name lookup, an argument array, `maxBuffer` set to 16 mebibytes, and time limits.
   - It asserts every refusal, the boundary at 51,200 and 51,201 bytes, that the plain `http` hop and both internal addresses are never requested, the size cap, the index heading, row, escaping and control bytes, and that the staging file is removed (and kept on refusal).
   - The gaps are S1 and M2.
   - The copy command contains no `$`, backtick or `"`, so taking off the shell's double quotes, as the test does, gives the same program a shell would run.
4. **The skill's prose against the parent:** it follows every parent decision. Your new decision is recorded (decision 27) and not silently applied: no new agent was added.
5. **Frontmatter, words and counts:**
   - The frontmatter is exactly as the plan prescribes.
   - No gate number appears, and no abbreviation outside backticks.
   - The counts read 430, 102 and 328 on README lines 12, 16, 727, 986, 990 and 1138, and CLAUDE.md line 703. Line 727's breakdown sums to 430.
   - The three `/ctoc:deepthink` sentences are on README lines 59, 615 and 980.
6. **The execution record:**
   - The return count is right: one return, to Step 8.
   - A failing run is recorded before each fix, except the `error 23` fix (S1).
   - Superseded statements are only partly rewritten (R1, R3).
   - "For the human" lists the options flat, with your answers.
7. **What I would not let into review:** M1 and M2.

## Not verified by me

- Both fingerprints and the 22 / 0 / 0 and 12,058 runs: I had no hashing or run tool.
- The shell tool's two-minute default (S2) is what I believe, not something I checked.

```json
{"scores":{"completeness":4,"clarity":4,"edgeCases":3,"efficiency":5,"security":4}}
```

Files:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js
- <home>/Code/ctoc/plans/in-progress/00398-deepthink-ships-with-ctoc-s2-deepthink-skill-and-counts.md
- <home>/Code/ctoc/plans/todo/00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds.md
- <home>/Code/ctoc/plans/implementation/deepthink-ships-with-ctoc.md
- <home>/Code/ctoc/src/lib/continuation-queue.js
- <home>/Code/ctoc/.ctoc/inbox/questions/1790877923785-g7rtsc.md
