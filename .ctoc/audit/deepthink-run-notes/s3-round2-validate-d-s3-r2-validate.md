**Round 2 validation of `skills/deepthink/SKILL.md`: 10 of the 16 changes pass as written, 6 pass with the corrections below, and none is refuted. The four owner entries hold; three need a small fix to their evidence.** I edited nothing. I could not recompute the fingerprint because I have no shell, so the executor must check `sha256:4e7b1136…` before applying anything.

## Verdict per change

| Change | Verdict | Evidence (read 2026-10-02) |
|---|---|---|
| r2-f1 | Pass with correction | Permission-modes page (raw `.md`). Line 11: "With Claude Code v2.1.283 or later, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions". Line 56: "Requires a supported model, and your organization can turn auto mode off". Line 288: "Explicit ask rules still force a prompt." Line 491: allow, ask and deny rules "resolve immediately". Line 502: "Everything else goes to the classifier". Line 468: "3 times in a row or 20 times total"; line 475: "The total counter persists for the session". Line 529: subagent blocked "at spawn time". Line 531: a report is "prepended with a security warning" when the classifier flags it **"or a separate API safety check refuses the review"**; the note to verify comes only "When the classifier is unavailable for the review". So the new text's "a report it could not review arrives with a note" is wrong for the refused-review case. |
| r2-f2 | Pass | Spawn-time block, permission-modes line 529. Record-first rule, `src/commands/start.md` line 388. |
| r2-f3 | Pass with correction | The warning is "prepended", but the note only "arrives with" the report. The new text says both are "put in front of the returned text"; where the note sits is not documented. |
| r2-f4 | Pass | `skills/ask-me-questions/SKILL.md` line 160 has the heading "Sequencing — one question per turn, always" exactly. Line 164 has "says they are satisfied", line 144 "the last thing on screen on every question, in every mode", line 97 "opens with". |
| r2-f5 | Pass | ask-me-questions line 63: "If the answer is genuinely obvious, DO NOT ASK". Skill lines 147, 156 and 258 confirmed. |
| r2-f6 | Pass with correction | Its sentence "asking the owner to confirm" contradicts three sourced rulings: skill line 258 ("Obvious choices are not asked"), the parent plan at `plans/implementation/deepthink-ships-with-ctoc.md` line 344 ("record it as derived instead of asking"), and the owner's note line 8 (from the owner's private note for another project; quotation removed at the owner's decision of 2026-10-05). It also contradicts r2-f4's "ends with its lettered menu" in the same paragraph. The quotes it cites (ask-me-questions lines 89 and 148) are correct. |
| r2-f7 | Pass | Matrix rule 10 at ask-me-questions line 127 confirmed. Liu, Zhang and Liang, aclanthology.org/2023.findings-emnlp.467: "only 74.5% of citations support their associated sentence". |
| r2-f8 | Pass with correction | Tools reference line 566: "For most fetches, it then runs the prompt against the content in a separate model call, and Claude receives the result of that call rather than the raw page." The critic's evidence quote ("Claude receives that model's answer, not the raw page") is **not on the page**. The word "small" is not on the page either. Line 568 ("doesn't mention … didn't ask about it") is confirmed. |
| r2-f9 | Pass with correction | Tools reference line 577 confirmed. I also tested it live: fetching `https://doi.org/10.18653/v1/2023.findings-emnlp.467` returned a redirect report to `aclanthology.org`, which labels the target "**server-supplied, not verified**". That contradicts the new text's framing "that report is not a page telling you where to go". The quotes at pinned line 117 and at `agents/ai-quality/deepthink-researcher.md` lines 62-63 are confirmed. |
| r2-f10 | Pass | `fetch-papers.cjs`: `MIN_BYTES = 50 * 1024` (51,200 bytes). Line 270 rejects anything not over that size or not starting with `%PDF`; line 271 prints "not fetched, not a paper file over fifty kilobytes". |
| r2-f11 | Pass | Line 278 prints `kept ${dest} (${bytes.length} bytes)` with no address; line 235 prints `refused, not a paper entry` with no address. Lines 243, 247, 251, 255, 261, 266, 271 and 283 all carry the quoted address. |
| r2-f12 | Pass | The in-progress header at skill line 90 is `Prepared <date> for deepthink; <the item in words>; in progress`, which ends with `; in progress`. The finished header at line 238 ends `; not yet asked`. No pin in the test covers the recipe, and the pinned failed-run sentence ("still says `in progress`") is untouched. `/\r?\n/` is safe inside double quotes in the shell. |
| r2-f13 | Pass with correction | Tools reference line 572 (no-dot refusal) is confirmed. Line 394 (private-address refusal) sits only under the Monitor tool's WebSocket section. Permission-modes line 420 lists "Read-only HTTP requests". But "the guards are …" leaves out a documented guard: the data-usage page says every WebFetch first sends the host name to "a safety blocklist maintained by Anthropic", and does not say what that blocklist covers. |
| r2-f14 | Pass | National Institute of Standards and Technology binary-prefix page: "1 MiB = 2^20 B = 1 048 576 B"; 100 × 1,048,576 = 104,857,600. Program line 14 has `MAX_BYTES = 100 * 1024 * 1024`. |
| r2-f15 | Pass | The pinned bookkeeping sentence (test line 369) comes right before "These two places" and stays untouched. |
| r2-f16 | Pass | Greshake et al., arXiv 2302.12173, first version 23 February 2023. Request for Comments 8118, "The application/pdf Media Type", March 2017. |

