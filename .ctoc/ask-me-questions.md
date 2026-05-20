---
name: ask-me-questions
description: Render pending decisions as a matrix with pros, cons, and one quality-only recommendation, then collect the user's choice via AskUserQuestion. Never put the matrix inside the question. Never use abbreviations.
allowed-tools: [AskUserQuestion, Read, WebSearch]
---

# ask-me-questions — Structured Decision Elicitation

> This is CTOC's canonical format for asking the user a decision question. The
> discussion phase (`claude:discuss`) and every "gap → question" in the menu
> system MUST follow it. Present pending decisions in a strict two-step format:
> matrix first, AskUserQuestion second. Once started, run both steps without
> asking the user any intermediate clarification.

## When to use this format

- The discussion phase surfaced one to four gaps or weak assumptions in a plan.
- The user typed `/ask-me-questions` directly.
- A subagent returned an "Open questions" section that needs human input.
- A plan has unresolved ambiguity that must be locked before implementation can begin.

## When NOT to use this format

- Single yes-or-no clarification — ask the question directly without a matrix.
- The decision is trivial and reversible — pick a sensible default and continue.
- The user has already answered the question in CLAUDE.md, persistent memory, or earlier in the current conversation.

## The two-step flow

### Step 1 — Render the question, the explanation, and the decision matrix in the text response

The text response that precedes the AskUserQuestion call has four parts in this exact order:

1. **Heading line.** Format: `### Question N — <the question phrased as a real question ending in a question mark>`. The heading must itself be a question, not a topic label. For example, "### Question 1 — Should the CTO Chief absorb the Product Loop, or stay focused on shipping only?" — never "### Question 1 — Product Loop placement". A heading without a question mark is a violation of this format.
2. **Explanation paragraph.** One short paragraph (two to four sentences) that explains why this decision matters, what is at stake, and any relevant context the user needs to choose well. Cite a source as a markdown hyperlink if the explanation depends on a fact that could be wrong.
3. **The decision matrix.** Drawn using Unicode box-drawing characters inside a fenced code block (see matrix rules below). Markdown pipe-character tables are forbidden — they do not render visible vertical lines in every viewer, and the user's persistent rule requires real vertical lines.
4. **The verbatim question sentence.** One sentence after the matrix that is identical to the `question` text in the AskUserQuestion call below it. This sentence may match the heading or be a tightened version of it.

Required characters:

- Top edge: `┌`, `─`, `┬`, `┐`
- Row separator: `├`, `─`, `┼`, `┤`
- Bottom edge: `└`, `─`, `┴`, `┘`
- Vertical line: `│` (U+2502)

The columns are exactly: `Option`, `Pros`, `Cons`, `Recommendation`. Header row spelled in full, never abbreviated.

Matrix rules:

1. The matrix is rendered inside a fenced code block (triple backticks). This forces monospace rendering so the vertical and horizontal lines align.
2. Every cell boundary uses real box-drawing characters. The vertical separator between every column on every row is the `│` character. The horizontal separator between every row is built from `─`, `├`, `┼`, `┤`. The top edge uses `┌`, `┬`, `┐` and the bottom edge uses `└`, `┴`, `┘`.
3. Header row must be exactly the four columns above. Never abbreviate column names.
4. One option per box-drawing row. Two to four options per question — AskUserQuestion's hard limit is four.
5. Pros and Cons cells: one full sentence per visible line within the cell. Pad each line with spaces so all column widths are equal and the `│` characters align vertically down the matrix. If a sentence is longer than the column width, wrap onto the next line with continued indentation; do not break a sentence across cells.
6. **Never use abbreviations anywhere.** Write "pull request" not "PR"; "user interface" not "UI"; "database" not "DB"; "European Union" not "EU"; "application programming interface" not "API"; "single sign-on" not "SSO"; "two-factor authentication" not "2FA"; "software-as-a-service" not "SaaS"; "continuous integration" not "CI"; "continuous deployment" not "CD". Spell every term in full every time, including standard industry acronyms.
7. The Recommendation column contains exactly one cell marked `Recommended` plus a one-clause reason. All other Recommendation cells are empty.
8. The recommendation is **always the highest-quality option**, regardless of cost, effort, time-to-ship, or popularity. Pick the option that produces the best outcome.
9. **Surface cost transparently, never editorialize about it.** If the recommended option is expensive, state the price in the Recommendation cell as a fact — for example, "Recommended — highest deliverability; pricing starts at one hundred twenty dollars per month at the production tier." Never say the cost is "high," "steep," "worth it," "but consider the cost," or any framing that argues against the recommendation on cost grounds. The user decides whether the cost is acceptable; my job is to inform, not to moan. The same applies to Cons cells: list the price as a number, not as a complaint.
10. If any claim in a Pros or Cons cell could be wrong — a pricing tier, a regulation date, a vendor capability, a benchmark number — call WebSearch and cite the source as a markdown hyperlink footnote under the matrix. If a specific claim cannot be verified, mark it with `[unverified]` rather than removing it; the user can correct it.

