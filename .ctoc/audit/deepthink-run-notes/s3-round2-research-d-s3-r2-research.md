I found no fabricated or misattributed citation in round 1's own corrections. The corrected auto-mode sentence holds at its source, apart from one imprecision. Round 2 found three new problems:

- **Auto mode reviews more than the skill says.** Under auto mode the launch and the reading agent's final report also pass a classifier review. The skill has no instruction for a launch that review blocks, or for a report that arrives with a security warning in front of it.
- **"Benchmark network" is only half true.** The program does not refuse the version six benchmarking range `2001:2::/48`, so the pinned sentence overstates it. This needs the owner.
- **One owner quotation has no source in the repository.** "choose the most obvious choice, with the algorithm do deepthink" appears only in the skill and one run note.

All 28 fetches were spent. Read date for everything is 2026-10-02. Quotes reached me through WebFetch's summarising model unless I say I read the PDF page myself. No fetched page carried an instruction aimed at the reader.

## (a) Queries
1. Claude Code permission-modes page: the auto-mode starting version, the classifier, the repeated-block thresholds, ask rules, subagents.
2. The two IANA special-purpose address registries (version four and version six).
3. RFC 9110: redirect loops, the old five-redirect note, relative `Location`.
4. RFC 6761 (`localhost`), RFC 6762 (`.local`), RFC 8375 (`home.arpa`).
5. Search on icann.org for the board reservation of `.INTERNAL`, then the resolution page.
6. NIST binary prefixes page (kibi, mebi).
7. ISO 32000-2 clause 7.5.2 file header: one search, the Library of Congress format page, the PDF Association's pdf-differences folder and its pdf-issues issue 815.
8. NIST AI 100-2 E2025 landing page; NIST AI 600-1 PDF, section 2.9.
9. Search on ncsc.gov.uk for "prompt injection is not SQL injection", then the blog post.
10. Greshake et al. (arXiv, and a search of dl.acm.org for the venue); Liu, Zhang and Liang (ACL Anthology); AgentDojo (NeurIPS proceedings); Walters and Wilder (Nature, then a PubMed search).
11. Search for the International Patient Decision Aid Standards, then that collaboration's 2012 Chapter I PDF; the 2013 BMC overview.
12. Local, read-only: the skill, both round-1 records, `skills/ask-me-questions/SKILL.md`, `fetch-papers.cjs`, `deepthink-researcher.md`, the plan's test (to see what is pinned), and the parent plan line 344.

