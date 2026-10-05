# Round 1 research-gaps pass for `skills/deepthink/SKILL.md`, all sources read 2 October 2026

**Bottom line:** four of the skill's claims need correcting.

1. **The redirect claim is false in one case.** The skill says "a hop that is not is never requested". The program checks a host name with one name lookup, then `fetch()` looks the name up again. A name that answers a public address at the check and an internal address at the connection is still requested. This sentence is pinned by the test file, so the fix is for the human.
2. **"Downloaded and verified" claims more than the program checks.** The program only checks that the file starts with `%PDF` and is larger than 51,200 bytes. It never checks that the file is the cited paper.
3. **The reading agent cannot do what its brief orders.** The brief says "read the source itself completely first", but the reading agent only has WebFetch. WebFetch returns a small model's answer about the page. An open report on Anthropic's issue tracker says it also cuts long pages off without marking the cut.
4. **The date is the universal-time day, not the owner's day.** The reading agent is also told to note read dates but is never given today's date.

Five claims hold up: the CommonJS claim, the `fetch()` redirect behaviour the program relies on, the header check accepting every standard PDF, the five-hop count, and getting the date from a command.

**About the network error:** none of my tool results showed ENOTFOUND. The failures I saw were 403 from `openai.com` and `openpreservation.org`, and 404 from three Adobe addresses. I continued from where I stopped and fetched nothing new after your message.

**Budget:** I made 18 fetch calls against the budget of about 14 (one was a cached repeat) and stopped at 23 turns. I did not read the Gemini or Perplexity documentation.

## (a) Queries

1. `arXiv deep research agents benchmark citation accuracy evaluation 2025`
2. `PDF header "%PDF-" within first 1024 bytes ISO 32000 PDF Association`
3. `undici fetch redirect manual returns actual response location header Node.js deviates from spec`
4. `OpenAI deep research citations hallucinate limitations "deep research" introducing`
5. `Adobe PDF Reference implementation note "Acrobat viewers require only that the header appear somewhere within the first 1024 bytes"`
6. `Claude Code WebFetch tool large pages truncated summarized small fast model content limit`
7. `Anthropic Claude Research feature citations "Research" agentic search announcement`

Local checks (only to see whether a string is present): `tests/deepthink-ships-with-ctoc.test.js` for pinned strings; `package.json` for `engines` and `"type"`; `src/` for `toISOString().slice(0, 10)`.

## (b) Sources

**Item 1: deep-research assistants and the papers that evaluate them**

- **https://arxiv.org/abs/2604.03173** — Rao, Wong and Callison-Burch, "Detecting and Correcting Reference Hallucinations in Commercial LLMs and Deep Research Agents", submitted 3 April 2026. The abstract says:
  - "3--13% of citation URLs are hallucinated"
  - "5--18% are non-resolving overall"
  - "Deep research agents generate substantially more citations per query than search-augmented LLMs but hallucinate URLs at higher rates"
  - "models equipped with urlhealth reduce non-resolving citation URLs by 6--79× to under 1%"
  - This establishes that checking whether a cited address resolves is the main lever against made-up addresses.
- **https://arxiv.org/abs/2506.11763** — Du, Xu, Zhu, Wang and Mao, "DeepResearch Bench: A Comprehensive Benchmark for Deep Research Agents", 13 June 2025. Its framework evaluates an agent by "its effective citation count and overall citation accuracy". This establishes that whether a citation supports its claim is measured separately from whether the citation exists.
- **https://www.anthropic.com/engineering/multi-agent-research-system** — Anthropic, 13 June 2025.
  - It describes "The CitationAgent, which processes the documents and research report to identify specific locations for citations".
  - On failures: "our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs".
  - Its judge criteria include "citation accuracy (do the cited sources match the claims?)" and "source quality (did it use primary sources over lower-quality secondary sources?)".
  - On human testing: "people testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases."
- **https://openai.com/index/introducing-deep-research/** — returned 403 Forbidden and could not be read. I am not crediting the search engine's summary of its limitations section.
- **Not read:** Gemini Deep Research, Perplexity Deep Research, and the other benchmarks the search returned (ResearcherBench 2507.16280, BrowseComp-Plus 2508.06600, ReportBench). Those arXiv ids came from search results and I did not open their abstract pages.

