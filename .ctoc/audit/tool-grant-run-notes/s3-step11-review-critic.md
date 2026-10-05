**Verdict: kick back, to the CTO Chief for one decision.** The executor built the approved text faithfully, and all five of your checks pass. One fact in the approved plan is wrong, though. `experiment-designer`'s method file orders a file write, exactly the way `product-reviewer`'s does. So holding its Write and Edit as "unused" repeats the misreading the CTO Chief corrected for `product-reviewer`. It should be fixed before the final approval, as that correction was.

I had no shell tool, so I ran no tests. I counted the lists by reading them and compared the text by reading it.

## Your five checks

1. **Text matches the approved plan: pass.** The `stack-chooser` order, the `experiment-designer` description, the five tools lines and the search paragraph all match the plan's text. Both "Dispatch when" phrases are unchanged.
   - Two departures, both recorded: the safety sentence in all five search sections (plan decision 8), and one added sentence in `product-reviewer`'s description (plan decision 7).
   - **The added sentence "Writes the weekly review and its actions file." is true to the method file.**
     - `skills/product/product-reviewer/SKILL.md` line 213 is "Step 8: Write the review" (output at line 215).
     - Line 281 is "Also write `.ctoc/product-loop/actions/YYYY-MM-DD.yaml`".
     - The output contract at lines 298–299 names both paths.
     - The agent body hands "the review document itself" to that file (line 26) and orders "apply its process" (line 50).
   - The executor is also right that the index's decision 17 says nothing about descriptions: part (c), at `plans/todo/agent-tool-grants.md` line 459, covers tools only.
2. **Tools: pass.**
   - No new order needs a tool the agent lacks. The search sections need Grep, and all five now hold it. The `stack-chooser` order needs Read and Edit, and it holds both.
   - Write is used only to create new files. The review, the actions file, the key-performance-indicator plan and the experiment spec are all new, dated or slug-named files.
   - **`stack-chooser` cannot produce a second frontmatter block.** Its Edit inserts text inside the existing block. If its anchor line appears twice in the file, the Edit fails loudly rather than landing in the wrong place.
   - Editing that frontmatter does not undo the plan's earlier approval. `src/lib/approval-residency.js` lines 119–122 check that the approval record exists for plans in `implementation/`, without comparing a content hash.
3. **Limits: pass.**
   - Debt list: 109 entries (lines 243–351). Write-without-Edit list: 13. Safety-floor exceptions: 4 entries, excusing 4 tools.
   - Both test files carry 109, 13, 4 and 4. None was raised.
   - Held removals: still 50 tools on 27 agents (I summed the list), with the per-tool counts unchanged.
4. **Safety sentence: pass.** All five search sections hold it as its own paragraph. All five are listed in `AGENT_SENTENCES` (test lines 441–445).
   - Because all five have left the debt list, the section check at lines 714–719 now runs on the real files.
   - Fixture test 7.11 (lines 1185–1194) proves the check fails when the sentence is missing, sits outside the section, or sits inside code.
5. **Personal information: pass.** None in the diff or the plan.

## Findings, ranked

**1. `experiment-designer` writes a file, so holding its Write and Edit for removal is wrong (decision needed; kick-back reason).**
- `skills/product/experiment-designer/SKILL.md` line 293 is "Step 11: Write the experiment spec", with output `.ctoc/product-loop/experiments/<id>.yaml` (line 295).
- The agent body orders "Read that file in full and delegate the deep method to it" (line 26) and "apply its arithmetic and its process" (line 43).
- That is the same shape the CTO Chief found for `product-reviewer`. Under the owner's Write-and-Edit ruling, "An agent whose instructions order a write gets both". A write the method file orders is not a removal to hold.
- These statements are therefore false:
  - the plan's table row ("no write ordered", line 40);
  - the paragraph at line 45;
  - the security review ("unused Write and Edit pair", line 85);
  - the index's audit row at line 316.
- Plan decision 8 itself mentions "an experiment report" among what the product agents write.
- Nothing breaks at runtime today, because the agent keeps both tools. The next removal round would still be measuring a removal that should not be there.

