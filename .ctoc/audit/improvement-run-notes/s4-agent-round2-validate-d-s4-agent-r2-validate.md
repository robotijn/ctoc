**Validation of the round-2 replacement text for `agents/ai-quality/hallucination-detector.md` (dispatch `d-s4-agent-r2-validate`)**

Of 42 checked statements, 38 hold word for word. One is misattributed: the OpenSSF "slopsquatting" quotation in change 7b. The Open Source Security Foundation guide does not say those words; it block-quotes Bill Toulas of BleepingComputer. The quotation also joins three sentences with "..." and drops "Instead,". It then ends at "by AI models." where the original sentence goes on to "in coding examples". Two other quotations are word for word but cut short in a way that should be fixed:
- **The POSIX sentence (change 8b)** stops at "is valid." The original continues ", or on the set of collating elements matched." That dropped clause is the part that supports the file's point.
- **The Rust sentence (change 5)** drops its condition: "when `Cargo.toml` doesn't specify a crate name".

All 21 `old:` strings occur exactly once in the current file.

## Fetches, in order (23 of the 25 allowed)

1. packaging.python.org, name-normalization page
2. pubs.opengroup.org, `basedefs/V1_chap09.html`
3. slsa.dev/spec/v1.1/threats
4. doc.rust-lang.org, reference page on extern crates
5. The USENIX PDF. It was saved to `/Users/account/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790790330893-6989qo.pdf`. I read PDF pages 1–3, 7, 10 and 12 myself as page images. Their printed page numbers are 3687, 3688, 3692, 3695 and 3697.
6. The USENIX presentation page
7. The OpenSSF Concise Guide
8. The OpenSSF guide for AI code assistant instructions
9. OWASP entry LLM09:2025
10. The arXiv html version of 2406.10279 (it is version 3)
11. The OpenSSF assistant guide again, for the full paragraph and who it is attributed to
12. The ENISA PDF. It was saved to `…/tool-results/webfetch-1790790374573-1qi559.pdf`. I read PDF pages 1–4 and 12–13 as images.
13. `raw.githubusercontent.com/nodejs/node/main/lib/fs.js`
14. The OpenSSF assistant guide a third time, for every occurrence of "slopsquatting"
15. The Concise Guide again, for the separator character
16. arXiv again, for the attack sentence
17. Search: OWASP's full name
18. The raw GitHub markdown of the Concise Guide
19. owasp.org/about
20. slsa.dev
21. github.com, the commit history of `nodejs/node` `lib/fs.js`
22. Search: the expansion of POSIX
23. best.openssf.org

## Every checked statement

