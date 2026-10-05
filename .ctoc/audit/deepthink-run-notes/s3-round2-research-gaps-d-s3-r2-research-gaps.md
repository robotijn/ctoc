I found no fabricated or misattributed citation in the parts I covered. Every skill claim these five items touch holds, apart from one narrow gap in the paper program, which goes to the owner.

- **Relative redirects:** the program resolves a relative `Location` against the address it just requested, as RFC 9110 requires.
- **Number-form hosts:** these cannot get past the internal-address check. The URL parser turns them into dotted form before the program reads `hostname`.
- **IPv4-mapped IPv6 addresses:** Node's documentation says these match IPv4 rules. No test in the repository proves it for the subnet rules the program uses.
- **Auto mode:** WebFetch and WebSearch are not read-only actions that auto mode approves on its own; they go to the classifier. WebFetch itself refuses only host names without a dot.
- **ISO 32000-2 clause 7.5.2:** not reached.

Used 12 fetches and 7 searches. Read date for everything is 2026-10-02. I say for each quote whether I read the page myself or got it through a summarising model or the search tool. Each code.claude.com page opens with a banner telling the reader to fetch a documentation index; I treated it as page content and did not act on it. No other page carried an instruction.

## (a) Queries
1. RFC 9110 plain text: section 15.4 note and section 10.2.2. Then two searches limited to rfc-editor.org, ietf.org and httpwg.org for the exact sentences.
2. Node `doc/api/net.md` (BlockList), Node `src/node_sockaddr.cc`, and the WHATWG URL spec (IPv4 parser and the host-parsing table, two prompts).
3. code.claude.com pages: `permission-modes`, `tools-reference`, `permissions`, `data-usage`.
4. A search for ISO 32000-2 clause 7.5.2.
5. Searches for Martin et al. 2021 and Johnson & Goldstein 2003. Fetched the SAGE page (blocked) and the PubMed Central copy of Davidai, Gilovich & Ross 2012.
6. Extra, because item 2 asks whether the check can be bypassed: the OWASP Server-Side Request Forgery cheat sheet.
7. Local, read-only: `SKILL.md`, `fetch-papers.cjs`, the round-2 report, and exact-string checks on the plan's test file.

