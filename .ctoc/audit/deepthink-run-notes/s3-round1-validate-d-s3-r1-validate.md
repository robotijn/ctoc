**Result.** Of the 17 changes, 15 can be applied as written and 2 need a correction first (r1-f3 and r1-f7). None should be rejected. Of the 9 owner entries, 4 can go as they are and 5 need their evidence corrected. I found nothing fabricated or misattributed. I checked 42 claims: 34 validated, 6 unsourceable (each was already labelled believed or untested), 2 stale. Every source below was read on 2026-10-02.

## The eight points the dispatch asked me to settle first

| | Claim | Verdict | Source, with the exact quote |
|---|---|---|---|
| a | The 2026 edition of OWASP's Top 10 for applications built on large language models is published and current | VALIDATED, with conflicting sources | genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ shows "OWASP GenAI LLM Top 10 2026", released August 3, 2026, "Final (version 1.0)". The publisher's announcement of 2026-09-01 calls it "the latest edition of the project's flagship guidance". The final entry file on GitHub is titled "LLM01:2026 Prompt Injection". But **genai.owasp.org/llm-top-10/ still shows the 2025 edition (March 12, 2025) as the latest. That page is STALE.** |
| b1 | A foreground command that reaches its time limit is moved to the background | VALIDATED | Tools reference: "When a foreground command reaches its timeout without finishing, Claude Code moves it to the background instead of stopping it, unless the command starts with `sleep`." The result names "the task ID and the path of the file the output is being written to". It also says "A moved command's time limit counts from the move", and the default limit for background commands is 30 minutes. |
| b2 | Background subagents ask for permission in the main session from v2.1.186 | VALIDATED | Tools reference: "surface permission prompts in your main session as of v2.1.186 … Before v2.1.186, background subagents auto-denied any tool call that would otherwise prompt". |
| b3 | WebSearch and WebFetch need permission | VALIDATED | Permissions page. Web fetch: "Yes, except a built-in set of preapproved documentation domains", remembered "Permanently per repository and domain". Web search: "Yes", remembered "Permanently per repository". |
| b4 | Task was renamed to Agent in 2.1.63 | VALIDATED | Subagents page: "In version 2.1.63, the Task tool was renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as aliases." |
| b5 | Hook matchers honour the old name as an alias | **UNSOURCEABLE** | The hooks page names no alias. It says "`Bash` matches only the Bash tool", meaning a matcher of letters only is an exact string. Issue 29677 (closed as not planned) shows `tool_name` changing from "Task" to "Agent". Not tested at runtime. |
| c | Meta's Rule of Two quote | VALIDATED | 31 October 2025: "no more than two of the following three properties within a session … [C] An agent can change state or communicate externally". If an agent needs all three, it "at a minimum requires supervision — via human-in-the-loop approval or another reliable means of validation". |
| d | Anthropic's "content farms" quote | VALIDATED | 13 June 2025: "our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs". Also "citation accuracy (do the cited sources match the claims?)". |
| e | OWASP LLM01:2026 "provenance-labeled channel" wording | VALIDATED | Read raw from GitHub: "Pass external content through a structurally separate, provenance-labeled channel so the model can distinguish data from instructions". |
| f | arXiv 2604.03173 abstract | VALIDATED | Authors Delip Rao, Eric Wong and Chris Callison-Burch, submitted 3 April 2026. "3--13% of citation URLs are hallucinated"; deep research agents "hallucinate URLs at higher rates". |
| g1 | Node's `fs.rmSync` without `force` throws on a missing path | VALIDATED | Node's own source code, main branch: `rmSync` calls `validateRmOptionsSync`, which runs `lstatSync(path, { throwIfNoEntry: !options.force })`. I did not check the installed Node version. The documentation page was cut off by the fetch tool before this section. |
| g2 | Fetch's abort signal also covers reading the body | VALIDATED | MDN, "Using Fetch": "If the request is aborted after the `fetch()` call has been fulfilled but before the response body has been read, then attempting to read the response body will reject with an `AbortError` exception." That Node's fetch (which is built on undici) follows this is believed. |
| h1 | A subagent receives today's date | VALIDATED by observation | My own launch environment says "Today's date is 2026-10-02." This agrees with the critic's observation of its own launch. The vendor documentation says only that subagents get "environment details that Claude Code appends". |
| h2 | That date is the machine's local date | **UNSOURCEABLE** | I found no readable source. |

