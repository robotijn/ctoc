Nothing was changed. **Verdict:** the Meta source is real and the three properties are quoted correctly, but the index paraphrases the rule too loosely in two places. The AskUserQuestion question has a firm answer in Claude Code's own documentation: a dispatched subagent can never call it. That answer contradicts the reason the index gives for rule 5 and settles index decision 9. Read date for everything: 2026-10-05. Web fetches used: 8.

## 1. Meta's "Agents Rule of Two"

**Where it is cited.** The index `plans/todo/agent-tool-grants.md` cites it at lines 102 and 115. The slice plan mentions it at line 624 (the Step 9 order) and line 672 (the execution record). `tests/agent-tool-grants.test.js` never cites it: a search of `tests/` returned 0 matches.

**The page.** https://ai.meta.com/blog/practical-ai-agent-security/ is live. Title: "Agents Rule of Two: A Practical Approach to AI Agent Security". Dated "October 31, 2025", with no named author. I read it in three passes, which agreed on every quote below.

- **The three properties and "within a session":** "At a high level, the Agents Rule of Two states that until robustness research allows us to reliably detect and refuse prompt injection, agents must satisfy no more than two of the following three properties within a session to avoid the highest impact consequences of prompt injection." The properties are "[A] An agent can process untrustworthy inputs", "[B] An agent can have access to sensitive systems or private data" and "[C] An agent can change state or communicate externally".
- **The supervision clause:** "It's still possible that all three properties are necessary to carry out a request. If an agent requires all three without starting a new session (i.e., with a fresh context window), then the agent should not be permitted to operate autonomously and at a minimum requires supervision — via human-in-the-loop approval or another reliable means of validation."

| Claim (index) | Verdict | Why |
|---|---|---|
| Line 102: the three properties | **VALIDATED** | Close paraphrase of [A], [B] and [C] |
| Line 102: "late 2025" | **VALIDATED** | The page is dated 31 October 2025 |
| Line 102: "combine at most two without a person in the loop" | **MISATTRIBUTED** | It leaves out "within a session", the fresh-context-window way out, and "or another reliable means of validation". Meta's remedy is not only a person. |
| Line 102: the six web-plus-write agents, set beside Meta's rule | **MISATTRIBUTED** (it overreaches) | A web tool plus Write or Bash is [A] plus [C], which Meta's rule allows on its own; its example heading is "Web Browsing Research Assistant [AC]" (seen in one pass only). Rule 6 is the plan's own stricter floor, not the Rule of Two. |
| Line 102: "(Believed … could not re-read it. Step 9 … has citation-validator check …)" | **STALE** | It has now been checked |
| Line 115: "Under Meta's definition the repository itself is untrusted input too" | **MISATTRIBUTED** | Meta says no such thing. Its coding example ("High-Velocity Internal Coder [BC]") says: "we place preventive controls around any sources of untrustworthy data [A] by: Using author-lineage to filter all data sources processed within the agent's context window." Treating the repository as untrusted is the plan's own reading. |

The passes disagreed on one point. The second pass reported no coding-related sentence; the third, with a targeted request, returned the coding scenario quoted above. I am reporting that disagreement rather than settling it silently.

## 2. Can a dispatched agent call AskUserQuestion?

**No. Both documentation pages say so.**

- **https://code.claude.com/docs/en/sub-agents.md, section "Available tools"** (two passes agreed):
  - "Subagents inherit the built-in tools and MCP tools available in the main conversation, narrowed by two filters: the first removes a short list of tools from every subagent, and the second reduces the built-in tool set for subagents that run in the background, which is the default."
  - "Forks skip both filters and receive the main conversation's exact tool pool."
  - "The first filter removes these tools, even when listed in the `tools` field:" — the list includes `` `AskUserQuestion` ``.
  - AskUserQuestion is also missing from the background-subagent tool list.
  - On interactive sessions: "Where fork mode is on, as it is by default in an interactive session, Claude Code runs the subagent in the background, forks and non-fork subagents alike".
- **https://code.claude.com/docs/en/tools-reference.md** (read as the raw markdown file):
  - "In every case, the resolved set is limited to the tools available to subagents: a tool that isn't available to subagents is never granted, even when listed in `tools`."
  - Its "AskUserQuestion tool behavior" section says nothing about subagents. It does say a question asked "in a background session … wait[s] until you answer them". That is a background session, not a subagent.
- **Not stated in either page:** whether AskUserQuestion survives when an agent runs as the main thread through `claude --agent <name>`. The page only says "the main thread itself takes on that subagent's tool restrictions and model".

