I wrote three plans, and every one of the five defects is in one of them. All three were finished before your two messages arrived, so there was nothing left to write and nothing new went to `plans/functional/`. They sit in `plans/implementation/` with no approval yet, so the `gate-destinations-approved` check, and `npm test` with it, will fail until you move them, as you said you would. I have not moved or deleted anything.

I could not run anything. Every claim in the plans was checked by reading the code and is labelled read, believed or to verify; the to-verify points are scheduled for each plan's Step 9.

**Paths written**
- `<home>/Code/ctoc/plans/implementation/a-quotation-is-not-a-file-claim.md`
- `<home>/Code/ctoc/plans/implementation/goal-titles-cannot-write-frontmatter-lines-into-a-stub.md`
- `<home>/Code/ctoc/plans/implementation/vision-file-names-and-planning-agent-orders.md`

**Quotations read as file claims** (2 files: `src/lib/plan-validator.js` and its test). A create or add verb that sits inside a balanced double-quoted or typographically quoted span is no longer read as a claim. The test is that verb's position in a quotation-only mask of the text. A claim with its verb outside any quotation still errors, including one whose path is in quotes. The failing test is the real tool-grants table row, copied byte for byte into the existing list of misread plan text, plus a run through `validateForReview`. The plan also writes its own sample inputs inside a fenced block: outside a fence, that checker would have refused this plan at review.

**Unescaped stub title** (2 files: `src/lib/vision-decomposer.js` and its test). Every value the stub writer puts into frontmatter or the heading is made a single line: title, dependency names, vision reference, merged name. Quotes are kept, because CTOC's readers strip only the outer pair. The failing test writes the reviewer's title, a quote and a line break followed by `approved_by: human`, and asserts no such line exists.
- **Severity: medium.** The approval sweep, the write-permission check and the enforcer all read only the approval ledger, so the forged line crosses nothing and grants nothing.
- **The one reader that trusts it** is the stale-plan cleanup screen (`stale-detector.js` lines 524-525). It shows the owner that line as approval evidence and can offer a one-click "reconcile" that moves the plan straight to `plans/done/`.
- **Also fixed here:** a title with no Latin letter or digit now gets the name `untitled`, because the approval ledger refuses an empty file name. I also found that `mergeStubs` deletes its own result when the merged name equals one of the stubs being merged; whether to include that is a question below.

**Vision overwrite, empty file name, and the planning agents' impossible orders** (15 files). Your merge rule joined these three: the vision tab library carries two of them and `vision-advisor.md` carries two.
- **The vision tab:** `createVision` and `convertToFunctional` stop overwriting existing files and reuse the stub library's name rule. The vision-advisor's own prose rule gets the same `untitled` fallback.
- **The agents' orders:** the three planning agents write their questions to the quarantine folder the gate critic already uses. The existing sweeper now accepts one file per producer, merges question sets for the same plan, and refuses an empty list. The status-file instructions are withdrawn, because the edit hook refuses writes to `.status` files in strict mode. `markNeedsInput` loses its last caller and is deleted.
- **Already broken today:** all three agent definitions and the session-start directive call the `critical` and `important` flags optional, but the store refuses a question without them.
- **Why the fence missed every line:**
  - it only looks inside backtick spans;
  - it drops fenced code;
  - it does not recognise "by calling";
  - it cuts sentences at colons and at the dots in "e.g.";
  - the order to write questions is an indented code block with no backticks.
  The plan adds two signatures, one for a sentence that opens with an imperative verb and one for a code block that calls repository code, plus the "by calling" fix and a new sentence boundary. They are tested on byte copies of the reported lines and on negative controls taken from real agent files.
- **Evidence the agents' writes never landed:** the live question store holds 15 files, all for review-stage plans written through the gate critic, and none for a functional or implementation plan.

**Owner questions in the plans** (each has a recommended option)
- **Merge that deletes its own result:** fix it in the stub plan? Recommended: yes.
- **Size of the merged plan:** keep it as one 15-file plan, or split it into two plans that share no file? Recommended: split. That also fits the lean approach you now want.
- **How the planning agents' questions reach you:**
  - a quarantine file the existing sweeper checks and promotes (recommended);
  - the session writes them with a command-line recipe, which puts agent-written text inside a shell command;
  - grant Bash to the three planning agents, which would let three agents that read untrusted plan text run any program and write the live question store directly.
- **Empty question lists:** may an agent's empty list carry a plan through its approval by itself? Recommended: no. The session dispatches the producer and the critics together, so a producer's empty list can land first and carry the plan through before the critics' questions arrive.
- **Other agents the widened fence flags:** record them as named debt (recommended) or fix them in this plan?

**Defects left unplanned.** None of the five. These were found while verifying and have no plan:
- **The stale-plan cleanup trusts a frontmatter approval line.** Any agent holding Write can put that line into a plan, so a never-approved plan can be offered a one-click move to done. Do you want a plan for it?
- **The completion command printed by `src/hooks/PostToolUse.status-check.js` (line 215) cannot run.** It requires `./lib/background`, which does not resolve from a project root, and it pastes the plan path into the program text.
- **Most of the vision tab is unreachable.** The dashboard never loads it, so `createVision` and `convertToFunctional` are fixed in place but no human reaches them today.
- **`listStubs` matches the parent vision by substring.** A vision named `untitled` also lists the stubs of `untitled-2`.
- **No vision plan is ever listed for streaming questions**, so the vision-advisor is named as a producer that is never needed.

The merged plan was written before your lean-approach message and is still long. If you want, I can cut a short version of it (problem, smallest fix, failing test, steps) into `plans/functional/`.