## Per finding

| Finding | Verdict | Claims, and the check they rest on |
|---|---|---|
| r1-f1 | **PASS** | All repository references are true: lines 106, 131, 140-162, 164-171, 253-255 and 260-268; researcher lines 4 and 44-45; test line 449. The change tells the session to paste sections into the launch when it runs. That is an instruction, not copying text into the file. One tension remains: the pinned line 59 lists what gets pasted, and the shapes are not on that list. The new text gives its reason, so this does not block the change. |
| r1-f2 | **PASS** | fetch-papers.cjs line 270 checks only the length and the first four bytes. The pinned line 196 agrees. DeepResearch Bench (2506.11763) measures "effective citation count and overall citation accuracy". The Anthropic quote is validated. |
| r1-f3 | **PASS-WITH-CORRECTION** | The backgrounding behaviour is validated (b1), and so are rmSync and safe-fs.js lines 114-116. The defect: a command moved to the background still has its own time limit, 30 minutes by default. It can therefore be stopped later, before it prints `papers in the list:`. In that case the pinned rerun rule should apply, but the new text says flatly "the rerun above does not apply". Corrected text is below. |
| r1-f4 | **PASS**, with a stronger source | The tools reference now documents what the critic took from a user report. Section "WebFetch tool behavior": "runs the prompt against the content using a small, fast model … Claude receives that model's answer, not the raw page" and "Large pages are truncated to a fixed character limit before processing". Issue 95127 quotes are validated (opened 17 September 2026, still open). Confidence moves to HIGH. Cite the tools reference first. |
| r1-f5 | **PASS** | arXiv 2604.03173 is validated. The new text contains no number. |
| r1-f6 | **PASS** | ask-me-questions lines 97, 99, 102, 127 (rule 10, "footnote under the matrix"), 133 and 144 are all true. Arithmetic check: 20+38+38+28+5 = 129. |
| r1-f7 | **PASS-WITH-CORRECTION** | b2, b3 and c are validated. The defect: "Such a prompt lets a person see a request" reads as if every request asks. Three cases get no prompt at all: documentation domains that are approved in advance; "don't ask again", which is permanent per repository for web searches and per repository and domain for fetches; and auto mode, where "a classifier decides most permission prompts instead of you". Corrected text is below. |
| r1-f8 | **PASS** | Repository only (researcher line 4). |
| r1-f9 | **PASS** | Program lines 66-69 (the comment), 71 (a time limit per download) and 58-64 (a lookup with no limit) are true. g2 covers the body. |
| r1-f10 | **PASS** | `50 * 1024` is 51,200. Line 270 refuses 51,200 bytes and keeps 51,201 (tests lines 811-812, 864 and 889-891). I did not fetch a definition of "kibibyte". |
| r1-f11 | **PASS** | The description stays on one line, with no ": " and no " #". |
| r1-f12 | **PASS** | h1 is validated and h2 is unsourceable. The new text depends on neither, because it passes the date in explicitly. MDN on `toISOString`: "The timezone is always UTC". |
| r1-f13 | **PASS** | e is validated. The brief check reads line one only (line 227). |
| r1-f14 | **PASS** | ask-me-questions line 97: "opens with four parts in this exact order". |
| r1-f15 | **PASS**, and the "believed" claim is now read | GitHub's documentation: "GitHub automatically creates links from standard URLs." Program lines 152-156 escape `\ | [ ] < > ` and not `*` or `_`. |
| r1-f16 | **PASS** | Repository only. |
| r1-f17 | **PASS** | d is validated. |

### Mechanical checks
- Every `old` occurs exactly once, and the olds do not overlap. r1-f4 and r1-f17 sit next to each other on line 128, as do r1-f9 and r1-f10 on lines 197-198, but the texts do not overlap. No `new` contains another finding's `old`.
- No change touches a string pinned in the test file.
- Only `description` changes in the frontmatter, and no approval key is added.
- The plain-words check would pass: no banned word, no word of capital letters, no gate number.
- No new line, after trimming, equals a line of 25 or more characters in another skill. One observation: r1-f6 contains the 47-character phrase "one sentence stating the question being decided", which appears inside ask-me-questions line 129. It is part of a line, not a whole line, so the line-based copy check passes.