If the CTO Chief agrees, the exact changes are:
- `tests/agent-tool-grants.test.js` line 133: change `'product/experiment-designer': reads,` to `readsWrites,`. Add a comment like the one at lines 134–135: "its method file orders a file write (Step 11: the experiment spec)".
- Same file, line 373: delete `'product/experiment-designer': ['Write', 'Edit'],`.
- Same file, line 393: change `MAX_HELD_REMOVALS` from 50 to 48.
- Same file, line 363 comment: change it to "48 tools on 26 agents: Bash 21, Write 13, Edit 13, Task 1."
- `tests/agent-tool-grants-maxima.test.js` line 54: change `MAX_HELD_REMOVALS` to 48.
- Same file, line 56: change `HELD_PER_TOOL` to Write 13 and Edit 13.
- `agents/product/experiment-designer.md` line 3: for parity with `product-reviewer`, add "Writes the experiment spec." before "Dispatch when". This changes wording the owner approved, so name it to him at the final approval.
- The plan: correct line 40, line 45, line 85 and decision 4 to cite the method file's Step 11. Record the CTO Chief's call as a new decision. Record the index row correction in the index's decisions, the way decision 19 does, because the index text is approval-protected.
- I did not read the method files of the other agents whose Write is held. The same misreading may recur there.

**2. The safety sentence does not cover what the two product agents write (recommended).**
- It says "never copy … into a plan".
- `product-reviewer` writes `.ctoc/product-loop/reviews/` and `actions/` files. `experiment-designer` writes `.ctoc/product-loop/experiments/` files.
- An agent following the words literally is not barred from pasting a matched key into those files. Plan decision 8 saw this and chose one shared sentence.
- A fix inside this slice's files: add a second entry in `AGENT_SENTENCES` for each product agent, with matching body text. For example, for `product-reviewer`: "The same holds for the weekly review and its actions file: never copy a key, token or password into either — name the file and line instead." For `experiment-designer`, the same sentence about "the experiment spec".

**3. With WebFetch gone, `product-reviewer` can still reach the web through Bash (for the security scan).**
- Its method file still offers `# OR call PostHog API` (SKILL.md line 80) and still lists `tools: Read, Write, Bash, WebFetch` (line 28).
- A curl through Bash reaches the same web content this slice separated from Write and Bash. The test's own header (lines 46–48) says the safety floor cannot see network use through Bash.
- The fix inside this slice is one sentence in `agents/product/product-reviewer.md`: "Read the PostHog and Stripe exports handed to you; never call either service through Bash." Editing SKILL.md itself would need a request to widen the slice's files.

**4. A second `stack-chooser` run would duplicate frontmatter keys (low).**
- In `agents/planning/stack-chooser.md` line 81, a second run would add a second `tech_stack:` key to the same block. Strict YAML readers reject a repeated key.
- Suggested addition after "followed by the new keys.": "If the frontmatter already holds `tech_stack:` and `stack_decision_at:`, replace those lines instead of adding them again."
- This departs from the approved text, so it is the CTO Chief's call.

**5. The `stack-chooser` target file name matches no current plan (low; not changed by this slice).**
- `plans/implementation/<slug>-impl.md` follows a naming scheme only old plans use, such as `plans/done/A1-canvas-layer-impl.md`. Current plans are named `NNNNN-slug.md`.
- The old order would have created a stray file. The new Edit fails loudly instead, which is better. Fixing the name is a separate decision for the owner.

**6. `unit-economics-modeler` has no Edit order (low).**
- Its output section (line 120, "Output (added to canvas plan)") adds to an existing plan, the same shape as `stack-chooser`. But nothing tells it to use Edit rather than rewrite the canvas plan with Write.
- A parity sentence would close it: "Add the `unit_economics:` block to the existing canvas plan with `Edit` after a fresh `Read`; never rewrite the plan with `Write`."

**7. Two small record fixes (low).**
- Plan decision 5 ends "the reworded text claims no write either way". That is no longer true of the built text, so add "superseded by decision 7".
- The test comment at lines 427–428 states a rule no check enforces: every agent that gains Grep and holds Write carries the sentence. Also, test 7.11 hard-codes its list of agents (lines 1185–1189). Deriving that list from `AGENT_SENTENCES` would let a later slice's agents be covered automatically.

**Not checked:** I did not run the test suite, lint or type checking. I relied on the executor's recorded runs, which show 20 of 20 and 5 of 5 passing, 0 skipped, and the full suite green.

Files:
- <home>/Code/ctoc/plans/in-progress/agent-tool-grants-s3-planning-and-product.md
- <home>/Code/ctoc/agents/product/experiment-designer.md
- <home>/Code/ctoc/agents/product/product-reviewer.md
- <home>/Code/ctoc/agents/planning/stack-chooser.md
- <home>/Code/ctoc/agents/planning/unit-economics-modeler.md
- <home>/Code/ctoc/skills/product/experiment-designer/SKILL.md
- <home>/Code/ctoc/skills/product/product-reviewer/SKILL.md
- <home>/Code/ctoc/tests/agent-tool-grants.test.js
- <home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js
- <home>/Code/ctoc/plans/todo/agent-tool-grants.md