| # | Change | Exact text | Verdict | Source and quote seen | Corrected wording |
|---|---|---|---|---|---|
| 1 | 1 | "The name should be lowercased with all runs of the characters `.`, `-`, or `_` replaced with a single `-` character." | VALIDATED | Packaging specification, same sentence word for word | — |
| 2 | 1 | `Friendly.Bard`, `friendly_bard`, `friendly--bard` all normalise to `friendly-bard` | VALIDATED | The specification lists `friendly_bard` and `friendly--bard` as equivalent names. `Friendly.Bard` follows from the quoted rule. | — |
| 3 | 2 | "Register a package name in a public registry that shadows a name used on the victim's internal registry" | VALIDATED | SLSA version 1.1, "(H) Package selection", "Dependency confusion", "_Threat:_ …". The source sentence continues ", and wait for a misconfigured victim…"; the quotation is a fragment without a closing period, which is fine. | — |
| 4 | 2 | "Supply-chain Levels for Software Artifacts" | VALIDATED | slsa.dev: "Supply-chain Levels for Software Artifacts, or SLSA ("salsa")." | — |
| 5 | 5 | Cargo "will transparently replace `-` with `_`" | VALIDATED, but the condition is dropped | Rust Reference: "In such case, when `Cargo.toml` doesn't specify a crate name, Cargo will transparently replace `-` with `_`" | Cargo, "when `Cargo.toml` doesn't specify a crate name", "will transparently replace `-` with `_`" |
| 6 | 5 | "The `as` clause can be used to bind the imported crate to a different name." | VALIDATED | Rust Reference, word for word | — |
| 7 | 5 | "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." USENIX, page 3697 | VALIDATED | Page image, printed page 3697 | — |
| 8 | 5 | The same sentence in the preprint | VALIDATED | arXiv version 3, word for word | — |
| 9 | 5, 6a, 7a, 7b | USENIX Security 2025 presentation address | VALIDATED | Page is live: "34th USENIX Security Symposium (USENIX Security 25)", pages 3687–3706, same title and authors | — |
| 10 | 6a | "13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2", page 3697 | VALIDATED | Page image: "…only 13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2." | — |
| 11 | 6a | The same wording in the preprint | VALIDATED | arXiv version 3: "only 13.4% (10,263 of 76,489) have…" (lower-case "only" here too) | — |
| 12 | 6a | "typosquatting, combosquatting, brandjacking, and similarity attacks" (USENIX page 3688) | VALIDATED | Page image, printed page 3688: "can be broadly categorized into *typosquatting*, *combosquatting*, *brandjacking*, and *similarity* attacks [28]". The paper credits this grouping to its reference 28. | Optional: "The same paper, citing earlier work, groups…" |
| 13 | 6a | "Check its creation time and popularity." | VALIDATED | Concise Guide, and its raw markdown | — |
| 14 | 6a | "Check if a similar name is more popular - that could indicate a typosquatting attack." | VALIDATED | The raw markdown has space, hyphen-minus, space. One summarised answer said "em dash", but its own quotation and the raw source both show a hyphen. | — |
| 15 | 6a | "the Open Source Security Foundation's guide to evaluating open source software" | VALIDATED | Page title "Concise Guide for Evaluating Open Source Software". best.openssf.org gives "Open Source Security Foundation (OpenSSF)". | — |
| 16 | 6b | "No source read for this file gives a threshold for either comparison" | VALIDATED for the Concise Guide only | That guide gives no number for downloads or age; its only "previous 12 months" is about project activity. Other sources were not re-read for this. | — |
| 17 | 7a | "There is no way to definitively determine the required packages from a code snippet alone.", page 3692 | VALIDATED | Page image, printed page 3692, section 4.3 | — |
| 18 | 7b | The attack sentence, pages 3687–3688 | VALIDATED | Page images: "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package to an open-source repository with the same name as the hallucinated or fictitious package…". The file's ellipses fit. | — |
| 19 | 7b | "43% of hallucinated packages were repeated in all 10 queries", page 3695 | VALIDATED | Page image, printed page 3695 | — |
| 20 | 7b | Attack sentence and 43% sentence in the preprint | VALIDATED | arXiv version 3, both sentences | — |
| 21 | 7b | "Trivial cross-referencing methods (i.e., comparing … known packages) are ineffective … with malicious code.", page 3688 | VALIDATED | Page image, printed page 3688, word for word | — |
| 22 | 7b | OWASP scenario text: "Attackers experiment … to widely used repositories." | VALIDATED | LLM09:2025 page, word for word | — |
| 23 | 7b | That it is Attack Scenario 1 of entry LLM09:2025, "Misinformation" | VALIDATED | Page title "LLM09:2025 Misinformation"; heading "Example Attack Scenarios"; label "Scenario #1" | — |
| 24 | 7b | "its 2025 list of risks for large language model applications" | VALIDATED | The page says "OWASP Top 10 for LLM Applications" and "LLM TOP 10 FOR 2025" | — |
| 25 | 7b | "Open Worldwide Application Security Project" | VALIDATED | owasp.org/about: "The Open Worldwide Application Security Project (OWASP) is a 501(c)(3) nonprofit foundation…" | — |
| 26 | 7b | Title "Security-Focused Guide for AI Code Assistant Instructions" | VALIDATED | Page heading, dated 2025-08-01 | — |
| 27 | 7b | The guide "names it: "A new class of supply chain attacks named 'slopsquatting' has emerged...threat actors could create malicious packages on indexes like PyPI and npm named after ones commonly made up by AI models."" | **MISATTRIBUTED** | The passage is a block quotation credited to "Bill Toulas - AI-hallucinated code dependencies become new supply chain risk" (BleepingComputer). "emerged" and "threat" are three sentences apart. The "..." leaves out "from the increased use … package names. The term slopsquatting was coined … Unlike typosquatting, slopsquatting doesn't rely on misspellings. Instead,". The source then ends "…made up by AI models in coding examples". There is no punctuation "emerged...threat" in the source; that elision is the researcher's. | Use the guide's own sentence: The Open Source Security Foundation's "Security-Focused Guide for AI Code Assistant Instructions" names it: "These hallucinations enable 'slopsquatting' attacks, where attackers create malicious packages with names commonly hallucinated by AI models." (same address, read 2026-09-30). I read this sentence once, through the summarising fetch tool, so the executor should confirm the exact words before writing them. |
| 28 | 8a | "ASCII letters and numbers, period, underscore and hyphen" | VALIDATED | Packaging specification: "A valid name consists only of ASCII letters and numbers, period, underscore and hyphen." | — |
| 29 | 8b | "must start and end with a letter or number" | VALIDATED | "It must start and end with a letter or number." | — |
| 30 | 8b | "In other locales, a range expression has unspecified behavior: strictly conforming applications shall not rely on whether the range expression is valid." | VALIDATED, but the quotation is cut short | The source has "…is valid, or on the set of collating elements matched." There is a comma after "valid", not a period. | "In other locales, a range expression has unspecified behavior: strictly conforming applications shall not rely on whether the range expression is valid, or on the set of collating elements matched." |
| 31 | 8b | "section 9.3.5" | VALIDATED | "9.3.5 RE Bracket Expression", item 7, IEEE Std 1003.1-2024 (Issue 8) | — |
| 32 | 8b | "outside its POSIX locale" | VALIDATED | Same item: "In the POSIX locale, a range expression represents the set of collating elements that fall between two elements…" | — |
| 33 | 8b | "Portable Operating System Interface (POSIX)" | VALIDATED, from a search-result title only | Title of an IEEE Standards Association page: "…Portable Operating System Interface (POSIX™) Base Specifications, Issue 8…" | — |
| 34 | 10 | Version 0.8, draft for public consultation | VALIDATED | Document History: "Dec 15 2025 · 0.8 · Draft for public consultation" | — |
| 35 | 10 | "newly inserted malicious packages in section 3.2.1" | VALIDATED (paraphrase) | Heading "3.2.1 Insertion of Malicious Packages/Dependencies"; the body says "Attackers can publish entirely new packages containing malicious code" | — |
| 36 | 10 | "compromised legitimate packages in section 3.2.2" | VALIDATED | Heading "3.2.2 Compromised Legitimate Packages" | — |
| 37 | 10 | "treats both as threats in their own right" | VALIDATED | Section 3.2 "Supply Chain Attacks": "The following subsections describe common categories of supply chain attacks" | — |
| 38 | 10 | "European Union Agency for Cybersecurity's draft technical advisory on package managers" | VALIDATED | Cover: "ENISA Technical Advisory for Secure Use of Package Managers", "European Union Agency for Cybersecurity", December 2025 | — |
| 39 | 11 | The widened definition of a fabricated package | Not a citation | It matches line 91 of the current file, which I read | — |
| 40 | 13 | "a branch that keeps changing" | VALIDATED | The commit history shows 10 commits to `lib/fs.js` between 2 and 26 September 2026 | — |
| 41 | 13 | The body reads `options.buffer`, `options.encoding` and `options.flag`, and never `throwOnError` | VALIDATED, holding today | The function body on `main`: those three are read. The body now opens with `const h = vfsState.handlers; … h.readFileSync(path, options)`, which hands the options to a handler I did not read. "throwOnError" does not appear in `lib/fs.js`. | — |
| 42 | 13 | "no commit was recorded" | Cannot be checked on the web | It describes the researcher's own process | — |

