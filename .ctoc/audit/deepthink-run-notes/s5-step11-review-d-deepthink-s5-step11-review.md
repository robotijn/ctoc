# deepthink slice 5 — Step 11 REVIEW — iron-loop-critic report (verbatim)

Dispatch d-deepthink-s5-step11-review, received 2026-10-02 10:47 CEST. Verdict: KICKBACK to Step 8 (two medium: the local-file source case broken by the switch; the cut-off-run rerun never triggered by the skill; three low; one parent-plan record edit). Saved by the session without edits.

---

**Verdict: send it back to Step 8 (write the tests first).** I found two defects that would ship, both in `skills/deepthink/SKILL.md`, which this slice already declares. Each needs a pinned test first, then a text edit at Step 10. Three smaller items fit into the same pass. Everything else you asked me to check holds.

## Findings

### Finding 1 — medium. Switching the reader broke the "local file" case of a source to mine
The skill tells the session to paste a file's path into the brief. Its own new rule forbids exactly that, and the new agent could not open the path anyway.

- **Line 31:** a source can be "a file the user downloaded".
- **Line 120:** `> user's words plus the exact path, identifier or link>.`
- **Line 58 (new):** the brief carries "never … a home-directory path".
- **Lines 124–125:** "For a source to mine, read the source itself completely first."

A downloaded paper normally sits in the home folder, so the session has to break one rule or the other. Even if it passes the path, the agent holds no tool that can open it (agent line 39). Before this slice, `citation-validator` held `Read`, so this case worked; the switch is what broke it.

Proposed fix (to be recorded as a decision taken under ambiguity). The session never opens the file: it is untrusted, the session holds a shell, and the skill already says a downloaded file "is never opened as text".
- Line 120 becomes: `> user's words plus the exact identifier or link; for a file on the owner's machine, its file name only>.`
- Insert after line 120: `> A source given by its file name alone is a file on the owner's machine that you cannot open: find and read its public copy, and say under Failures when you found none.`
- Insert after line 33: `   For a file on this machine, the session never opens it and never puts its folder in the brief: the brief carries the user's words and the file's name, the reading agent mines the public copy it finds, and a document with no public copy cannot be mined.`
- Tests: add the two new lines to `WEB_IS_DATA_SENTENCES` (check 5), and to check 4 add `assert.equal(text.includes('exact path'), false, ...)`.
- For the owner: under his ruling, a private document with no public copy can no longer be researched.

### Finding 2 — medium. The cut-off-run fix works in the program but the skill never triggers it
The plan says (plan line 348): "the skill relaunches a failed run once with the same slug and the same paper list, and on that rerun every paper the cut-off run kept is already in the library". The skill does neither.

- **The relaunch rule (line 221)** fires only when the returned text lacks its closing line, or the brief is missing, still says `in progress`, or is under two kilobytes. A program cut off by the shell time limit causes none of these.
- **Even when a relaunch happens,** it starts "again from recording the run", so a fresh reading agent produces a new paper list, not the same one.
- **Line 201** then marks every unprinted paper not fetched and never reruns the program.

So in practice the kept files still get no index row. Check 21 proves only the program's behaviour, with a hand-made second list. Line 211 overclaims: `A run cut off before its end writes no block; the next run on the same item lists the papers the cut-off run kept, because they are then already in the library.`

Proposed fix:
- Insert before line 201 (which stays as it is; it is pinned): `When the program stops before printing \`papers in the list:\`, its staging file is still in place: run the same command once more, and take the papers' lines from both runs; every paper the first run kept is then already in the library and gets its row in the index. The rule below applies when the second run stops too.`
- Line 211 becomes: `A run cut off before its end writes no block; the second run the papers section orders, on the same staging file, lists the papers the cut-off run kept, because they are then already in the library. A paper kept by a run whose second run also stops has no row until a later run cites it.`
- Tests:
  - Pin the new sentence in check 6.
  - Tighten check 21 so it reruns the staging file the cut-off run left behind, without rewriting it. Today the second run uses `writeStaging(dir, 'cut-off', [first])`. For the rerun, the stub's `/hang` should answer 404, switched by an environment variable `runProgram` passes in. Then assert three things: the "already in the library" line for the first paper, `not fetched, status 404: "https://papers.example/hang"`, and `papers in the list: 2; kept: 0`.