## (b) Sources
| # | Address | What it establishes | Quote |
|---|---|---|---|
| S1 | https://code.claude.com/docs/en/permission-modes | Starting version; the order in which an action is decided; thresholds; subagent handling | "With Claude Code v2.1.283 or later, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions." / "Actions matching your allow, ask, or deny rules resolve immediately" / "Everything else goes to the classifier" / "Explicit ask rules still force a prompt." / "if the classifier blocks an action 3 times in a row or 20 times total, auto mode pauses and Claude Code resumes prompting" / "The total counter persists for the session" / "Before a subagent starts, the delegated task description is evaluated, so a dangerous-looking task is blocked at spawn time." / "When the classifier flags the subagent's work or report … the report is still delivered, prepended with a security warning." / "When the classifier is unavailable for the review, the report arrives with a note to verify the subagent's work" / "Requires a supported model, and your organization can turn auto mode off" |
| S2 | https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml | The version four classes | 100.64.0.0/10 "Shared Address Space" RFC 6598; 169.254.0.0/16 "Link Local" RFC 3927; 198.18.0.0/15 "Benchmarking" RFC 2544; 240.0.0.0/4 "Reserved" RFC 1112; 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 "Documentation" RFC 5737 |
| S3 | https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml | The version six classes | "2001:2::/48 · Benchmarking · RFC 5180 · False"; "2001:db8::/32 · Documentation · RFC 3849"; "3fff::/20 · Documentation · RFC 9637"; "100::/64 · Discard-Only Address Block"; "2001::/23 · IETF Protocol Assignments"; "fc00::/7 · Unique-Local · RFC 4193" |
| S4 | https://www.rfc-editor.org/rfc/rfc6761.html | `.localhost` | "The domain "localhost." and any names falling within ".localhost." are special" |
| S5 | https://www.rfc-editor.org/rfc/rfc6762.html | `.local` | "any fully qualified name ending in ".local." is link-local" |
| S6 | https://www.rfc-editor.org/rfc/rfc8375.html | `home.arpa` | "'home.arpa.' is designated for non-unique use in residential home networks." |
| S7 | https://www.icann.org/en/board-activities-and-meetings/materials/approved-resolutions-special-meeting-of-the-icann-board-29-07-2024-en | `.internal` | "Resolved (2024.07.29.06), the Board reserves .INTERNAL from delegation in the DNS root zone permanently to provide for its use in private-use applications." |
| S8 | https://physics.nist.gov/cuu/Units/binary.html | Kibi is 2^10 and mebi is 2^20, adopted by the IEC (the superscripts were lost in extraction) | "first adopted by the IEC as Amendment 2 to IEC International Standard IEC 60027-2" |
| S9 | https://www.loc.gov/preservation/digital/formats/fdd/fdd000474.shtml | The version 2.0 file signature; gives no byte offset | magic number "%PDF–2.0"; "The PDF Association announced in an April 2023 press release that it provides no cost downloads of the ISO 32000-2 (PDF 2.0) bundle." |
| S10 | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf, section 2.9, printed page 11 (I read the rendered page myself) | Indirect prompt injection and data theft | "Indirect prompt injection attacks occur when adversaries remotely (i.e., without a direct interface) exploit LLM-integrated applications by injecting prompts into data likely to be retrieved. Security researchers have already demonstrated how indirect prompt injections can exploit vulnerabilities by stealing proprietary data or running malicious code remotely on a machine." |
| S11 | https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection (8 December 2025, Dave Chismon) | The risk can be reduced, not removed; deterministic safeguards | "it's very possible that prompt injection attacks may never be totally mitigated in the way that SQL injection attacks can be." / "Design protections need to therefore focus more on deterministic (non-LLM) safeguards that constrain the actions of the system" |
| S12 | https://arxiv.org/abs/2302.12173 (venue from the dl.acm.org search listing 10.1145/3605764.3623985, AISec '23; that page was not opened) | Data theft through retrieved content | "LLM-Integrated Applications blur the line between data and instructions" |
| S13 | https://aclanthology.org/2023.findings-emnlp.467/ | How faithful citations are (peer-reviewed) | "a mere 51.5% of generated sentences are fully supported by citations" / "only 74.5% of citations support their associated sentence" |
| S14 | AgentDojo, NeurIPS 2024 Datasets and Benchmarks Track (proceedings page) | Defences are incomplete | "existing prompt injection attacks break some security properties but not all" |
| S15 | https://decisionaid.ohri.ca/IPDAS/ipdas-chapter-i.pdf (Stalmeier, Volk et al., 2012; read directly) | Balanced presentation of options | "all available options, which may include an option "to do nothing", are presented" / "Balance occurs when there is equal emphasis on presenting positive and negative information" / "the inclusion of a summary table of any kind in which the options are compared was associated with more subjects (ranging from 70% to 96%) judging the information as "balanced"" |

Fetches that produced no usable source:
- **RFC 9110:** truncated twice, so I have no verbatim text from sections 15.4 or 10.2.2.
- **NIST AI 100-2 landing page:** title and March 2025 date only.
- **pdf-differences and pdf-issues issue 815:** neither quotes clause 7.5.2.
- **Nature:** redirected to a login, 303.
- **BMC:** redirected (301), not followed.
- **Walters and Wilder** (55% and 18%): seen in a search summary only, so not used.

