**Verdict: send it back to Step 10 (IMPLEMENT), then run Step 14 again.** The test is well built, its debt lists add up, and the count drift is recorded honestly. But it has one fail-open path in the safety floor. It also gives the owner's "no exceptions" ruling an exception, and it doesn't yet reflect the two CTO Chief decisions. Separately, one profile (`product-reviewer`) misreads its agent. The owner's approval to remove that agent's Write rests on that misreading, so it needs a new owner question before slice 3.

**What I checked:**
- **Read this session:** the whole test file; all 125 `tools:` lines; the plan, the index and the build report; and the bodies or method files of 25 agents (list below).
- **Traced by hand:** every fixture assertion, (a) to (l). All of them hold on the code as written.
- **Not run:** I ran nothing; this review is read-only.

## Answers to your six questions

1. **Does each check bite?**
   - Check 1 (census): yes, but it can't see an unreadable grant (finding 1).
   - Check 2 (profile integrity): it bites when you read the code, but no fixture or run shows it.
   - Check 3 (the grant): yes, but today it only covers 7 agents (finding 4).
   - Check 4 (debt shrinks): yes, through the "paid" rule. Its maximum is a cap, not a ratchet (finding 7).
   - Check 5 (safety floor): yes on readable grants. It is blind to unreadable grants and to other file-writing tools (findings 1 and 3).
   - Check 6 (one `product-owner`): the first two assertions bite; the third is vacuous (finding 8).
   - Check 7 (fixtures): all assertions hold.
   - Checks 8 (held removals) and 9 (Write and Edit together): yes, shown by run 3. Check 9 has the exception hole (finding 2).
2. **Is PROFILE faithful to the bodies?**
   - It is faithful to the index's audit table; the executor's comparison found only the two known differences.
   - Against the bodies, there is one clear miss (`product-reviewer`, finding 5), one ambiguous case (`legal-scaffold`, finding 12), and one entry written for a body that doesn't exist yet (`complexity-reducer`, finding 14).
   - An unstated convention covers boilerplate write orders in read-only agents (finding 13).
   - The rest of the sample matches.
   - **Agents sampled:** product-reviewer and legal-scaffold (each with its method file), gate-critic, database-reviewer, changelog-generator, ivv-chief, quality-gate, complexity-reducer, stack-chooser, security-scanner, quality-gate-runner, ai-code-quality-reviewer, iron-loop-critic, agent-qa, synthesizer, vercel-deploy, dsar-handler, sbom-cra-checker, threat-modeler, health-check-validator, feature-store-validator, data-quality-checker, react-native-bridge-checker, agent-tester and incident-responder.
   - For the "no command" claims I searched for shell blocks and read each hit. That is consistent with the claims, not proof of them.
3. **Do the debt lists only shrink, and does each slice clear its own?**
   - `DEBT`: I mapped every name to its slice. The per-slice counts are 4, 5, 11, 9, 14, 12, 17, 21 and 25, which sum to 118.
   - `WRITE_EDIT_DEBT`: it is exactly the 22 agents that hold Write without Edit, checked against all 125 tools lines.
   - `HELD_REMOVALS`: 49 tools (Bash 20, Write 14, Edit 14, Task 1).
   - All ten later slices declare the test file in `files:`.
   - "Only shrinks" is enforced as a cap, not a ratchet (finding 7).
4. **Is the count drift recorded honestly?**
   - Yes. Plan decisions 11 and 12 and index decision 16 record 21 → 22 (gate-critic was missed in the hand count) and 44 → 49, and they name the stale acceptance criterion.
   - The text that still says 44, 9 or 15 sits in approval-protected sections and has to be listed in the report you read before calling it done (findings 10 and 11).
5. **Do the CLAUDE.md and README counts match?**
   - `CLAUDE.md:321`, `CLAUDE.md:704` and `README.md:1143` all read 546, and no "545" is left in CLAUDE.md, README.md or `docs/*.md`.
   - That disk holds 546 test files is believed, not verified: it rests on the executor's green run of `doc-counts` and `readme-numbers`.
   - My own search found 535, and I could not explain the gap of 11 read-only.
   - The session should confirm with `node -e "console.log(require('fs').readdirSync('tests').filter(f=>f.endsWith('.test.js')).length)"`.
6. **Gaps for Steps 13–16:** see the end.

## Findings

**1. High — the safety floor and check 9 fail open when a grant can't be read.**
- **Where:** `tests/agent-tool-grants.test.js:451-455`. `toolsOf` returns `[]` for an unreadable grant, and checks 5 (:584), 8 (:660) and 9 (:671) use it.
- **Why it matters:**
  - The comment at :451 says "check 3 names why", but check 3 skips all 118 agents in debt (:571).
  - Delete the `tools:` line of, say, `agents/quality/code-reviewer.md` and all nine checks stay green.
  - Meanwhile Claude Code gives that agent every tool, web and write included: "Inherits every tool available to subagents if omitted", as quoted at `agents/ai-quality/ai-code-quality-reviewer.md:54` (believed).
  - The same happens with a second tools line, a list item written at column 0, or a closing `--- ` with a trailing space.
  - This is the "verdict on input never received" pattern the repository fences.