- Also record in the plan that the premise at line 348 was corrected.

### Finding 3 — low; fold it into the same pass. Nobody tells the agent the file-name limits
The program refuses names longer than sixty characters and names with a dot, and adds `.pdf` itself. Neither the agent nor the brief says so.

- **Agent lines 85–86, current:** `I cite (title, authors, year, its \`https\` address, why it was read, a topic folder name` / `and a file name, each of lower-case letters, digits and single hyphens); then the web`
- **Proposed:** `… a topic folder name` / `and a file name without its \`.pdf\` ending, each of at most sixty lower-case letters, digits` / `and single hyphens); then the web`
- **Skill lines 132–133 (the brief):** change `or a new / one of lower-case letters, digits and single hyphens) and a file name of the same form.` to `… one of at most sixty lower-case letters, digits and single hyphens) and a file name of the same form, without the \`.pdf\` ending.`

This is a belief, not something I observed: a model asked for "a file name" for a paper often writes `name.pdf`. The program would then refuse every paper and the run would end with all papers marked not fetched.

### Finding 4 — low; fold it in. With the code gone, the prose leaves out some program behaviour
Line 203 says "this section states what it does". It does not state:
- the limit of five redirects;
- what counts as an internal address (a host name with no dot, the four local-only endings, a name that resolves to an internal address);
- that any answer other than a success status is refused;
- that a staging file outside `.ctoc/papers/`, with a bad slug, or unparseable is refused;
- the `stopped:` line and failure exit.

The rounds that critique the skill next read only the skill, so they cannot see any of this. Proposed fix:
- After line 190, add: `A redirect chain of more than five hops is not followed, and an internal address is this machine, a private, link-local, shared, benchmark, multicast or reserved network, a host name with no dot or ending in \`.local\`, \`.internal\`, \`.localhost\` or \`.home.arpa\`, or a name any of whose addresses is one of those; an answer other than a success status is not kept.`
- After line 200, add: `A staging file outside \`.ctoc/papers/\`, one whose slug breaks the name rule, or one that cannot be read as a paper list is refused the same way, and nothing is fetched; an unexpected failure prints \`stopped:\` with its error name and ends the program with a failure status.`

### Finding 5 — a record edit in the parent plan, needed before the critique rounds or the real run are dispatched
`plans/implementation/deepthink-ships-with-ctoc.md` line 78 records the reversal. Two neighbouring plans' approved texts still need a correction recorded where the dispatcher reads:
- `plans/todo/00400-…-s4-…md` line 29 says "the dispatching session launches `citation-validator`". Following that now breaks the skill's new rule ("launch no other agent in its place") and reopens the high security finding.
- That real run can pass only after the owner pushes, updates CTOC from the marketplace and restarts. Until then the agent type does not exist and `${CLAUDE_PLUGIN_ROOT}/skills/deepthink/fetch-papers.cjs` points at the old installed copy. The skill fails such a run loudly, as designed.

Proposed: append to line 78: `Read with slice 5, slices 3 and 4 name the wrong reader: the agent the skill launches is \`deepthink-researcher\` and the program is the plugin file \`skills/deepthink/fetch-papers.cjs\`; slice 4's "the dispatching session launches \`citation-validator\`" is superseded and must not be followed. Both new files reach a session only from the installed plugin, so slice 4's real run can pass only after the owner pushes, updates CTOC from the marketplace and restarts.`

The approved text below the parent's horizontal rule still reads "A new agent: none." (line 217). That is correct: line 24 says everything below the line stays exactly as approved.