## Counts

- 42 statements checked.
- 38 validated. Two of them (rows 5 and 30) need the wording fix shown in the table, and row 12 has an optional one.
- 1 validated for one source only (row 16).
- 1 misattributed (row 27).
- 0 refuted, 0 unsourceable, 0 stale.
- 2 cannot be checked on the web (rows 39 and 42).

## The `old` strings

I searched the file for all 21 blocks. Each matched exactly once:
- lines 51, 93, 113, 125, 132, 133, 135 (twice, as two separate strings: changes 8a and 8b), 141, 142, 173, 198, 217, 222, 224, 230, 257, 258, 259, 291 and 303.

For the four longest lines (changes 1, 3a, 3b and 3c) I searched for a distinctive leading part and compared the rest by eye. None differs from the session's check.

## Wording a person reads

There are no gate numbers in the new text. Abbreviations and acronyms in it:
- **"ASCII" (change 8a)** is never spelled out. It appears only inside the quotation. The sentence explains what it means ("A to Z or a to z") but not what the letters stand for. Adding the expansion would need a source; I did not fetch one.
- **"CTO Chief" (change 10)** is the agent's existing name, carried over unchanged from the old text. "CTO" is not spelled out.
- **"AI" (change 7b)** appears inside the guide's title and inside the quotation. Neither can be altered.
- **"PyPI" and "npm"** appear in the 7b quotation and in 8b ("the PyPI recipe"). They are registry names used throughout the file.
- **"LLM09:2025"** is OWASP's own identifier. The same sentence spells out "large language model applications".
- **"USENIX"** is the organisation's proper name.
- **POSIX** is spelled out once, in 8b.
- **NIST and SLSA** do not appear in any new text. SLSA occurs only inside an address; OWASP, OpenSSF and ENISA likewise appear only in addresses.