## (b) Sources
| # | Address | How it reached me | Exact quote |
|---|---|---|---|
| T1 | https://code.claude.com/docs/en/tools-reference | Raw page, I read it | "WebFetch refuses `localhost` and any other hostname without a dot, such as a bare intranet name, before making a request." / "Large pages are truncated to a fixed character limit before processing." / "For most fetches, Claude receives that model's answer, not the raw page." / "a result that says a page doesn't mention something may only mean the prompt didn't ask about it." / "When a URL redirects to a different host, WebFetch returns a text result that names the original URL and the redirect target instead of following it." / "The `auto` and `bypassPermissions` permission modes skip the prompt, except for a domain an explicit `ask` rule matches." / "a built-in set of preapproved documentation domains that fetch without a prompt" / "saves a `WebFetch(domain:...)` allow rule for that domain to `.claude/settings.local.json` for that repository" |
| T1b | Same page, Monitor WebSocket section (not WebFetch) | Raw page | "Claude Code denies URLs that point at a private, link-local, or cloud-metadata address, including hostnames that resolve to one." This sits under the WebSocket watch, not under WebFetch. |
| T2 | https://code.claude.com/docs/en/permission-modes | Raw page | "2. Read-only actions and file edits in your working directory are auto-approved…" / "3. Everything else goes to the classifier" / "Reads and working-directory edits outside protected paths skip the classifier, so the overhead comes mainly from shell commands and network operations." / Allowed by default: "Read-only HTTP requests" / "Tool results are stripped from those requests, so hostile content in a file or web page can't manipulate the classifier directly." |
| T3 | https://code.claude.com/docs/en/permissions | Raw page | Table rows: "Read-only \| File reads, Grep \| No…"; "Web fetch \| WebFetch \| Yes, except a built-in set of preapproved documentation domains \| Permanently per repository and domain"; "Web search \| WebSearch \| Yes \| Permanently per repository" |
| T4 | https://code.claude.com/docs/en/data-usage | Raw page | "Before fetching a URL, the WebFetch tool sends the requested hostname to `api.anthropic.com` to check it against a safety blocklist maintained by Anthropic." |
| N1 | https://raw.githubusercontent.com/nodejs/node/main/doc/api/net.md | Summarising model | "// IPv6 notation for IPv4 addresses works:" / "console.log(blockList.check('::ffff:7b7b:7b7b', 'ipv6')); // Prints: true" / "console.log(blockList.check('::ffff:123.123.123.123', 'ipv6')); // Prints: true". The rule in that example comes from `addAddress('123.123.123.123')`. |
| N2 | https://raw.githubusercontent.com/nodejs/node/main/src/node_sockaddr.cc | Summarising model | `is_match_ipv4_ipv6` compares the mapped prefix and then `memcmp(ptr + sizeof(mask), &check_ipv4->sin_addr, sizeof(uint32_t))`. `in_network_ipv4_ipv6` uses `uint8_t ip_mask[16] = {0,…,0, 0xff, 0xff, 0, 0, 0, 0};`. The opposite direction (a mapped IPv6 address checked against an IPv4 subnet) was **not returned**. |
| W1 | https://url.spec.whatwg.org/ | Summarising model, two prompts | Hex: "the first two code points are either `0X` or `0x` … Set R to 16." / Octal: "the first code point is U+0030 (0) … Set R to 8." / "If asciiDomain ends in a number: … Return the result of IPv4 parsing asciiDomain." / "Let ipv4 be the last item in numbers." / Host table rows: `0` → `0.0.0.0`, `0xffffffff` → `255.255.255.255` / "If host is an IPv4 address, return the result of running the IPv4 serializer on host." |
| R1 | rfc-editor.org / httpwg.org (RFC 9110) | **Search tool only**; WebFetch cut the text off at section 6.4.2 | Section 10.2.2: "When it has the form of a relative reference ([URI], Section 4.2), the final value is computed by resolving it against the target URI ([URI], Section 5)." / Section 15.4: "A client SHOULD detect and intervene in cyclical redirections (i.e., "infinite" redirection loops)." / "An earlier version of this specification recommended a maximum of five redirections ([RFC2068], Section 10.3)." |
| P1 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3458339/ (Davidai, Gilovich, Ross, PNAS 2012, volume 109, issue 38, pages 15201–15205; peer-reviewed) | Summarising model | "Rates of participation in organ donation programs are known to be powerfully influenced by the relevant default policy in effect ("opt-in" vs. "opt-out")." / "The difference in organ donation rates—typically exceeding 90% in opt-out countries and failing to reach even 15% in opt-in countries—astonishes most readers." |
| O1 | https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html | Summarising model | "Use the output value of the method/library as the IP address to compare against the allowlist." / "the application is still vulnerable to the `DNS pinning` bypass" |

## (c) Verdicts on the skill's claims (current text, word for word)
| Line | Current text | Verdict | Evidence |
|---|---|---|---|
| 60 | "The reading agent's web searches and fetches can ask the owner for permission in this session" | VALIDATED | T3 table rows |
| 60 | "No prompt reaches the owner for a fetch from a documentation site Claude Code approves in advance, or once the owner has allowed web searches, or fetches from a site, without asking again, which lasts for the repository." | VALIDATED | T3: "Permanently per repository" and "…per repository and domain"; T1: preapproved domains and `.claude/settings.local.json` "for that repository" |
| 60 | "a classifier reviews each request instead of the owner unless a permission rule says to ask" | VALIDATED for WebFetch | T1: auto mode "skip[s] the prompt, except for a domain an explicit `ask` rule matches". T2: only read-only actions skip the classifier at step 2, and T3 puts WebFetch and WebSearch outside the read-only class. Round 2's wording fix for allow and deny rules still stands; this adds evidence for it. For WebSearch the routing is my inference from T2 and T3, medium confidence, because no page names WebSearch in the classifier section. |
| 129 (brief) | "name under Failures every part you can tell WebFetch did not return, and never call a source read in full when the tool's answer may cover only part of it" | VALIDATED | T1 truncation and summarising-model sentences |
| 117 (pinned, test line 281) | "never an internal address" | An instruction, not a claim | T1 and T1b: WebFetch documents refusing only host names without a dot, and the private-address refusal belongs to Monitor. So this rule is the only written guard against numeric private addresses, and T2 shows the auto-mode classifier allows read-only HTTP requests by default. See candidate 1. |
| 197 (pinned, test line 258) | "every hop of a redirect must be `https` and not an internal address; a hop that is not is never requested." | VALIDATED against the code, with one caveat | `fetch-papers.cjs` lines 73–76 check every hop before calling `fetch`. Caveat: the name is looked up twice (see owner item 1). |
| 198 (pinned, test line 308) | "A redirect chain of more than five hops is not followed" | VALIDATED against the code | `MAX_HOPS = 5` and the loop runs hops 0–5. R1: the five-redirect figure is the old RFC 2068 advice, and a fixed count does satisfy "detect and intervene". The skill cites no RFC, so no change. |
| 198 (pinned) | "or a name any of whose addresses is one of those" | VALIDATED against the code | Line 63: `found.some(...)` over `lookup(host, { all: true })` |
| 201 | "A file is kept only when it begins with `%PDF`" | VALIDATED against the code | Line 270. ISO 32000-2 clause 7.5.2 not reached; the skill does not cite it, so there is no citation finding. |
| 169 | "an owner decision (what to build first, how much risk to accept, proceed or hold) is presented flat, with no Recommended cell" | Supported, no change | P1: a default option sways choices strongly, which supports keeping a recommendation off decisions that belong to the owner |