## (c) Verdicts on the current file
| Line | Claim | Verdict | Evidence |
|---|---|---|---|
| 60 | Web searches and fetches can ask the owner | VALIDATED | S1: "asks you before most actions that … reach the network" |
| 60 | Round 1's corrected auto-mode sentence (leftover 1): starting mode from 2.1.283 | VALIDATED | S1. Caveats: needs a supported model; the first session after an upgrade can differ |
| 60 | Same sentence: "a classifier reviews each request … unless a permission rule says to ask" | VALIDATED, imprecise | S1: an allow or deny rule settles a request before the classifier sees it, so not "each" request (see d1) |
| 60 | Same sentence: three in a row or twenty in the session | VALIDATED | S1, both quotes |
| 60 | "reduces the risk without removing it" | VALIDATED | S11, S10, S14 |
| 98 | Leftover 2: the menu is last in the question; Failures, paper list and closing line follow the whole result | VALIDATED as an order inside the brief | The order on screen conflicts with the decision-question format (see d4) |
| 85 | Leftover 3: the date is taken before the launch | VALIDATED | Wording consistent with step 5 |
| 129 | Leftover 4: name only the parts you can tell WebFetch did not return | VALIDATED | My own fetches of RFC 9110 came back truncated with a notice saying so |
| 107 | Leftover 5: the three section headings | VALIDATED | Exact matches at `skills/ask-me-questions/SKILL.md` lines 95, 131 and 146 |
| 145 | Matrix 129 wide, columns 20, 38, 38, 28 | VALIDATED | 124 + 5 vertical lines = 129 |
| 198 (pinned, test line 308) | `.local`, `.localhost`, `.home.arpa`, `.internal` | VALIDATED | S5, S4, S6, S7 |
| 198 | This machine, private, link-local, shared, multicast, reserved | VALIDATED | The program's lines 24–33 match S2 and S3 for each named class |
| 198 | "benchmark … network" | FABRICATED in part (low impact) | True for version four (198.18.0.0/15 is refused). The version six benchmarking block 2001:2::/48 (S3) is not in the program's list, so the sentence overstates what the program refuses. Severity critical under the contract; the practical risk is low, because the block is not globally reachable. |
| 198 | "more than five hops is not followed" | VALIDATED against the code | `MAX_HOPS = 5`; the loop runs hops 0 to 5. The RFC 9110 note was not read. |
| 200 | One hundred mebibytes | VALIDATED | S8, and `MAX_BYTES = 100*1024*1024` |
| 201 | Fifty kibibytes (51,200 bytes) | VALIDATED | S8, and `MIN_BYTES = 50*1024` with a `<=` refusal |
| 201 | Kept only when it begins with `%PDF` | VALIDATED | Round 1's RFC 8118, plus S9's signature |
| 201 | Same claim, read against ISO 32000-2 clause 7.5.2 itself | UNSOURCEABLE this round | The free copy sits behind a request form, and I saw the clause text only in a search snippet |
| 48 | "(Tijn, 2 October 2026)" on the ignore file | VALIDATED, internal | `fetch-papers.cjs` line 214: "the owner's ruling of 2026-10-02" |
| 260 and 265 | Owner rulings of 12 September 2026 | VALIDATED, internal | Parent plan `plans/implementation/deepthink-ships-with-ctoc.md` line 344 |
| 260 | Verbatim words "choose the most obvious choice, with the algorithm do deepthink" | UNSOURCEABLE in the repository | Present only in the skill and `.ctoc/audit/deepthink-run-notes/s3-round1-revalidate-d-s3-r1-revalidate.md` (a presence check only). The parent plan carries the gist, not the words. |

Other checks:
- **No web-derived text reaches a command.** The label and summaries are built from the checked slug, the agent identifier comes from the launch tool, and the paper list goes through the staging file written with the Write tool.
- **No order is impossible for the tools held.** Note: the reading agent can judge "never an internal address" only from the address text, because it has no name lookup.
- **Every round-1 leftover is cleared** except the "each request" imprecision.

## (d) Candidate improvements
I checked each skill string below against the test file; none is pinned.

**d1 (apply; the source is S1).** Current text:
"In auto mode, which an interactive terminal session starts in by default from Claude Code 2.1.283 on, a classifier reviews each request instead of the owner unless a permission rule says to ask, and prompting resumes after the classifier has blocked three actions in a row or twenty in the session."
Proposed:
"In auto mode, which an interactive terminal session starts in by default from Claude Code 2.1.283 on, a request that a permission rule allows or denies is settled by that rule, a rule that says to ask still asks the owner, and a classifier reviews every other request instead of the owner; prompting resumes after the classifier has blocked three times in a row or twenty times in the session."

