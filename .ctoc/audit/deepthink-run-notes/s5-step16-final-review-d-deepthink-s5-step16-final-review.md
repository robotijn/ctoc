# deepthink slice 5 — Step 16 FINAL-REVIEW — iron-loop-critic report (verbatim)

Dispatch d-deepthink-s5-step16-final-review, received 2026-10-02 11:12 CEST. Verdict: READY (three record edits; four optional items). Saved by the session without edits.

---

**Verdict: READY.** No build step needs to reopen. Before the plan moves to review, the session should make three record edits. Findings 1 to 3 below give each one, and none of them touches code, a test or the gate. Findings 4 to 7 are optional. I ran nothing because I hold no shell. Fingerprints and test counts are the session's and the executor's. Paths are relative to the repository root. I left the home folder out because this report is saved word for word into the audit notes, which is the exposure security scan finding 6 is about.

## Record edits to make (none blocks this slice)

**Finding 1 — slice 4 (the real run) will hit the new "do not run a command that still holds `${`" rule; slice 3 (the improvement rounds) cannot see the program it critiques.**

Slice 4 does not run the installed skill. Its approved text (`plans/todo/00400-…-s4-…md` line 29) has its build session read `skills/deepthink/SKILL.md` from the repository and follow it step by step. The text read from disk carries `${CLAUDE_PLUGIN_ROOT}` unfilled in both commands (skill lines 75 and 186). The rules slice 5 added at lines 79 and 190 say not to run such a command. A session that follows the text literally therefore launches nothing at step 2.

Separately, the slice 5 plan (line 375) says slice 3's critics "see the code only if they are pointed at the file". Nothing points them at it. A reworded sentence about the program that is not pinned by a test could then drift from the code unseen.

- File: `plans/implementation/deepthink-ships-with-ctoc.md`, line 78.
- Current ending: `…so slice 4's real run can pass only after the owner pushes, updates CTOC from the marketplace and restarts.`
- Append: `Slice 4 reads the skill from this repository, where its two commands carry \`${CLAUDE_PLUGIN_ROOT}\` unfilled, and the skill forbids running a command that still holds \`${\`; so before running each command, slice 4's build replaces \`${CLAUDE_PLUGIN_ROOT}\` with the installed plugin's root, never with this repository's path, so the run exercises the shipped program and its relative path to \`src/lib/safe-fs.js\`. Slice 3's rounds read \`skills/deepthink/fetch-papers.cjs\` beside the skill, read-only, so a reworded sentence about the program is checked against the code; a finding in the program goes to the owner's list as \`out-of-scope-file\`.`

**Finding 2 — decision 38 overstates.** The run-level link check (`fetch-papers.cjs` lines 194–200) sits outside any `try`, so an unreadable path does reach `main().catch` and prints `stopped:` (lines 292–295). The per-paper topic-folder check (lines 254–257) sits inside the per-paper `try`. Its catch (lines 279–284) prints `not fetched, error <code>` and the run carries on. Both cases fail closed, but only one of them stops the program.

- Plan line 560, current: `38. **The symbolic-link check fails closed:** a path that cannot be looked at for any reason but "does not exist" stops the program with \`stopped:\` rather than being treated as no link.`
- Proposed: `38. **The symbolic-link check fails closed:** for \`.ctoc\`, the library, the index and the ignore file, a path that cannot be looked at for any reason but "does not exist" stops the program with \`stopped:\` rather than being treated as no link; for a paper's topic folder, the same failure reports that paper as \`not fetched, error <code>\` and writes nothing for it.`

**Finding 3 — decision 35's reason does not match the order in the code.** `hasCredentials` runs at line 246, before the "already in the library" check at line 259. So an entry with a user name or password is refused even when its file is already held, and it never reaches `list()` or the index. The removal inside `runBlock` (line 166) is a second guard that never fires today. One consequence goes unrecorded: the brief then marks a held file `[paper not fetched]`.

- Plan line 557, current: `…beyond the scan's proposal to print it without them; it is also indexed without them, because a paper already in the library would otherwise carry its address into the index.`
- Proposed: `…beyond the scan's proposal to print it without them. The refusal comes before the library check, so such an entry is refused even when its file is already in the library, never reaches the index, and is marked \`[paper not fetched]\` in the brief with the refusal as its reason; the index row's address still passes through the same removal, as a second guard.`

## Optional (low; none is a reason to hold the slice)

**Finding 4 — the cited web pages keep any user name and password in the index.** `fetch-papers.cjs` line 170 reads `` lines.push(`- ${cell(page && page.title)}: ${cell(page && page.url)}`); ``. The proposed form is `` lines.push(`- ${cell(page && page.title)}: ${cell(shownAddress(page && page.url))}`); `` plus one page carrying a user name and password in check 23. These pages are never requested and the index is ignored by version control, so this stays on the machine.

**Finding 5 — two behaviours have no test holding them.**
- One index row per file is claimed (plan line 435) but not asserted. After `tests/deepthink-ships-with-ctoc.test.js` line 854, add: `assert.equal(index.split('\n').filter((line) => line.includes('retrieval/kept-paper.pdf')).length, 1, 'a file listed twice in one run must have one index row');`
- Three of the five added version-six ranges (`64:ff9b:1::/48`, `2002::/16`, `fec0::/10`) have no test case.