## Not checked

- **The NIST publication** (Special Publication 800-218) was not fetched; no change in scope quotes it.
- **Quotations that are not in any listed change's new text** were not checked. These are ENISA section 3.2.4 (finding 2's evidence), ENISA 4.1.1 and 4.1.2, and OWASP Top 10:2025 A03 (finding 15).
- **The rest of row 16.** Whether ENISA or any other source read in rounds 1–2 gives a threshold was not re-read.
- **The `vfsState` handler code** that `readFileSync` now calls was not read.
- **Summarising tool.** Every HTML page, and the GitHub commit list, came through the summarising fetch tool. Only the USENIX and ENISA pages listed above were read directly by me as page images.
- **The OpenSSF own-prose sentence** proposed as the correction for row 27 was read once only.
- **An aside on the old line 224.** arXiv version 3 also lower-cases "only", so the current file's capital "Only" does not match either version. Change 6a removes the word, so this becomes moot.

Sources:
- [Python packaging name normalization](https://packaging.python.org/en/latest/specifications/name-normalization/)
- [POSIX regular-expression chapter](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html)
- [SLSA version 1.1 threats](https://slsa.dev/spec/v1.1/threats)
- [slsa.dev](https://slsa.dev/)
- [Rust Reference, extern crates](https://doc.rust-lang.org/reference/items/extern-crates.html)
- [USENIX PDF](https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf)
- [USENIX presentation page](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen)
- [arXiv 2406.10279](https://arxiv.org/html/2406.10279)
- [OpenSSF Concise Guide](https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software)
- [Concise Guide raw markdown](https://raw.githubusercontent.com/ossf/wg-best-practices-os-developers/main/docs/Concise-Guide-for-Evaluating-Open-Source-Software.md)
- [OpenSSF guide for AI code assistant instructions](https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions.html)
- [best.openssf.org](https://best.openssf.org/)
- [OWASP LLM09:2025](https://genai.owasp.org/llmrisk/llm092025-misinformation/)
- [About OWASP](https://owasp.org/about/)
- [ENISA advisory, version 0.8 draft](https://www.enisa.europa.eu/sites/default/files/2025-12/ENISA%20Technical%20Advisory%20-%20Package_Managers_v_0.8_draft.pdf)
- [Node.js lib/fs.js](https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js)
- [lib/fs.js commit history](https://github.com/nodejs/node/commits/main/lib/fs.js)
- [IEEE Standards Association, POSIX Issue 8 corrigendum](https://standards.ieee.org/ieee/1003.1-2024_Cor_1/11920/)

```yaml
response:
  dispatch_id: "d-s4-agent-r2-validate"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool in this agent
  findings:
    - id: citation-validator/d-s4-agent-r2-validate/001
      severity: high
      type: citation-misattributed
      message: "Change 7b attributes Bill Toulas's BleepingComputer words, block-quoted by the guide, to the OpenSSF guide; the '...' joins three sentences and the quotation cuts off before 'in coding examples'."
      suggestion: "correct-to the guide's own sentence: \"These hallucinations enable 'slopsquatting' attacks, where attackers create malicious packages with names commonly hallucinated by AI models.\" (confirm the exact words first)"
      confidence: HIGH
      confidence_rationale: "Two separate fetches of the page both named the block-quote attribution to Bill Toulas."
      citations:
        brief_url: https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions.html
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round2-critic-d-s4-agent-r2-critic.md, text: "Proposed change 7b" }]
    - id: citation-validator/d-s4-agent-r2-validate/002
      severity: info
      type: citation-validated
      message: "Change 8b's POSIX quotation is word for word but ends at 'valid.'; the source continues ', or on the set of collating elements matched.'"
      suggestion: "correct-to the full sentence"
      confidence: HIGH
      citations:
        brief_url: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html
    - id: citation-validator/d-s4-agent-r2-validate/003
      severity: info
      type: citation-validated
      message: "Change 5's Rust quotation drops its condition 'when `Cargo.toml` doesn't specify a crate name'."
      suggestion: "correct-to include the condition"
      confidence: HIGH
      citations:
        brief_url: https://doc.rust-lang.org/reference/items/extern-crates.html
  self_assessment:
    coverage: 0.95
    confidence_overall: MEDIUM
    limitations:
      - "HTML pages were read through a summarising fetch tool; only the USENIX and ENISA page images were read directly."
      - "40 of 42 statements settled against a source; 2 cannot be checked on the web."
    unknowns:
      - "Whether any source other than the Concise Guide gives a look-alike threshold (change 6b)."
  metadata:
    tokens_used: null
    tool_calls: 32
```