- **Fix:** in check 1, after :542, add the code below, and change the comment at :451 to "(check 1 fails on it, debt or not)". All 125 agents have exactly one tools line today, so this should pass.
  ```js
  const unreadable = all.filter((a) => { const p = splitAgent(a.text); return !p || Boolean(grantOf(p.fm).error); }).map((a) => a.key);
  assert.deepEqual(unreadable, [], `agents with no readable grant (a missing tools line gives every tool, web and write included): ${unreadable.join(', ')}`);
  ```

**2. Medium — `editsOnly` is an exception the owner ruled out.**
- **Where:** :415, :551, :643, :646. It lets an agent hold Edit without Write. No agent uses it, and the ruling is "granted together and removed together", with no exceptions.
- **Fix:**
  - Change :415 to `if (tools.includes('Edit') && !tools.includes('Write')) out.push(\`${key}: holds Edit without Write; the two are granted together\`);`
  - Delete :551 and :646, and remove the `editsOnly` clause from the comment at :643.

**3. Medium — the safety floor's list of write tools is too narrow.**
- **Where:** :174 `MUTATING = ['Write','Edit','Bash']`. An agent in debt that holds WebFetch plus MultiEdit or NotebookEdit passes every check.
- **Fix:**
  - Change :174 to `['Write','Edit','MultiEdit','NotebookEdit','Bash']`.
  - In `breaksFloor` (:514), compare `t.replace(/\(.*\)$/, '')` so that a scoped `Bash(...)` entry also counts (believed to be legal in a tools line).
  - Add fixture (h): `assert.equal(breaksFloor(['Read','WebFetch','NotebookEdit']), true);`
  - No agent holds these tools today, so this passes.

**4. Medium — debt suspends the "holds a tool its orders don't need" failure for 112 agents.**
- **Where:** :570-573.
- **Why it matters:**
  - While slices 2–10 are being built, a reviewer in debt can gain Write and Edit, Bash, or Task, and nothing fails. Check 9 only checks the pairing, and check 5 only looks at web tools.
  - This window overlaps the "improved three times" run, which is editing these same files.
  - I compared all 118 debt agents' tools lines with their profiles: the only unneeded tools held today belong to the six safety-floor exceptions.
- **Fix:** replace the check 3 body with the code below.
  ```js
  const failures = all.flatMap((a) => {
    const f = failuresFor(a.key, a.text, PROFILE[a.key] || {}, HELD_REMOVALS[a.key]);
    if (!DEBT.has(a.key)) return f;
    if (a.key in RULE6_EXCEPTIONS) return [];
    return f.filter((m) => m.endsWith(', which its orders do not need'));
  });
  ```
  This narrows what the plan suspends (plan :59). It only tightens the test, so record it as decision 15.

**5. High (upstream) — `product-reviewer`'s profile misreads its orders.**
- **Where:** PROFILE :101 says `reads`, and its exception reason at :187 says "its body orders no fetch, no write and no command".
- **What the agent actually orders:**
  - Its body (`agents/product/product-reviewer.md:50`) says to read its method file "in full and apply its process".
  - That process orders two writes: Step 8, "Write the review — Output: `.ctoc/product-loop/reviews/YYYY-MM-DD.md`" (`skills/product/product-reviewer/SKILL.md:213-215`), and "Also write `.ctoc/product-loop/actions/YYYY-MM-DD.yaml`" (:281).
  - Its output contract returns both paths (:298-299).
  - The index's own reading rule (index :60) counts the method file.
- **Impact:** slice 3 (:19, :35) removes its Write, which would leave the weekly review unable to save itself. The owner approved that removal on the wrong reading.
- **Fix here:** change the reason string at :187 to "holds WebFetch with Write and Bash; its body orders no fetch; its method file orders two file writes (Step 8), so which tool goes is back with the owner". Leave PROFILE alone for now; the agent is in debt, so no check reads it.
- **Owner question, with my recommendation:** drop WebFetch only, which alone clears the safety floor. Keep Write and add Edit. Hold Bash in slice 11 for measurement. That makes the profile `readsWrites`, puts `['Bash']` in `HELD_REMOVALS` (50 tools), and has slice 3 grant Edit. Slice 3 should not go for build approval before he answers.