## (d) Answers on the program
1. **Relative `Location`: yes.** Line 80, `current = new URL(location, current).href;`, resolves against the address just requested, which is that hop's target address in R1's terms. RFC 9110 also says a fragment carries over to the new address. That does not matter here, because a fragment is never sent in a request.
2. **IPv4-mapped IPv6 addresses: not a bypass, but not proven by a test** (high confidence, from documentation only).
   - The URL parser writes `[::ffff:10.0.0.1]` in the hex form `[::ffff:a00:1]`. The program removes the brackets and checks the address as IPv6. N1 shows that exact hex form matching an IPv4 rule.
   - The program's own IPv6 list holds `['::ffff:0:0:0', 96]`, which is the translated form, not the mapped form `::ffff:0:0/96`. So refusing a mapped address depends entirely on Node's matching.
   - N1's example uses an `addAddress` rule. The C++ path for a mapped address checked against an `addSubnet` IPv4 rule did not come back in N2. The test file checks `[::ffff:0:7f00:1]` and others (lines 1049 and 1067), but not the mapped form.
3. **Number-form hosts: not a bypass.**
   - W1: when a host ends in a number, the URL parser reads it as IPv4, taking hex after `0x` and octal after a leading `0`. One number becomes the whole address, and the result is written as dotted decimal (`0xffffffff` → `255.255.255.255`).
   - So `2130706433`, `0x7f.1` and `017700000001` all reach `hostname` as `127.0.0.1`, and `net.isIP` sends them to the IPv4 rules. This is O1's rule: compare the parser's output, not the raw text.
   - The check and `fetch` both use this same parser, so they cannot read the same address differently.
4. **A residual gap (my own reading of the code; strength is my belief, not a source):** line 75 looks the name up with `dns.lookup`, and then `fetch` on line 76 looks it up again on its own. A name whose answer changes between the two lookups (O1 calls this the "DNS pinning" bypass) gets a connection to an internal address. HTTPS limits the damage: the internal server's certificate will not match the attacker's host name, so the TLS handshake fails before any HTTP request is sent. That protection is gone if `NODE_TLS_REJECT_UNAUTHORIZED=0` is set.

## (e) Candidate improvements (skill text; I checked the anchor text of both against the test file and neither is pinned)
1. **Line 60.** Anchor: "No prompt reaches the owner for a fetch from a documentation site Claude Code approves in advance, or once the owner has allowed web searches, or fetches from a site, without asking again, which lasts for the repository." Add after it:
   "Claude Code's WebFetch refuses `localhost` and any other host name without a dot before it sends anything; its documentation names no refusal of a private address written as numbers, or of a name that resolves to one, so for those the brief's rule against internal addresses is the only stated fence, and in auto mode the classifier allows read-only web requests by default."
   Sources: T1 and T2.