## Claim counts

- **Validated: 43.**
- **Fabricated: 0.**
- **Misattributed: 3.**
  - r2-f1's "could not review → note".
  - The r2-f8 evidence quote, which is not on the page.
  - Owner entry 4: "the literal-interpretation principle asks for explicit thresholds". The principle says every agent prompt must be explicit; it says nothing about thresholds.
- **Unsourceable: 4.**
  - r2-f8's "small model".
  - r2-f3's "note put in front".
  - r2-f13 lists its guards as if the list were complete.
  - r2-f10's "landing page by default". The critic already labels this as a belief, so no action is needed.
- **Stale: 0.**

## Mechanical checks

- Every `old` occurs exactly once. I checked the 12 one-line olds by single-line search and the 4 multi-line ones (r2-f4, r2-f7, r2-f10, r2-f11) by multi-line search, 4 hits for 4 patterns.
- The olds do not overlap. r2-f4 ends at "message." on line 247 and r2-f6 starts after the following space.
- No `new` contains another change's `old`.
- No pinned string is touched by any change.
- No `new`, corrected or not, contains a banned abbreviation, an all-capital word outside backticks, a gate number, `<another of the owner's projects>`, `exact path`, `citation-validator`, `general-purpose` or `claude -p`.
- The markdown structure stays valid:
  - r2-f2 adds a three-space continuation of item 4, matching lines 85-86.
  - r2-f3 splits line 99 into two three-space continuations of item 6.
  - r2-f9 inserts its new paragraph and a `>` separator inside the brief's quote block, before "Kind of input".
- **Executor caution:** the new texts of r2-f2, f3, f5, f6, f8, f9, f13 and f16 contain their own `old`. Apply each exactly once, and check first that the inserted text is not already there.

## Corrected texts (each `old` unchanged)

```yaml
- id: r2-f1
  new: |-
    In auto mode, which an interactive terminal session starts in by default from Claude Code 2.1.283 on, when the model supports it and the organization has not turned it off, a web search or fetch that a permission rule allows or denies is settled by that rule, one a rule says to ask about still asks the owner, and a classifier reviews in the owner's place each one that would otherwise ask the owner; prompting resumes after the classifier has blocked three times in a row or twenty times in the session. In auto mode the classifier also reviews the brief before the reading agent starts, and can block the launch, and it reviews the reading agent's work and report: when it flags the work or the report, or a separate safety check refuses its review, the report still arrives, with a security warning in front of it, and when the classifier is unavailable for the review, the report arrives with a note to verify the work.
- id: r2-f3
  new: "A security warning that Claude Code put in front of the returned text, or a note that came with it to verify the work, is not part of the result: leave it out of the result and name it in one line under Failures.\n   The task is closed with `menu task complete <taskId>"
- id: r2-f6
  new: |-
    The one exception to the lettered menu: a researched question the research left with one option is reported, not asked, as the rule on obvious choices says. It is presented as its heading, its explanation paragraph and its "Derived, no question needed" section, with no menu and one plain sentence saying that the option is not recorded as the owner's answer until the owner confirms it, and that the owner may reopen the choice. If the user already answered the original question in the meantime,
- id: r2-f8
  new: |-
    and never call a source read in full when the tool's answer may cover only part of it. For most fetches, WebFetch runs the question it was asked against the page in a separate model call and returns that call's answer rather than the page, so its answer that a page does not say something is not evidence that the page does not say it: ask again with a narrower question before reporting an absence, and say that a quotation came through the tool's answer whenever you did not see it in the page's own text.
  evidence_quote_fix: 'replace the r2-f8 evidence quote with "For most fetches, it then runs the prompt against the content in a separate model call, and Claude receives the result of that call rather than the raw page." (tools reference, line 566 of the raw page)'