## Corrected texts

**r1-f3, new:**
```
The shell tool may move a command that reaches its time limit into the background instead of stopping it. When it reports that it did, the program has not stopped: take the papers' lines from that command's output once it ends, and apply the rerun above only if it ended before printing `papers in the list:`. Never start the program a second time on a staging file while a run on it may still be going, because each run appends its own block to the index and the second to end stops with an error on the staging file the first one removed.

The code is the file itself; this section states what it does.
```

**r1-f7, new:**
```
- The reading agent's web searches and fetches can ask the owner for permission in this session; a request the owner refuses, or one an older Claude Code refuses without asking, is a failure the reading agent names under Failures. Such a prompt lets a person see a request before it leaves, which matters because the reading agent holds the text the session pasted and sends requests out: a page that steers it could carry that text out in a search or an address, and the brief's rule against that reduces the risk without removing it. No prompt reaches the owner for a fetch from a documentation site Claude Code approves in advance, in auto mode, where a classifier decides instead, or once the owner has allowed web searches, or fetches from a site, without asking again, which lasts for the repository.
- No other agent is launched for a run, and no second Claude process is started.
```

## Owner entries

| Entry | Verdict | Correction |
|---|---|---|
| h-deepthink-r1-launch-fence-matcher | VALIDATED (hooks.json line 76, PreToolUse.Task.js line 191, b4, b5, issue 29677) | None. Optionally add: "the hooks page (read 2026-10-02) names no Task alias for matchers; issue 29677 is closed as not planned." |
| h-deepthink-r1-check-and-connect-lookups | VALIDATED. OWASP's server-side request forgery cheat sheet quote is exact. | In the option "one-lookup", the two cons were not read from any source. Mark them "(believed, not read)": that the built-in fetch takes no lookup function without undici, and that https.request does not decompress. |
| h-deepthink-r1-arxiv-pace-after-refusal | Robots help page and terms-of-use quotes validated. The terms' three-second rule covers "OAI-PMH, RSS, and the arXiv API". | I read "Indiscriminate automated downloads from this site are not permitted" on **info.arxiv.org/help/robots.html**, so cite that page. I did not re-read robots.txt (the `/pdf/` allowance and the 15-second delay) or the bulk-data page this run. |
| h-deepthink-r1-fifty-kilobytes-wording | VALIDATED (program lines 13 and 271, test lines 864 and 872) | None. |
| h-deepthink-r1-tools-key-unread | **Settled, so the evidence must change.** | Replace the "believed" and "not settled" sentences with: "The skills page (code.claude.com/docs/en/skills, read 2026-10-02) lists no tools field and says 'Claude Code ignores a field it doesn't recognize without reporting an error'. allowed-tools means 'Tools Claude can use without asking permission during the turn that invokes this skill' and 'It does not restrict which tools are available'. The key that removes tools is disallowed-tools." Two option edits follow. "allowed-tools", cons: "lets Task, Read, Write, Bash, Glob and Grep run without a prompt during the invoking turn and restricts nothing; reverses the parent's decision and the test." "keep-and-say", cons: drop "Rests on the validator confirming the key is unread". Side fact from the same page: `when_to_load` and `type` are not Claude Code fields either; Claude Code's field is `when_to_use`. I did not check whether CTOC's own code reads them. |
| h-deepthink-r1-rule-of-two-paraphrase | VALIDATED (gate-critic lines 4 and 89, c) | None. |
| h-deepthink-r1-owasp-edition | **Settled.** | Replace "In conflict … must settle" with the evidence from row a. Correct the scope with a presence check only: "LLM01:2025" appears 18 times in 8 agent files. citation-validator line 52, agent-critic line 50, llm-security-tester lines 52, 96, 131, 159 and 222, premortem-critic line 143, gate-critic lines 89 and 484, advocate-critic line 91, devils-advocate-critic line 61, red-team-critic lines 39, 47, 122, 268, 281 and 299. So "move-to-2026" touches 8 files, not "at least five". Citation-validator line 52 is my own definition. I do not edit it. |
| h-deepthink-r1-long-run-line-on-owner-decisions | VALIDATED (repository: skill lines 166-170, ask-me-questions line 125, parent plan line 327) | None. |
| h-deepthink-r1-which-calendar-day | MDN validated | "In the owner's summer time" should read "if the owner's clock is on Central European Summer Time (universal time plus two hours; the owner's zone was not read from a source)". Mark the local-day command "(believed correct; getTimezoneOffset was not read this run)". |