**Item 2: the PDF header**

- **https://www.rfc-editor.org/rfc/rfc8118.html** — RFC 8118, March 2017. Its "Magic number(s)" field says: "All PDF files start with the characters "%PDF-" followed by the PDF version number, e.g., "%PDF-1.7" or "%PDF-2.0". These characters are in US-ASCII encoding."
- **https://kb.datalogics.com/article/is-there-a-simple-way-to-identify-a-file-as-being-a-pdf-9.html** — Datalogics knowledge base (Datalogics sells the Adobe PDF Library).
  - "The first line of every PDF document is a file header with the characters "%PDF-" followed by a version number"
  - "the "%PDF-" string is not required to be at the beginning of the file"
  - "Prior versions of Acrobat and APDFL required the "%PDF-" declaration to be within the first 1024 bytes of the file, but that arbitrary restriction has been removed."
- **Could not read:** the ISO 32000-1 text in section 7.5.2, and Adobe's note "Acrobat viewers require only that the header appear somewhere within the first 1024 bytes". Three Adobe addresses returned 404 and openpreservation.org returned 403. I have the Adobe sentence only as a search-result snippet.

**Item 3: Node's built-in `fetch()` and `.cjs` files**

- **https://nodejs.org/api/globals.html** — `fetch()` was "Added in: v17.5.0, v16.15.0". Its history says: "v18.0.0 No longer behind `--experimental-fetch` CLI flag." and "v21.0.0 No longer experimental." The page also says "The implementation is based upon undici".
- **https://undici.nodejs.org/** (the undici README) — "Since it is not possible to manually follow an HTTP redirect on the server-side, Undici returns the actual response instead of an `opaqueredirect` filtered one when invoked with a `manual` redirect."
- **https://undici.nodejs.org/api/Fetch** — lists `redirect` as `'error'`, `'follow'` or `'manual'`. It gives no default mode and no maximum number of redirects.
- **https://nodejs.org/api/packages.html** — "Files ending with `.cjs` are always loaded as CommonJS regardless of the nearest parent `package.json`."

**Item 4: `toISOString`**

- **https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString** — "The timezone is always UTC, as denoted by the suffix `Z`."

**Item 5: checking an address separately from requesting it**

- **https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html**
  - "Unfortunately here, the application is still vulnerable to the `DNS pinning` bypass mentioned in this document. Indeed, a DNS resolution will be made when the business code will be executed."
  - The cheat sheet also advises retrieving "all the IP addresses behind the domain name provided (taking records _A_ + _AAAA_ for IPv4 + IPv6)".
  - On redirects: "Disable the support for the following of the redirection in your web client in order to prevent the bypass of the input validation."

**Item 6: WebFetch on long pages**

- **This runtime's own WebFetch tool description**, which I can see directly: "Fetches a URL, converts the page to markdown, and answers `prompt` against it using a small fast model."
- **https://github.com/anthropics/claude-code/issues/95127** — opened 17 September 2026, open, labelled `bug` and `has repro`, with no maintainer reply. It is a user report, not documentation.
  - "the tool's own boundary note reported returning 39,415 of 502,907 characters — 7.8% of the document"
  - "Nothing in the tool result carries that forward as a flag, so the calling model sees an answer about 7.8% of a document presented exactly like an answer about all of it."
- The sources disagree on the size limit. A third-party post I did not read (mikhail.io) is summarised in the search results as 100 KB, while the issue measures about 39.4 thousand characters. I found no official documentation of the limit.
- **Seen in this run:** asked for an exact quote, the small model first returned a paraphrase of the OWASP page under a heading it made up. Only a second, sharper request returned the exact sentence.

## (c) Verdicts on the skill's claims