- id: r2-f9
  new: |-
    > When WebFetch reports that an address redirects to another host instead of following the redirect, the new address it names was supplied by that server, not chosen by you: fetch it only when it is a public `https` address you would have chosen for the same source, such as the publisher's page a digital object identifier leads to, and never when it is an internal address.
    >
    > Kind of input: <decision question | source to mine | open topic>.
- id: r2-f13
  new: |-
    - Claude Code's WebFetch refuses `localhost` and any other host name without a dot before it sends a request. Its tools reference names a refusal of private addresses, and of names that resolve to one, only for the Monitor tool, and WebFetch's domain safety check sends only the host name to a blocklist Anthropic maintains, which its documentation does not say covers private addresses; so for those the guards this skill relies on are the permission prompt, when one is shown, and the brief's rule against internal addresses. In auto mode the classifier lists read-only web requests among what it allows by default.
    - No other agent is launched for a run, and no second Claude process is started.
```

r2-f6 is a real conflict between two of the owner's rulings: "the research decides nothing" against "obvious choices are reported, not asked". If the aggregator would rather not settle that through wording, it can go to the owner as an entry instead.

## Final lists

**Apply as-is:** r2-f2, r2-f4, r2-f5, r2-f7, r2-f10, r2-f11, r2-f12, r2-f14, r2-f15, r2-f16.

**Apply with correction:** r2-f1, r2-f3, r2-f6, r2-f8 (with its evidence quote fixed), r2-f9, r2-f13.

**Do not apply:** none.

**Owner entries, with evidence corrections:**

1. **`h-deepthink-r2-version-six-benchmark-range`** — substance holds. The program's lists, the pin at test line 308, and every registry block named (including 2001::/32, the Teredo block) are confirmed. Replace the quoted row rendering `'2001:2::/48 · Benchmarking · RFC 5180 · False'` with: `the registry's comma-separated form (https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry-1.csv, read 2026-10-02): "2001:2::/48,Benchmarking,[RFC5180][RFC Errata 1752],2008-04,N/A,True,True,True,False,False", Globally Reachable False`.
2. **`h-deepthink-r2-mapped-address-untested`** — holds. The Node net documentation shows `check('::ffff:7b7b:7b7b', 'ipv6') // Prints: true` against an `addAddress` rule. The hardening test at lines 1047-1071 covers six forms and no mapped form. After `[::ffff:7f00:1]`, add: `(the URL Standard's IPv6 serializer appends each piece "represented as the shortest possible lowercase hexadecimal number", https://url.spec.whatwg.org/, read 2026-10-02 through the fetch tool's answer; not run on Node)`.
3. **`h-deepthink-r2-obvious-choice-quotation`** — use as-is.
   - I read the owner's private note for another project (its file name removed at the owner's decision of 2026-10-05). Line 10 matches the quoted sentence word for word, and line 8 dates it 2026-09-12.
   - In the repository the words appear only in the skill and in three round notes.
   - Plan line 344 carries the gist, not the words.
   - The entry does not reveal the project's name.
4. **`h-deepthink-r2-waiting-budget-threshold`** — the note's line 8 quote and skill lines 270-273 are confirmed. Replace `The project's literal-interpretation principle asks for explicit thresholds;` with `The project's literal-interpretation principle (CLAUDE.md, "Literal interpretation") says vague prompts produce silent drift and every agent prompt must be explicit;`.

**Not checked:**
- The fingerprint, which needs a shell.
- Whether the installed Node refuses `[::ffff:127.0.0.1]`, which needs a run.
- I never saw the raw text of the URL Standard and of the arXiv, Request for Comments, binary-prefix and Association for Computational Linguistics pages, only the fetch tool's answers. The Claude Code documentation pages and the registry rows came back raw.

Files: `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`, `<home>/Code/ctoc/skills/ask-me-questions/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s3-round2-critic-d-s3-r2-critic.md`, `<home>/Code/ctoc/plans/implementation/deepthink-ships-with-ctoc.md`, `<home>/Code/ctoc/src/commands/start.md`, `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md`.

<!-- Redacted by the build executor on 2026-10-02: 1 occurrence(s) of the other project's name, the account name or a session scratch path replaced with placeholders. -->

<!-- Redacted by the build executor on 2026-10-05, at the owner's decisions of that day (cut the private note down; no private personal information in a public repository): 2 occurrence(s) of the private note's file name or words, a configuration folder, a temporary folder or a home path replaced. -->