| Claim | Verdict |
|---|---|
| Index rule 5, line 53: "a background agent cannot wait for an answer" | **MISATTRIBUTED.** The conclusion is right but the reason is wrong: the tool is removed from every subagent, foreground or background, and a background *session* does wait. |
| Index decision 9, line 451: "Unknown, to verify at slice 1's Step 9" | **STALE.** It is now answered. |

**What this means for the test.** Five profiles carry `asks: true`: `kpi-planner`, `stack-chooser`, `unit-economics-modeler`, `vision-advisor` and `vision-decomposer`. Check 3 therefore requires AskUserQuestion in their grants. Whenever they are dispatched as non-fork subagents, Claude Code strips that tool silently, and their bodies' orders to "Use AskUserQuestion" cannot be carried out. Whether to keep the tool in their grants or route their questions back to the session is the owner's decision.

## 3. Other citation-shaped claims

**In the test file's comments:**

- **STALE, line 6:** `plans/implementation/agent-tool-grants.md`. Reading it returns "File does not exist." The index is now at `plans/todo/agent-tool-grants.md`. The slice plan's line 26 has the same stale path.
- **VALIDATED:**
  - "rules 2 to 5 and 7", "rule 6" and "rule 1" match the index, lines 49 to 55.
  - "the safety floor does not cover [Bash] (the index says so)" matches index line 115: "Rule 6 as decided covers the two web tools. A Bash command can also read the network and run what it reads".
  - "49 tools on 26 agents: Bash 20, Write 14, Edit 14, Task 1" matches a count of `HELD_REMOVALS` (lines 322 to 349).
  - Every slice note in `WRITE_EDIT_DEBT` matches the index's slice table, lines 158 to 167.
  - The six safety-floor exception reasons and their slices match index lines 106 to 111.
  - The end user's reported grant in fixture (a), `Read, Write, WebSearch, Glob`, matches index line 45.
  - "question 4 kept its grant unchanged" matches index line 34.
- **The owner's quoted words** match the index text word for word (index line 25 and decision 16). I had no transcript, so this confirms only that the copies agree with each other.

**In the slice plan's decisions** (this file has only 1 to 12):

- **Decision 9: VALIDATED.** The ruling's wording is identical to index decision 16.
- **Decision 10, "none holds Edit without Write": VALIDATED.** All 18 `tools:` lines under `agents/` that contain Edit also contain Write.
- **Decision 11: VALIDATED.** `agents/iron-loop/gate-critic.md` line 4 reads `tools: Read, Grep, Write`, and `WRITE_EDIT_DEBT` has 22 entries.
- **Decision 12: VALIDATED.** None of the five agents holds Edit:
  - `clm-obligations`: `Read, Write, Grep, Glob`
  - `dsar-handler`: `Read, Write, Grep, Glob, Bash`
  - `experiment-designer`: `Read, Write`
  - `vercel-deploy`: `Read, Write, Bash`
  - `cra-incident-clocks`: `Read, Write, Grep`
- **Acceptance criterion 1 (line 593): STALE.** It still says 44 held removals.

**In the index's decisions 9 to 16:**

- **Decision 9:** STALE, as covered in section 2.
- **Decisions 11, 12 and 16:** VALIDATED.
- **Decision 13: partly wrong.** It is true that `changelog-generator` holds no Write; its line is `tools: Bash, Read`. But "no tool it holds can carry out" a rewrite is contradicted by the tool reference, which lists Bash as "Executes shell commands in your environment", and a shell command can write a file.
- **Decision 15: VALIDATED as far as it was checked.** The question name `h-deepthink-r2-waiting-budget-threshold` and the file `plans/implementation/deepthink-ships-with-ctoc-s8-reader-and-critic-wording.md` both exist. I did not check the option name `three-seconds`.
- **Decisions 10 and 14:** no citation-shaped detail to check.

**Outside the brief's scope, but the same kind of drift:** index lines 39, 92 and 167 still say "44" held removals and "Edit 9"; decision 16 and the test say 49 and Edit 14. Index line 86 ("Lose Edit 0 | 9 | 9") also needs recounting. The index's own `files:` entry is the stale `plans/implementation/` path.

## Exact replacements

1. **Test file, line 6**
   - old: ` * PROFILE is the tool-grant audit of plans/implementation/agent-tool-grants.md, held`
   - new: ` * PROFILE is the tool-grant audit of the index plan agent-tool-grants.md (plans/<stage>/), held`