After the matrix, write one sentence stating the question being decided. That sentence becomes the AskUserQuestion `question` text verbatim.

### Step 2 — Invoke AskUserQuestion (matrix is forbidden inside)

The AskUserQuestion call contains only:

- `question`: the one sentence from the previous paragraph. No matrix. No pros or cons. No recommendation reason.
- `header`: a label of twelve characters or fewer.
- `options`: two to four entries. Each `label` is the option name. The recommended option's label ends with `(Recommended)`. Each `description` is one sentence summarizing the option. Use no abbreviations.

The matrix has been shown above the call. Do not replicate it inside the question text or any option description.

## Sequencing — one question per turn, always

**One question per turn. Never batch.** Even if the questions appear independent, ask them sequentially. Render one matrix in the text response, then invoke AskUserQuestion with a single question. Wait for the answer. Then render the next matrix and ask the next question.

This rule is absolute and overrides the AskUserQuestion built-in batching capability. The reason is user preference: each decision deserves its own focused turn so the user can reason about it without parallel options bleeding into the choice.

## More than four candidate options

AskUserQuestion supports a maximum of four options per question. If you have more than four candidates, narrow to the top four by quality before rendering the matrix. If the user wants to see additional options, the built-in "Other" choice lets them type a custom answer.

## Empty state

If there are no pending decisions to present, respond with the literal text: `No pending decisions to present.` Do not fabricate a question.

## Minimum-viable example

After a research step surfaced one decision:

````
### Question 1 — Which email delivery provider should the project use?

Transactional email (receipts, password resets) must reach the inbox, not spam. Deliverability reputation, not price, decides whether a paying customer sees a receipt. The provider is wired in early and is costly to swap later.

```
┌────────────────────────────┬───────────────────────────────────────────────┬─────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
│ Option                     │ Pros                                          │ Cons                                        │ Recommendation                                        │
├────────────────────────────┼───────────────────────────────────────────────┼─────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Resend                     │ React Email component integration.            │ Designed for transactional email only;      │                                                       │
│                            │ Free tier of three thousand emails per month. │ not built for marketing campaigns.          │                                                       │
│                            │ Strong deliverability reputation in 2026.     │                                             │                                                       │
├────────────────────────────┼───────────────────────────────────────────────┼─────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Postmark                   │ Top-tier deliverability metrics in 2026.      │ Pricing starts at fifteen dollars per month │ Recommended — highest deliverability reputation       │
│                            │ Detailed bounce diagnostics for debugging.    │ for ten thousand emails; no free production │ for transactional email; pricing starts at fifteen    │
│                            │ Best transactional reputation among providers.│ tier.                                       │ dollars per month at the ten-thousand-email tier.     │
├────────────────────────────┼───────────────────────────────────────────────┼─────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Amazon Simple Email Service│ Lowest per-message cost at large scale: ten   │ Manual configuration of sender policy       │                                                       │
│                            │ cents per thousand emails.                    │ framework and domain key records.           │                                                       │
│                            │                                               │ Slower deliverability ramp-up than Resend   │                                                       │
│                            │                                               │ or Postmark.                                │                                                       │
└────────────────────────────┴───────────────────────────────────────────────┴─────────────────────────────────────────────┴───────────────────────────────────────────────────────┘
```

Which email delivery provider should the project use for transactional email?
````

Then invoke AskUserQuestion with:

- `question`: "Which email delivery provider should the project use for transactional email?"
- `header`: "Email"
- Three options: "Postmark (Recommended)", "Resend", "Amazon Simple Email Service" — each with a one-sentence description and no abbreviations.

## What NOT to do

- Never write a topic label as the heading. The heading must be a real question ending in a question mark.
- Never skip the explanation paragraph between the heading and the matrix. The user needs to know why the decision matters before reading the options.
- Never put the matrix inside the AskUserQuestion `question` text or any option description. The matrix lives in the preamble only.
- Never use abbreviations anywhere — matrix, question, options, descriptions, footnotes.
- Never let cost, effort, time-to-ship, or popularity reduce the quality of the recommendation. Always recommend the highest-quality option.
- Never editorialize about cost ("expensive," "steep," "worth it," "but consider the cost"). State prices as numbers and let the user decide.
- Never mark more than one option as Recommended per question.
- Never invoke AskUserQuestion without first rendering the matrix.
- Never batch — one question per turn, always.
- Never call WebSearch on every Pros or Cons claim — only on claims that could be wrong.
- Never ask the user a meta-question (for example, "should I show the matrix?" or "is this format good?"). It is a single automatic flow.