**Finding 6 — the frontmatter checks can be bypassed by unusual key spelling.** I believe, but have not verified, that a frontmatter parser reads `memory : user` or `"memory": user` as the key `memory`. If so, both fences miss it: check 17's pattern at line 610 (`/^[A-Za-z_][A-Za-z0-9_-]*:/`) and the watcher's at line 228 (`/^memory:/m`). Sturdier patterns would be:
- `/^["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*:/` for the key list;
- `/^["']?memory["']?\s*:/m` for the memory key;
- `/^["']?tools["']?\s*:/` at lines 612 and 231.

Using these needs write access to the agent file, which only a covering plan gives.

**Finding 7 — the account name sits in two more places in the audit notes.** Besides line 65 of the executor's notes (scan finding 6), it appears at line 127 of the same file and in the scratchpad path at line 175 of the security scan report. Whatever the session decides on the open account-name question should cover all three.

## Your seven checks

1. **Review findings 1–5: closed as proposed.**
   - Finding 1: skill line 122 ends "its file name only"; the two inserted sentences are at lines 123 and 34; "exact path" is absent and refused by the check at test line 466; decision 32 is recorded with the owner's other option beside it.
   - Finding 2: the rerun paragraph is at line 209, directly before the pinned line 210, and line 220 is reworded. Check 21 (lines 921–945) reruns the same staging file, asserting it still exists first, with the never-answering address switched to 404. Decision 33 corrects the plan's premise.
   - Finding 3: the file-name limits are at agent lines 85–87 and skill lines 135–136.
   - Finding 4: the two prose sentences are at skill lines 195 and 206.
   - Finding 5: the parent bullet is word for word.
2. **Scan findings 1–5 and 7: closed in scope, and the credentials decision is sound.**
   - Check 17 asserts the exact key set and one `tools:` line.
   - The watcher's web-only branch is at lines 228–234.
   - The link checks use `lstatSync` from `src/lib/safe-fs.js`.
   - The ignore file is written with `wx`. Exclusive creation also refuses a link planted after the check.
   - The five ranges are at line 30.
   - Hidden characters are folded by `plain()`, used in `cell()` and in the printed address; the ranges are written as numbers.
   - The two `${` sentences are at lines 79 and 190.
   - Refusing an address with a user name or password before any request matches what WebFetch itself refuses, so both channels agree. The only leftover is the case in finding 3.
   - What is still open is the same as before and was already accepted with slice 2's scan finding 12: the index append at line 287 follows a link created after the check at line 194, which needs someone who can already write `.ctoc/papers/`.
3. **Decision 34 is acceptable; no failing variant needs recording.** The assertions are not vacuous by construction, which I worked out by reading, not by running:
   - The strings they look for, `memory:` and `exactly one "tools:" line`, appear only in the violation messages at watcher lines 229 and 233.
   - Without lines 228–234, both injected texts produce no violation at all. The first `tools:` line is exactly WebSearch and WebFetch, and no other rule names a key.

   So the passing run itself shows the new branch firing. Optionally, append to plan line 556: `They cannot pass without the rule: the strings they look for occur in no other message \`shapeViolations\` produces, and without the rule both injected texts produce no violation at all.`
4. **Nothing regressed.**
   - The agent's frontmatter matches the plan's block exactly. The skill's frontmatter is as pinned, with no `citation-validator` anywhere in its 269 displayed lines.
   - The README states 125 at lines 11, 16, 726, 942, 1061 and 1137, and 5 in the AI Quality row at line 959. CLAUDE.md line 702 states 125. `agents/ai-quality/` holds five definitions.
   - The baseline has the agent under `conforming`, with the legacy ceiling still 122.
   - `.gitignore` lines 49–50 and eslint config line 52 are as planned, with no disable comment in the program.
   - No gate number or invented abbreviation appears in the agent, the skill or "For the human".
5. **The record is honest and complete, apart from findings 2 and 3.**
   - One return, to the test step, and one in total.
   - The arithmetic agrees: 97 to 98 tests, 829 to 830, and 12,065 to 12,066 all add check 23. The failure counts per run match the checks named.
   - The guard checks are labelled as guards.
   - "For the human" puts both items flat, with gives and costs and no recommendation. "(applied in this slice)" states a fact; it is not a tilt.
6. **What slices 3 and 4 inherit.** Finding 1 is the only failure I can see now. Slice 3's own checks still name `citation-validator` as the validator, and that remains true.
7. **Nothing I would hold back from review.**

**Risk:** I did not recompute any fingerprint and did not re-run lint or tests. The claims about the plugin agent loader (the `memory:` key, a second `tools:` line) and about whether the plugin fills `${CLAUDE_PLUGIN_ROOT}` into skill text come from the scan's reading or my own belief, not from observation. Slice 4 is where they get observed. If the plugin root is not filled into skill text even when a person types the command, the new `${` rule makes every deepthink run stop at step 2, safely but completely.