**6. Medium — the two CTO Chief decisions appear nowhere.**
- **Stale comments:** :361 (gate-critic: "question 4 kept its grant unchanged") and :362-363, :372, :376-377 ("no slice yet") contradict them. Plan :564 still says the gate critics keep their grants.
- **Fix the comments:**
  - gate-critic: "gains Edit (owner's Write-and-Edit ruling, CTO Chief 2026-10-05); no slice declares its file yet".
  - clm-obligations, dsar-handler and cra-incident-clocks: "slice 8 grants Edit; the Write and Edit pair stays held for slice 11".
  - experiment-designer: slice 3. vercel-deploy: slice 4.
- **Record them:** add decisions 13 and 14 to the slice plan, and decision 17 to the index. Decision 17 should carry the new counts: Edit gains go from 15 to 21, held Edit from 9 to 14, and agents whose grant changes in slices 2–10 from 76 to 79.
- **Upstream:**
  - No slice owns `agents/iron-loop/gate-critic.md`; slice 7's `files:` (s7 :9-11) is the natural home.
  - All of slices 2–11 sit in `plans/implementation/` with no `approved_by`. So these are plain plan edits made before their build approval.
  - The build report's statement that slices 3, 4 and 8 "were approved" (`s1-steps-8-14-executor.md:47`) is wrong.

**7. Low — the maximums cap the lists but don't ratchet.** At :576, :591, :655 and :678, `<=` leaves room to re-add an entry by editing one place if a slice forgets to lower the maximum. **Fix:** use `assert.equal(<size>, <MAX>)` in all four.

**8. Low — check 6's third assertion is vacuous now and redundant later.** At :598-600, `product-owner` is in debt today, so the filtered set is empty; once it leaves debt, check 3 already covers it. **Fix:** delete those three lines.

**9. Low — fixture (f) claims something it doesn't assert.** The comment at :625 says "the real one passes", but nothing asserts it. **Fix:** add a passing case that quotes `` `Glob, Grep, Read` ``.

**10. Low — decision 10 (plan :611) says "the specification above is changed in three places".**
- The specification text is approval-protected and unchanged, and there are more than three departures.
- **Fix:** reword it to "the built test departs from the specification in:" and list them:
  - `expectedTools`;
  - check 3 and check 8 skipping Edit;
  - check 9 and `WRITE_EDIT_DEBT`;
  - Edit added to five held entries (49 tools);
  - fixtures (a), (k) and (l);
  - `editsOnly`, and its removal (finding 2).
- Note that acceptance criterion 1 (:593) still says 44.

**11. Low — slice 11 still plans 44 removals.** At s11 :51, :112, :184 and :211, it should be amended to 49 rows, with Write and Edit landing together.

**12. Low — `legal-scaffold` contradicts itself.** Its body at :24 says "you produce drafts", and its method file (:161-178) orders "produce drafts to `public/legal/`". Its body at :22 says "a watcher and not a generator". **Fix:** slice 4 rewords :24 so no write order remains.

**13. Low — a shared line is an unexecutable write order in read-only agents.** "Make a documented choice in the plan's Decisions section" appears in `iron-loop-critic.md:23`, `agent-qa.md:21`, agent-tester and agent-critic. The profiles silently treat it as not an order. **Fix:** state that reading in the index, or reword the line to "report the choice in your output".

**14. Informational — `complexity-reducer`'s profile describes its body after slice 9 (index decision 6).** Today :385 orders a write. **Fix:** add a comment at PROFILE :106 saying so.

## Steps 13–16: what is missing

- **Step 9 is still open.** The citation-validator check of Meta's "Agents Rule of Two" and the reading of Claude Code's documentation on AskUserQuestion are both still owed. The AskUserQuestion answer decides whether the five `asks: true` profiles grant a tool a dispatched agent can actually use, so it is needed before Step 16.
- **Step 13:** dispatch security-scanner on the test file, with findings 1, 3 and 4 named in its brief.
- **Step 14:** run `node --test tests/agent-tool-grants.test.js`, then `npm test`. In a scratch copy, add three new bite checks:
  - delete code-reviewer's tools line → check 1 names it;
  - add Bash to code-reviewer → check 3 names it;
  - add `WebFetch, NotebookEdit` to an agent in debt → check 5 names it.
- **Step 15:** add decisions 13–15 and index decision 17, and rewrite decision 10.
- **Step 16:** the final review, then `menu task complete t126`. The report you read before calling it done must list every protected place that still says 44, 9 or 15:
  - index :39, :84-92, :167 and :177;
  - plan :265, :294 and :593;
  - slice 11.

**Scores:** `{"completeness":3,"clarity":4,"edgeCases":2,"efficiency":4,"security":3}`

**Risk:**
- The count of 546 on disk is unverified, and so is the Claude Code behaviour where a missing tools line inherits every tool.
- Findings 1, 3 and 4 are believed to pass on today's files, because I checked them against all 125 tools lines. They are unproven until Step 14 runs them.
- If the owner keeps the `product-reviewer` removal as it is, slice 3 needs a decision about where the weekly review gets written.