2. **Slice plan, line 26**
   - old: ``Read first: the index `plans/implementation/agent-tool-grants.md` ``
   - new: ``Read first: the index `plans/todo/agent-tool-grants.md` ``
3. **Slice plan, line 593**
   - old: `with 118 agents in debt, 6 safety-floor exceptions and 44 held removals on 26 agents (`MAX_HELD_REMOVALS` 44).`
   - new: `with 118 agents in debt, 22 agents in the Write-and-Edit debt, 6 safety-floor exceptions and 49 held removals on 26 agents (`MAX_HELD_REMOVALS` 49).`
4. **Index, line 102**
   - old: `names three properties — processing untrustworthy input, access to sensitive systems or private data, and changing state or communicating externally — and holds that an agent should combine at most two without a person in the loop. (Believed from the article as published in late 2025; this session had no web tool and could not re-read it. Step 9 of slice 1 has CTOC's citation-validator check the citation before it is quoted anywhere.)`
   - new: `(published 31 October 2025, read 2026-10-05) states that "agents must satisfy no more than two of the following three properties within a session": "[A] An agent can process untrustworthy inputs", "[B] An agent can have access to sensitive systems or private data", "[C] An agent can change state or communicate externally"; if all three are needed "without starting a new session (i.e., with a fresh context window), then the agent should not be permitted to operate autonomously and at a minimum requires supervision — via human-in-the-loop approval or another reliable means of validation." A web tool together with Write, Edit or Bash is [A] with [C], which Meta's rule allows on its own; rule 6 is this plan's stricter floor, not a restatement of the Rule of Two.`
5. **Index, line 115**
   - old: `Under Meta's definition the repository itself is untrusted input too, so any agent holding Read and Bash holds all three properties;`
   - new: `Meta's post does not call a repository untrustworthy input; its coding example ("High-Velocity Internal Coder [BC]") places "preventive controls around any sources of untrustworthy data [A]" by "Using author-lineage to filter all data sources processed within the agent's context window." This plan's own, stricter reading treats code the agent did not author as untrusted input, so an agent holding Read and Bash over such code can hold all three properties;`
6. **Index, line 53**
   - old: `; a background agent cannot wait for an answer.`
   - new: `. Claude Code removes AskUserQuestion from every dispatched subagent, foreground or background, "even when listed in the `tools` field" (https://code.claude.com/docs/en/sub-agents.md, "Available tools", read 2026-10-05); a fork is the one documented exception ("Forks skip both filters and receive the main conversation's exact tool pool").`
7. **Index, line 451**
   - old: `9. **Unknown, to verify at slice 1's Step 9**: whether a dispatched agent can call AskUserQuestion at all. Rule 5 is applied to the five holders as written;`
   - new: `9. **Verified at slice 1's Step 9 (2026-10-05): a dispatched agent cannot call AskUserQuestion.** The subagent documentation (https://code.claude.com/docs/en/sub-agents.md, "Available tools") says "The first filter removes these tools, even when listed in the `tools` field", and the list includes `AskUserQuestion`; the tools reference (https://code.claude.com/docs/en/tools-reference.md) adds "a tool that isn't available to subagents is never granted, even when listed in `tools`". Only a fork is exempt. Rule 5 is applied to the five holders as written, and their AskUserQuestion is unusable whenever they are dispatched as non-fork subagents;`
8. **Index, line 455**
   - old: `its body orders a file rewrite no tool it holds can carry out.`
   - new: `its body orders a file rewrite, and it holds neither Write nor Edit (its grant is `Bash, Read`).`
9. **Index, lines 39 and 167**
   - old: `44 tools on 26 agents` and `The 44 held removals on 26 agents`
   - new: `49 tools on 26 agents` and `The 49 held removals on 26 agents`
10. **Index, line 92**
    - old: `**Bash 20, Write 14, Edit 9, Task 1 — 44 tools on 26 agents.**`
    - new: `**Bash 20, Write 14, Edit 14, Task 1 — 49 tools on 26 agents.**`

Applying these needs a plan that covers each file; the test file and the index are both protected from edits.

## Structured response (per `.ctoc/architecture/dispatch-schema.yaml`)