## Counts
- **Claims checked: 42.**
- **VALIDATED: 34.**
- **UNSOURCEABLE: 6.** These are the hook alias, the date being local, the owner's time zone, the two option cons about undici and https.request, and the local-day command. Each was already labelled believed or untested.
- **STALE: 2.** These are the genai.owasp.org/llm-top-10/ page, and "LLM01:2025" read as the current ranking.
- **FABRICATED: 0. MISATTRIBUTED: 0.**
- Not re-checked because of the fetch budget: arXiv's robots.txt and its bulk-data page.

Three fetches failed or were cut short; I report them so they do not read as clean passes:
- The fetch tool cut off https://github.github.com/gfm/ before section 6.9. GitHub's own documentation page replaced it.
- The fetch tool cut off https://nodejs.org/api/fs.html before `rmSync`. Node's source code replaced it.
- Search-result summaries were not credited as sources.

No fetched page contained instructions aimed at an agent.

## Final lists
- **Apply as-is:** r1-f1, r1-f2, r1-f4, r1-f5, r1-f6, r1-f8, r1-f9, r1-f10, r1-f11, r1-f12, r1-f13, r1-f14, r1-f15, r1-f16, r1-f17. For r1-f4 and r1-f15, record the stronger vendor sources.
- **Apply with correction:** r1-f3 and r1-f7, with the texts above.
- **Do not apply:** none.
- **For the owner:** all 9 entries.
  - Send unchanged: launch-fence-matcher, fifty-kilobytes-wording, rule-of-two-paraphrase, long-run-line-on-owner-decisions.
  - Send with the evidence corrections above: check-and-connect-lookups, arxiv-pace-after-refusal, tools-key-unread, owasp-edition, which-calendar-day.

**Risk.** Three things are still unchecked:
- Whether the `Task` hook matcher still fires on the installed version. It needs one live launch with hook logging on.
- Whether the installed Node version behaves like the main-branch `rmSync` code I read.
- arXiv's robots.txt and bulk-data page.

None of these blocks any of the 17 changes.

Files:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/skills/deepthink/fetch-papers.cjs
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js
- <home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s3-round1-critic-d-s3-r1-critic.md

Sources:
- [OWASP GenAI LLM Top 10 2026 resource page](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)
- [OWASP 2026 release announcement](https://genai.owasp.org/2026/09/01/owasp-genai-security-project-unveils-2026-top-10-for-llm-applications-new-agent-control-standard-and-sponsors-as-community-tops-30000-members/)
- [OWASP LLM Top 10 archive page (stale)](https://genai.owasp.org/llm-top-10/)
- [LLM01:2026 final entry, raw](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md)
- [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Issue 29677](https://github.com/anthropics/claude-code/issues/29677)
- [Issue 95127](https://github.com/anthropics/claude-code/issues/95127)
- [Meta, Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/)
- [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [arXiv 2604.03173](https://arxiv.org/abs/2604.03173)
- [arXiv 2506.11763](https://arxiv.org/abs/2506.11763)
- [Node lib/fs.js](https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js)
- [Node lib/internal/fs/utils.js](https://raw.githubusercontent.com/nodejs/node/main/lib/internal/fs/utils.js)
- [MDN Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN toISOString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
- [GitHub autolinked URLs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls)
- [OWASP server-side request forgery cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [arXiv robots help](https://info.arxiv.org/help/robots.html)
- [arXiv API terms of use](https://info.arxiv.org/help/api/tou.html)