2. **Line 129, inside the brief.** Anchor: "and never call a source read in full when the tool's answer may cover only part of it." Add after it:
   "WebFetch answers through a small model that reads the page for the question it was asked, so an answer that a page does not say something is not evidence that it does not: ask again with a narrower question before reporting an absence."
   Source: T1. This run confirms it: the first WHATWG prompt said the example table was missing, and a narrower second prompt returned it.

## (f) For the human (options shown flat; these are the owner's calls)
1. **Two name lookups before a connection.**
   - Kind: pinned-contract (test line 258 pins skill line 197) and out-of-scope-file `skills/deepthink/fetch-papers.cjs`.
   - (a) Refuse an internal answer from the lookup the connection itself uses. The standard library's `https.request` takes a `lookup` function; that this exists is my belief, not checked this run. Cost: `download` is rewritten, decompression and the size cap are redone by hand with `zlib`, and new tests are needed.
   - (b) Narrow the pinned sentence: the check happens when the name is looked up, and a name whose answer changes before the connection is not caught (the certificate check then stops the request). Cost: the pinned text changes in the skill and the test; the gap stays.
   - (c) Leave it as it is. Cost: none; the sentence overstates by this one case.
2. **No test proves a mapped address is refused.**
   - Kind: out-of-scope-file `tests/deepthink-ships-with-ctoc.test.js`, and for option (b) also `fetch-papers.cjs`.
   - (a) Add test cases for `https://[::ffff:127.0.0.1]/…` and `https://[::ffff:10.0.0.1]/…` that expect `not fetched, an internal address`. Cost: two test cases, no change to the program.
   - (b) Also add `['::ffff:0:0', 96]` to the program's IPv6 list, so the refusal no longer depends on Node's matching. Cost: a program change and a test. Public addresses written in mapped form would be refused too; paper links do not use that form (my belief).
   - (c) Leave it. Cost: none; the refusal rests on documented but untested Node behavior.

## (g) Not reached or degraded
- **RFC 9110 sections 15.4 and 10.2.2:** WebFetch cut the RFC off at section 6.4.2 (T1 documents that truncation). The quotes in R1 come from the search tool on the RFC's own domains, not from a page I read, and both searches share the same search engine.
- **ISO 32000-2 clause 7.5.2:** not reached. One search summary says PDF/A-4 clarifies that the header begins at byte zero; I did not open that page and did not use it.
- **Johnson & Goldstein 2003 (Science 302, 1338):** search listing only, page not opened. **Martin et al. 2021:** the SAGE page returned 403 Forbidden, so P1 stands in for both.
- **Node C++:** the function that checks a mapped address against an IPv4 subnet did not come back.

## Findings (dispatch response)
- **info, citation-validated:** skill line 60, three claims; `citations.brief_url` T1 and T3; keep.
- **info, citation-validated:** skill line 129; T1; keep.
- **info, validated against code:** skill lines 197, 198 and 201; `fetch-papers.cjs` lines 63, 73–80 and 270; keep. Confidence high; reason: code read directly, with W1 and N1 for the parser and BlockList behavior.
- **info, observation:** skill line 197 (pinned), the double lookup; owner item 1.
- **info, observation:** the mapped-address refusal has no test; owner item 2.
- **high, citation-unsourceable (as standard text only, not a claim the skill makes):** ISO 32000-2 clause 7.5.2, and RFC 9110 sections 15.4 and 10.2.2 as read text. The skill needs no change, because it does not cite either.

Files read:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/skills/deepthink/fetch-papers.cjs
- <home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s3-round2-research-d-s3-r2-research.md
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js (exact-string checks only)

Sources:
- [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference)
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code data usage](https://code.claude.com/docs/en/data-usage)
- [Node net.md](https://raw.githubusercontent.com/nodejs/node/main/doc/api/net.md)
- [Node node_sockaddr.cc](https://raw.githubusercontent.com/nodejs/node/main/src/node_sockaddr.cc)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Davidai, Gilovich, Ross 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3458339/)
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Martin et al. 2021 (403, not read)](https://journals.sagepub.com/doi/full/10.1177/0272989X211021397)
- [Johnson & Goldstein 2003 (not opened)](https://www.science.org/doi/10.1126/science.1091721)
- [Library of Congress PDF 2.0 page (search result only)](https://www.loc.gov/preservation/digital/formats/fdd/fdd000474.shtml)