```yaml
dispatch_response:
  dispatch_id: null          # the brief carried none; not invented
  protocol_version: 1
  agent: citation-validator
  completed_at: 2026-10-05
  findings:
    - {id: meta-rule-paraphrase, severity: high, type: citation-misattributed, file: plans/todo/agent-tool-grants.md, line_range: [102], confidence: HIGH, confidence_rationale: "three fetches agree on the quote", suggestion: "correct-to: replacement 4", citations: {brief_url: "https://ai.meta.com/blog/practical-ai-agent-security/", evidence: [{file: plans/todo/agent-tool-grants.md, line_range: [102]}]}}
    - {id: meta-repository-untrusted, severity: high, type: citation-misattributed, file: plans/todo/agent-tool-grants.md, line_range: [115], confidence: MEDIUM, suggestion: "correct-to: replacement 5", citations: {brief_url: "https://ai.meta.com/blog/practical-ai-agent-security/", evidence: [{file: plans/todo/agent-tool-grants.md, line_range: [115]}]}}
    - {id: ask-user-question-rule-5-reason, severity: high, type: citation-misattributed, file: plans/todo/agent-tool-grants.md, line_range: [53], confidence: HIGH, confidence_rationale: "two pages agree; the tools reference was read raw", suggestion: "correct-to: replacement 6", citations: {brief_url: "https://code.claude.com/docs/en/sub-agents.md", evidence: [{file: plans/todo/agent-tool-grants.md, line_range: [53]}]}}
    - {id: ask-user-question-decision-9, severity: medium, type: citation-stale, file: plans/todo/agent-tool-grants.md, line_range: [451], confidence: HIGH, confidence_rationale: "as above", suggestion: "correct-to: replacement 7", citations: {brief_url: "https://code.claude.com/docs/en/tools-reference.md", evidence: [{file: plans/todo/agent-tool-grants.md, line_range: [451]}]}}
    - {id: five-profiles-demand-a-stripped-tool, severity: info, type: citation-consequence, file: tests/agent-tool-grants.test.js, line_range: [94, 99], confidence: HIGH, confidence_rationale: "the documentation says it directly", suggestion: "owner decision; no edit recommended", citations: {brief_url: "https://code.claude.com/docs/en/sub-agents.md", evidence: [{file: tests/agent-tool-grants.test.js, line_range: [94, 99]}]}}
    - {id: test-index-path, severity: medium, type: citation-stale, file: tests/agent-tool-grants.test.js, line_range: [6], confidence: HIGH, confidence_rationale: "Read returned File does not exist", suggestion: "correct-to: replacement 1", citations: {evidence: [{file: tests/agent-tool-grants.test.js, line_range: [6]}, {file: plans/in-progress/agent-tool-grants-s1-the-test.md, line_range: [26]}]}}
    - {id: acceptance-criterion-44, severity: medium, type: citation-stale, file: plans/in-progress/agent-tool-grants-s1-the-test.md, line_range: [593], confidence: HIGH, confidence_rationale: "counted HELD_REMOVALS", suggestion: "correct-to: replacement 3", citations: {evidence: [{file: tests/agent-tool-grants.test.js, line_range: [322, 350]}]}}
    - {id: index-decision-13-bash, severity: low, type: citation-misattributed, file: plans/todo/agent-tool-grants.md, line_range: [455], confidence: MEDIUM, suggestion: "correct-to: replacement 8", citations: {brief_url: "https://code.claude.com/docs/en/tools-reference.md", evidence: [{file: agents/documentation/changelog-generator.md, line_range: [4]}]}}
    - {id: index-44-counts, severity: medium, type: citation-stale, file: plans/todo/agent-tool-grants.md, line_range: [39, 167], confidence: HIGH, confidence_rationale: "decision 16 and the test say 49", suggestion: "correct-to: replacements 9 and 10; line 86 needs a recount", citations: {evidence: [{file: plans/todo/agent-tool-grants.md, line_range: [458]}]}}
  self_assessment:
    coverage: 0.9
    confidence_overall: HIGH
    limitations:
      - "The sub-agents page and the Meta page passed through WebFetch's summarizing model. Quotes I relied on were confirmed by two or three passes; the tools-reference page was read as raw markdown."
      - "Two passes over the Meta page disagreed about the coding scenario; the targeted third pass is the one cited."
      - "The owner's quoted words were checked only against the repository's own copies, not a transcript."
    unknowns:
      - "Whether AskUserQuestion is available when an agent runs as the main thread through `claude --agent` (not documented)."
      - "Whether CTOC ever runs the five asking agents as the main session rather than dispatching them."
      - "The deepthink option name `three-seconds` was not checked."
  metadata: {tool_calls: 19, subagents_dispatched: 0}
```

Files involved:
- <home>/Code/ctoc/tests/agent-tool-grants.test.js
- <home>/Code/ctoc/plans/in-progress/agent-tool-grants-s1-the-test.md
- <home>/Code/ctoc/plans/todo/agent-tool-grants.md