## What I checked and found sound
1. **The agent.**
   - **Frontmatter** — the same keys as `citation-validator`, starting at byte zero:
     - `tools: WebSearch, WebFetch`, `model: opus`, `effort: xhigh`, `tier: 2`
     - `reports_to`, `dispatch_protocol: v1`, `max_subagents: 0`, `maxTurns: 80`
     - no `skills:` key, no `haiku`
   - **Description** — one line. It deliberately carries no "dispatch when" phrases ("Launched only by the deepthink skill"), which is right for an agent only the skill launches.
   - **Body:**
     - Page text is data (line 49), and an injected instruction is never quoted.
     - It ends with exactly `End of deepthink research: <slug>`, matching brief item 5.
     - The paper list carries every field the staging file needs.
     - The repository paths in the body (lines 30, 90, 106, 108, 116–117) are citations the fences require, never orders to open; lines 98–99 say it cannot open them.
   - **Launch name** — the `ctoc:ai-quality:<name>` pattern is confirmed by a real dispatch record (`s5-skill-round3-validate-…md` line 1).
2. **The skill:**
   - no `citation-validator` left;
   - "Read no local file" removed, and the outbound-channel rule kept;
   - the decisions log is pasted as an excerpt by the session;
   - the `${CLAUDE_PLUGIN_ROOT}` command line appears exactly once.
3. **`fetch-papers.cjs`.**
   - **All six changes are present:**
     - "already in the library" only with `existsSync(dest)` (line 207);
     - `listed` plus its `Set` of paths, used in all three places;
     - the ignore file, written only when absent;
     - file access through `safe-fs`;
     - the name rule, equivalent to `^[a-z0-9]+(-[a-z0-9]+)*$` (worked through by hand).
   - **Nothing from the hardened version regressed:**
     - redirects followed by hand, five hops at most;
     - every hop must be `https` and not internal;
     - one 60-second limit shared across hops;
     - the 100-mebibyte stream cap;
     - `wx` writes and `cell()` escaping;
     - the closing count line and `main().catch`.
4. **The watcher test change tightens the fence.**
   - Web-only agents must hold exactly `WebFetch, WebSearch` once sorted.
   - The mutation-tool loop still runs first.
   - `legacy` did not grow and `maxLegacy` is still 122.
   - Case 7 runs the rule on the real agent text with `Read` injected.
5. **The README pins** now come from `computeDocCounts`, cross-checked by the file's own independent walk. They cannot match on a missing or wrong number: `\b` and the literal prefixes stop "25" from matching "125".
6. **`.gitignore`.**
   - Line 50 is `.ctoc/papers/`, with nothing under `plans/`.
   - Check 22 asks `git` itself, both in this repository and in a fresh project.
   - It fails, rather than skips, if `git` is missing.
7. **The five recorded runs are honest.** I re-read the outputs in the session scratchpad:
   - the runs: 83/14, 80/17, 89/8, 22/6, 97/0;
   - the must-stay-green list: 821/8 after the first part, 829/0 at the end;
   - `npm test`: 12065 passed, 0 failed, 0 skipped; the gate printed `PASS`.

   The point a crash can resume from is recorded at plan line 666. Decisions 25–31 hold:
   - the three re-indented lines (205–209) sit at the right depth for the catch block;
   - `AbortSignal` lint is covered by the Node plugin's globals, as the executor's `--print-config` showed;
   - check 21's five-second cut-off has wide margin: the program's normal run took 62 milliseconds under full-suite load.

## For the security step (not part of this verdict)
The program checks for `.ctoc/papers/.gitignore` and then writes it without the `wx` flag, so the write follows a symbolic link. A broken link planted there would make the program create the link's target holding `*`. This is the same class as slice 2's accepted finding 12 (links inside `.ctoc/papers/` are followed).

**Risks:** I ran nothing (read-only). The test counts are the executor's, cross-checked against its saved output. Lint passing is the executor's claim; I did not re-run it. I did not compare the skill against the last commit, so "no other line changed" rests on the record and the pinned sentences. Whether `${CLAUDE_PLUGIN_ROOT}` is set in a skill's shell is still unverified, as the plan says.
