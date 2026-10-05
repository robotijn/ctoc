**Verdict: kick back** to the build step, for one file: `<home>/Code/ctoc/agents/saas/legal-scaffold.md`. Four lines there still order or assert a live web check the agent can no longer make. The other ten agents and both test files pass review.

I hold only Read and Grep, so I ran nothing. The test, lint, typecheck and coverage results are the executor's record; the list sizes below I counted by reading the files.

## Blocker: `legal-scaffold` still orders a web lookup it cannot make

Dropping WebFetch left four lines contradicting the new dates paragraph (line 26: "do not look it up … return `needs-input`"). With no web tool and a mandatory timestamp field, the likely outcome is an invented "verified at" time or a date stated from memory, which is the failure this agent exists to catch. The plan's decision that `legal-scaffold` keeps Write and drops WebFetch left these four lines for the review to judge. Each old string occurs once.

| Line | Old | New |
|---|---|---|
| 42 | `and resolve each against the primary source at finding time, because` | ``and have each resolved against the primary source at finding time, through the `needs-input` route above, because`` |
| 133 | `date_verified_at: "<timestamp of the live check — re-resolve, do not trust a stored date>"` | `date_verified_at: "<when the routed web check was made, taken from the answer in your brief — never a stored date, never a time of your own>"` |
| 179 | `- "Regulatory dates move — every date in a finding is re-resolved live and stamped, not recalled"` | `- "Regulatory dates move — this agent reads no web page; every date in a finding was checked live by a routed web lookup and stamped, not recalled"` |
| 214 | `Re-resolve against the primary source and stamp when you checked.` | ``Have it re-resolved against the primary source through the `needs-input` route above, and stamp when it was checked.`` |

Line 26 itself is untouched, so the pinned web-answer sentence still holds. After the edit, re-run both tool-grant test files and `npm test`, and record the new sha256.

Two small untruths to fix in the same pass (not blocking on their own):
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js` lines 435–437: the comment says all the software-as-a-service agents' Write and Edit are "held for slice 11". `legal-scaffold`'s are not held; it writes. Suggested: "Ten of the software-as-a-service agents hold Write and Edit beside Grep until slice 11, and legal-scaffold writes its drafts; none of them writes a plan: …".
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s4-saas.md` line 157: "`legal-scaffold` is not built" is now false. Append "; later built under the CTO Chief's decision, see the last three bullets".

## Findings about this slice's goal (not blocking)

1. **The owner approved the opposite separation.** He approved "lose Write, keep WebFetch"; what is built is "keep Write, gain Edit, lose WebFetch", with the approved description rewording not applied. The executor wrote that the choice "is the owner's to choose" (plan line 142); the CTO Chief chose. Both satisfy the safety floor and it follows the slice 3 pattern, but it must be named to him plainly when the slice goes for his final approval.
2. **The far end of the lookup route is written nowhere the CTO Chief reads.** `<home>/Code/ctoc/agents/coordinator/cto-chief.md` does not contain the word "deepthink". `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md` lines 30–35 answers any launch without a deepthink brief with one failure line. This is the same state as the `product-owner` route from slice 2, and the file is outside this slice. Once the four lines are fixed, a broken route produces a question, not a wrong date.

## The five checks

1. **Matches the plan or a recorded decision: yes.** Ten tools lines, four descriptions (dispatch phrases unchanged), eleven search sections directly before the honest-status heading, and every test edit trace to the plan or to its recorded decisions.
2. **`legal-scaffold`:** line 26 is true; `deepthink-researcher` holds exactly WebSearch and WebFetch. The description ("Generate …") is true: the method file orders the drafts and the agent holds Write and Edit. Lines 42, 133, 179 and 214 are the blocker above.
3. **No order asks for a missing tool** in the ten, which only gained tools. `vercel-deploy` lines 30 and 205 still order a documentation check it has no tool for; the approved plan text leaves that to slice 11. `legal-scaffold` lines 42 and 214 do ask for one.
4. **Limits match in both files, none raised:**

   | Limit | Before | Now |
   |---|---|---|
   | Debt | 109 | 98 |
   | Write-without-Edit | 13 | 11 |
   | Safety-floor exceptions | 4 | 3 |
   | Excused tools | 4 | 3 |
   | Safety-sentence debt | 12 | 9 |
   | Held removals | 48 | 48 (Bash 21, Write 13, Edit 13, Task 1) |

5. **No personal information** in any line of the diff or in the plan.

## Final-review judgement

Not ready. Besides the blocker, the security scan has not run, and the verify and document steps are unticked and must run on the final bytes.

## Backlog

- `<home>/Code/ctoc/plans/todo/agent-tool-grants.md` lines 33, 84, 108 and 348 still say `legal-scaffold` drops Write and keeps WebFetch.
- `legal-scaffold` line 22 says "a watcher and not a generator"; its description, method file and test profile say it generates. This predates the slice.
- `legal-scaffold`'s mandatory output format has no place for a `needs-input` return, and unlike `product-owner` it has no status file.
- `legal-scaffold` line 42 calls 2 August 2026 its "most imminent" trigger; that date has passed.
- `tests/agent-tool-grants.test.js` test 7.11 still requires "at least 9" agents bound by the safety-sentence rule; 20 are bound now.
- `tests/agent-tool-grants.test.js` lines 167–169: the `vercel-deploy` comment says "held Write and Bash"; it is now Write, Edit and Bash.
- The shared safety sentence still says "into a plan" (already carried from slice 3).
- Seven method files open in a builder's voice and list Write in their own tools line (the executor flagged this in the plan); the owner should see it before slice 11.
- `tests/agent-model-floor.test.js` line 280 says `legal-scaffold` is scheduled for demotion to a skill, which bears on how much more work the file deserves.