**d2 (apply; the source is S1's section on subagents).** Add three sentences:
1. After the permission bullet ending "…twenty in the session.":
   "In auto mode the classifier also reviews the launch before the reading agent starts, and can block it, and reviews the reading agent's final report before the session reads it: a report it flags still arrives, with a security warning in front of it, and a report it could not review arrives with a note to verify it."
2. After step 6's sentence ending "…then close the task and give the one-line notice.":
   "A security warning or a note to verify that Claude Code puts in front of the returned text is not part of the result: leave it out of the result and name it in one line under Failures."
3. After the pinned launch-fence sentence in step 4:
   "If the launch is refused for any other reason, for example blocked by auto mode's classifier, close the task with `menu task fail` and the same summary, say in one line that the launch was refused and by what, write no brief file, and do not launch again until the owner says so."
   Why the last part: a repeated block counts toward the three-in-a-row threshold.

**d3 (apply; the source is ask-me-questions line 164).** Current text:
"Present the researched result in full once the question currently on the table has been answered, one question per message,"
Proposed:
"Present the researched result in full once the question currently on the table has been answered and the owner has said he is satisfied, as the decision-question format's section "Sequencing — one question per turn, always" requires, one question per message,"

**d4 (apply, or the critic chooses the wording; the source is ask-me-questions lines 97 and 144).** The problem: the format requires every question to open with its heading and end with the menu. "Present the researched result in full" leaves the Evidence summary and Failures with no lawful place on screen.
Add:
"When a researched question is presented, its message opens with the heading and ends with the lettered menu; what the Evidence summary and Failures change for the decision, including how many cited papers could not be fetched, goes into the explanation paragraph, and the brief file holds them in full."

**d5 (apply; sources S13 and S10's information-integrity passage).** Current text:
"For every kind: plain sentences, every term spelled in full, every number from a source or marked as a proposal to check,"
Proposed:
"For every kind: plain sentences, every term spelled in full, every claim taken from a source naming the place in it that states the claim (a section, a page or a short phrase), every number from a source or marked as a proposal to check,"
This matches the reading agent's own no-guesses rule.

**d6 (low priority; source ask-me-questions matrix rule 10).** Current text: "marked as a proposal to check". Proposed: "marked `[unverified]` in the matrix, as the decision-question format's matrix rule 10 requires, and listed in the new-ideas block as a proposal to check."

**d7 (low priority; source S8).** Current text: "past one hundred mebibytes counted after decompression". Proposed: "past one hundred mebibytes (104,857,600 bytes) counted after decompression", matching the kibibyte sentence.

**d8 (for the critic; if applied, the owner's list also gets an out-of-scope-file entry for `skills/ask-me-questions/SKILL.md`; source S15).** Current text: "two to four options". Proposed: "two to four options, one of them leaving things as they are whenever that is a real option". Matrix and symmetric pros and cons are already supported by S15.

**d9 (optional; sources S11 and S10).** Current text: "and the brief's rule against that reduces the risk without removing it". Proposed: add after it: "(the United Kingdom National Cyber Security Centre, 8 December 2025: prompt injection 'may never be totally mitigated')".

**d10 (owner list, pinned contract plus out-of-scope file `skills/deepthink/fetch-papers.cjs`).** The pinned sentence at test line 308 versus S3: the program refuses none of 2001:2::/48 (benchmarking), 2001:db8::/32 and 3fff::/20 (documentation, RFC 3849 and RFC 9637), 100::/64 (discard-only), or 2001::/23 (IETF protocol assignments, which includes 2001::/32, the Teredo block that carries a version four address). Options:
- **(a)** Add those blocks to the program; the sentence becomes exactly true. The program and its tests change.
- **(b)** Narrow the sentence to "a benchmark network of version four". A pinned text change, and the gap stays.

**d11 (owner list).** Line 260's quoted words have no source in the repository. Options:
- **(a)** The owner confirms the words as written.
- **(b)** Keep "(Tijn, 12 September 2026)" with a paraphrase and no quotation marks.

## (e) Not reached
- RFC 9110 section 15.4 (the old five-redirect note) and section 10.2.2 (relative `Location`): truncated twice.
- ISO 32000-2 clause 7.5.2 text at its source.
- NIST AI 100-2 E2025 body; ENISA.
- Walters and Wilder at the publisher.
- The Martin et al. 2021 balance update of the International Patient Decision Aid Standards, and research on how the order of options and defaults sway choices.
- WASP and InjecAgent.
- Whether WebSearch and WebFetch count as read-only actions that auto mode approves automatically.
- Whether Node's `net.BlockList` checks `::ffff:a.b.c.d` against version four rules; whether URL parsing turns number-form hosts into dotted form.
- Whether Claude Code's WebFetch itself refuses private addresses.

Files read: `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/skills/ask-me-questions/SKILL.md`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md`, `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`, `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/skills/deepthink/SKILL.md.json`, `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json`, `<home>/Code/ctoc/plans/implementation/deepthink-ships-with-ctoc.md`.