1. **"Only `https` addresses are requested, and every hop of a redirect must be `https` and not an internal address; a hop that is not is never requested."** (line 194, pinned by the test at line 258)
   - **Verdict:** contradicted in one case. This is a claim about how the program behaves, not a citation, so the verdict classes fit loosely. The nearest is FABRICATED.
   - **Why:** `isInternalHost` looks the name up with `dns.lookup`, then `fetch(current, …)` looks it up again on its own. OWASP names exactly this gap. Severity high. **For the human.**
2. **"…or a name any of whose addresses is one of those"** (line 195, pinned by the test at line 308)
   - **Verdict:** VALIDATED, but only at the moment of the check. It matches OWASP's advice to look up every A and AAAA record.
3. **"A redirect chain of more than five hops is not followed"**
   - **Verdict:** VALIDATED against the code. The loop over `hop` from 0 to 5 allows the first request plus five redirects; a sixth redirect gives `too many redirects`.
   - This relies on `redirect: 'manual'` returning the 3xx response with a readable `Location` header, which the undici README confirms.
   - Gap: the test replaces `fetch` with a stub (`new Response(null, { status: 302, … })`), so the real undici behaviour is never exercised. The documentation is the only evidence.
4. **"The program is a CommonJS file (`.cjs`), so it also runs in a project whose `package.json` declares `"type": "module"`."** (lines 192–193)
   - **Verdict:** VALIDATED by the Node packages documentation.
   - Note: since the program now "run[s] where it stands", the `package.json` that governs it is the plugin's own, which has no `"type"` field. The project's `package.json` never governs it. The sentence is true but its "so" no longer carries the weight. No change needed.
5. **"A file is kept only when it begins with `%PDF` and is larger than fifty kilobytes"** (line 198, not pinned)
   - **Verdict:** VALIDATED as a description of the code, with two details.
   - First, the code compares 4 bytes (`%PDF`). The signature in RFC 8118 is 5 bytes (`%PDF-`).
   - Second, `MIN_BYTES = 50 * 1024` is 51,200 bytes. That is fifty kibibytes, while the same paragraph says "mebibytes" for the size cap.
   - On the question asked: a byte-0 check accepts every PDF that follows the standard ("All PDF files start with…"). It rejects files with bytes before the header that Adobe readers accept ("not required to be at the beginning of the file"), and wrongly reports them as "not a paper file over fifty kilobytes".
6. **"Every cited paper is downloaded and verified"** (line 256, not pinned)
   - **Verdict:** says more than the program does. The program checks only the first bytes and the size (line 196, pinned by the test at line 260). It never checks that the file is the cited paper or that the paper supports the claim.
   - DeepResearch Bench and Anthropic both treat citation accuracy as a separate measure. Severity high.
7. **"read the source itself completely first"** (brief, item 1, line 128, not pinned)
   - **Verdict:** the reading agent cannot do this reliably. Its only reading tool returns a small model's answer, and may cut the page off without saying so (open report, with reproduction steps).
8. **`node -e "console.log(new Date().toISOString().slice(0, 10))"`** (line 94, not pinned)
   - **Verdict:** gives the universal-time calendar day (MDN). In Central European Summer Time it gives yesterday's date between 00:00 and 02:00. West of Greenwich it gives tomorrow's date in the evening.
   - Six `src/` files (nine occurrences) use the same universal-time day, so changing it is a convention choice.
9. **"Note the date each source was read."** (brief, item 1)
   - **Gap:** the brief never gives the reading agent today's date, and it has no command to get one. The date would come from its memory, which the honest-status rule forbids.
10. **Not a claim, for information:** `package.json` has `"node": ">=18"`. `fetch()` has been available without a flag since 18.0.0, but the documentation marks it experimental until 21.0.0.

## (d) Candidate improvements

1. **For the human (pinned string, and a change to `fetch-papers.cjs`).** Close the gap between checking an address and requesting it.
   - Current text: "every hop of a redirect must be `https` and not an internal address; a hop that is not is never requested."
   - Fix: do the check inside the connection's own name lookup. Use `https.request` with a `lookup` option that runs `dns.lookup` and refuses internal addresses, so the check and the connection use the same lookup. This needs no new dependency. That the `lookup` option exists is from memory; I did not read the Node `net` documentation this pass.
   - Side effect: `https.request` does not decompress, so "counted after decompression" would change too.
   - If the code stays as it is, correct the text instead, for example: "…is never requested on the address the check saw; a name that answers differently between the check and the request is not caught."
   - Source: the OWASP cheat sheet.
2. **In this file, not pinned.**
   - Current text: "Every cited paper is downloaded and verified; a claim whose paper could not be fetched is marked `[paper not fetched]`."
   - Change to: "Every cited paper is downloaded and checked to be a PDF file of plausible size; the check does not prove the file is the cited paper or that it supports the claim; a claim whose paper could not be fetched is marked `[paper not fetched]`."
   - Sources: the code at line 270; DeepResearch Bench; Anthropic's "do the cited sources match the claims?"
3. **In this file, not pinned.**
   - Current text: "For a source to mine, read the source itself completely first, then the literature around it."
   - Change to: "For a source to mine, read the source itself first, part by part, as far as the fetch tool returns it; name under Failures every part the tool did not return, and never describe a source as read in full when the tool's answer may cover only part of it."
   - Sources: the WebFetch tool description; issue 95127.
4. **In this file, not pinned.** Give the reading agent the date.
   - Run the date command before the launch (step 4) rather than in step 5.
   - Add to the brief: "Today's date, from the session's command: <date>. Use it as the read date of every source; never write a date from memory."
   - Source: the honest-status rule. Nothing outside the skill was needed for this.
5. **Owner decision, presented flat.** Which day the date is.
   - Option A: keep universal time to match the six `src/` files, and say so: `Prepared <date, universal time> for deepthink; …`.
   - Option B: the owner's local day: `node -e "console.log(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))"`.
   - Source: MDN.
6. **For the human (a change to `fetch-papers.cjs`; the pinned output string "fifty kilobytes" would change).**
   - Check all 5 header bytes (`%PDF-`), as RFC 8118 states the signature.
   - Either state "51,200 bytes" or set `MIN_BYTES = 50_000` so the code and the words "fifty kilobytes" agree.
   - Whether to also accept a header within the first 1024 bytes is a quality trade-off. It would recover files Adobe opens but that break the standard, at the cost of accepting files with a prefix. The evidence supports keeping the check at byte 0.
7. **For the human (a change to `fetch-papers.cjs`).**
   - Current text: "Web sources cited, not papers" are written to the index without ever being requested.
   - Change: run each page address through the same https and internal-address rules plus a status check, and mark pages that do not resolve.
   - Source: Rao and others, "5--18% are non-resolving overall" and "to under 1%" with checking.
8. **Optional, in this file.**
   - Current text: "Prefer primary sources."
   - Change to: "Prefer primary sources, and never rank a source by its position in search results."
   - Source: Anthropic, "consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs".

## Risk and unchecked items

- Everything I have marked as from memory was not checked this session: the `lookup` option, undici decompressing response bodies, and the Fetch Standard's limit of 20 redirects.
- The ISO 32000 wording and the Adobe 1024-byte note were not read first-hand.
- The OpenAI, Gemini and Perplexity documentation were not read.
- The WebFetch cut-off figure comes from one user's open bug report, not from documentation.

Sources:
- [Detecting and Correcting Reference Hallucinations in Commercial LLMs and Deep Research Agents](https://arxiv.org/abs/2604.03173)
- [DeepResearch Bench](https://arxiv.org/abs/2506.11763)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [RFC 8118](https://www.rfc-editor.org/rfc/rfc8118.html)
- [Datalogics: identifying a PDF](https://kb.datalogics.com/article/is-there-a-simple-way-to-identify-a-file-as-being-a-pdf-9.html)
- [Node.js globals: fetch](https://nodejs.org/api/globals.html)
- [undici README](https://undici.nodejs.org/)
- [undici Fetch API](https://undici.nodejs.org/api/Fetch)
- [Node.js packages](https://nodejs.org/api/packages.html)
- [MDN toISOString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Claude Code issue 95127](https://github.com/anthropics/claude-code/issues/95127)

Files: `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`
