**Result.** I checked 30 citation claims in the proposed new text. 29 are VALIDATED. One is STALE: change 12 says the Rust sentence before "In such case" "was not read". I read it today, and the file can now quote it. Nothing is refuted, unsourceable or misattributed. I found no gate number and no invented abbreviation. "AI" appears unexpanded three times, in changes 2a, 8b and 9.

## Fetches, in order (18 of 25)
| # | Source | How read |
|---|---|---|
| 1 | Joint report "AI Coding Assistants" (German Federal Office for Information Security and the French national agency), bsi.bund.de PDF | Saved; PDF pages 1, 2 and 10 read as page images |
| 2 | European Union Agency for Cybersecurity draft, "Technical Advisory on AI-assisted software development" | Saved; PDF pages 1, 2 and 20–22 (printed 19–21) read as page images |
| 3 | Tenable blog post | Copy through the fetch tool |
| 4 | OWASP A03:2025 page | Copy through the tool |
| 5 | Rust Reference, extern-crates page (HTML) | Copy through the tool |
| 6 | Node `lib/fs.js` on main (raw) | Copy through the tool |
| 7 | Same agency, final package-manager advisory PDF | Saved; PDF pages 1, 2, 13 and 14 read as page images |
| 8 | api.npmjs.org, `@isaacs%2fcliui` downloads | Copy through the tool |
| 9 | registry.npmjs.org, `sigstore/latest` | Copy through the tool |
| 10 | docs.pypi.org/api/json/ | Copy through the tool |
| 11 | registry.npmjs.org, `bcrypt/latest` | Copy through the tool |
| 12 | pypi.org/pypi/sklearn/json | Copy through the tool |
| 13 | Node `lib/internal/fs/utils.js` (raw) | Copy through the tool |
| 14 | Rust Reference source, raw `extern-crates.md` (second route for #5) | Copy through the tool |
| 15 | Search: Node.js virtual file system | Search summary (only the result titles are used) |
| 16 | owasp.org/about | Copy through the tool |
| 17 | nodejs.org/api/vfs.html | Copy through the tool |
| 18 | packaging.python.org, name-normalization page | Copy through the tool |

Local reads (no web budget used):
- `agents/security/dependency-auditor.md` line 3.
- The round-2 validation report, used for the character comparison.
- A Grep-tool check that `[^\x00-\x7F]` matches the Cyrillic "а" in `reаct` on line 27 of the session-runs note. It did, one hit.

No fetched page addressed a reviewer or validator. The agency's draft contains sample assistant instructions; that is its subject, and I read it as data.

## Verdicts
| # | Change | Exact text | Verdict | Source | Quote as read | Corrected wording |
|---|---|---|---|---|---|---|
| 1 | 1 | "Unknown libraries should be checked for plausibility, e.g. when they were created, how commonly they are used or how active a source code repository is." | VALIDATED | Joint report, page 10 (page image) | Identical: the second bullet under "Possible mitigation measures", section 3.4.1 | — |
| 2 | 1 | "page 10" | VALIDATED | Same | Printed page 10, which is also PDF page 10 | — |
| 3 | 1 | "last updated September 2024" | VALIDATED | Same, page 2 | "Last updated: September 2024" | — |
| 4 | 1 | Joint report "AI Coding Assistants" by the two agencies | VALIDATED | Cover and page 2 | Cover title "AI Coding Assistants", with both agencies' logos. "Published by Bundesamt für Sicherheit in der Informationstechnik"; the listed source is both offices, the French one as "Agence nationale de la sécurité des systèmes d'information". | Optional: "French Cybersecurity Agency" is the file's own English rendering. The document gives only the French name. |
| 5 | 2a | "Flag unnecessary or risky installation behaviour, such as unusual install scripts, post-install hooks…" | VALIDATED | Draft, table 5, printed page 21, row "Usage of secure practices" | "…post-install hooks or excessive dependency chains." The ellipsis is faithful. | — |
| 6 | 2a, 8b, 9 | "version 0.4, draft, September 2026, table 5" | VALIDATED | Draft, cover and page headers | Header "Version: 0.4", a "DRAFT" watermark, cover "SEPTEMBER 2026", "Table 5: recommendation-to-instruction" | Precision, optional: table 5 is "Example skill content", and the page says "The wording is illustrative and should be adapted". The locator could read "table 5, example skill content". |
| 7 | 2a | bcrypt's `"install": "node-gyp-build"` | VALIDATED | bcrypt `latest` (6.0.0) | `{"test":"jest","build":"prebuildify --napi --tag-libc --strip","install":"node-gyp-build"}` | Same JSON value; the only difference is the space after the colon. |
| 8 | 2a, 2b | dependency-auditor owns "install-time hook abuse" | VALIDATED | `<home>/Code/ctoc/agents/security/dependency-auditor.md` line 3 | "flags typosquats, install-time hook abuse and unmaintained packages" | — |
| 9 | 4a | "A valid name consists only of ASCII letters and numbers, period, underscore and hyphen." | VALIDATED | Packaging specification, live today, and a character comparison with round-2 validation line 66 | Identical (one exact-literal Grep matched in both notes) | — |
| 10 | 6d | Scoped downloads body `{"downloads":116807845,"start":"2026-09-22","end":"2026-09-28","package":"@isaacs/cliui"}` | VALIDATED | api.npmjs.org, `%2f` form | Identical | — |
| 11 | 6d | sigstore fields; `repository` `{"url":"git+https://github.com/sigstore/sigstore-js.git","type":"git"}` | VALIDATED | `sigstore/latest` (5.0.0) | The repository value is identical. `dist.attestations`, `_npmUser.trustedPublisher` (`"id":"github"`) and `maintainers` (`bdehamer`) are all present. | — |
| 12 | 7b | Every file carried `upload_time_iso_8601`; the earliest was "2015-07-15T14:17:46.609926Z" | VALIDATED | sklearn JSON | 10 values; the earliest is 2015-07-15T14:17:46.609926Z. This agrees with the session's own curl run (item c). | — |
| 13 | 8b | "Flag unclear ownership, newly created maintainers or suspicious maintainer changes for review." | VALIDATED | Draft, table 5, printed page 20, row "Maintainer reputation" | Identical | — |
| 14 | 8b | "Where available, verify package signing, integrity or provenance metadata." | VALIDATED | Draft, table 5, printed page 20, row "Package signing and integrity verification" | Identical | — |
| 15 | 8b | "Prefer signed packages to reduce the chance of including a modified, malicious component" | VALIDATED | OWASP A03:2025 | "…malicious component (see A08:2025-Software and Data Integrity Failures)." | Optional: name the entry, "A03:2025 Software Supply Chain Failures". |
| 16 | 8b | "Open Worldwide Application Security Project" | VALIDATED | owasp.org/about | "The Open Worldwide Application Security Project (OWASP) is a 501(c)(3) nonprofit foundation…" | — |
| 17 | 9 | "Do not rely on popularity metrics alone, as they may be misleading or inflated." | VALIDATED | Draft, table 5, printed page 21, row "Popularity and maintenance" | Identical | — |
| 18 | 9 | "each version uploaded to the npm public registry typically receives between 100 and 150 downloads from automated systems" | VALIDATED | Tenable | "From Tenable's initial analysis, each version uploaded…automated systems." | Precision: "Tenable's initial analysis found that…" in place of "Tenable found that…". |
| 19 | 9 | `ambar-src` "reached more than 50,000 downloads in three days after attackers uploaded more than 700 versions" | VALIDATED | Tenable | "…the malicious "ambar-src" package, which reached more than 50,000 downloads in three days after attackers uploaded more than 700 versions." | — |
| 20 | 9 | Ron Popov, 28 May 2026 | VALIDATED | Tenable | "By Ron Popov, May 28 2026" | — |
| 21 | 9 | `downloads` "is always `-1` and should not be used" | VALIDATED | docs.pypi.org/api/json/ | "`downloads`: this key is always `-1` and should not be used." It appears twice, under "Deprecated keys". | — |
| 22 | 9 | `{"last_day":-1,"last_month":-1,"last_week":-1}` for sklearn | VALIDATED | sklearn JSON | Identical | — |
| 23 | 10 | "Technical Advisory for Secure Use of Package Managers" | VALIDATED | Final advisory, cover | The printed title is "ENISA Technical Advisory for Secure Use of Package Managers"; the quote is a verbatim substring of it. | — |
| 24 | 10 | Version 1.1, March 2026, the `…/2026-03/…Package_Managers_Final.pdf` address | VALIDATED | Final advisory: header, cover, fetch | "Version: 1.1", "MARCH 2026". The draft's footnote 31 cites the same address. | — |
| 25 | 10 | Section titles 3.2.1 "Insertion of malicious packages/dependencies" and 3.2.2 "Compromised legitimate packages" | VALIDATED | Final advisory, printed pages 12–13 (page images) | Identical, capitalisation included: only the first word is capitalised. | — |
| 26 | 11 | `const h = vfsState.handlers; if (h !== null) { const result = h.readFileSync(path, options); …` | VALIDATED | `lib/fs.js` on main | The block continues `if (result !== undefined) return result; }` and only then `options = getOptions(options, { flag: 'r' });` | Optional: add "and returns the handler's result unless it is `undefined`". |
| 27 | 11 | The handler is called "a virtual-file-system handler" | VALIDATED | `lib/internal/fs/utils.js`; nodejs.org/api/vfs.html | "// Shared VFS handler state for fs wrapping. // When handlers is null, no VFS is active (zero overhead)." and `const vfsState = { __proto__: null, handlers: null };`. The documentation page heading is "Virtual File System" ("Stability: 1 - Experimental"). | Optional, and it closes the file's open item: `vfsState` is defined in `lib/internal/fs/utils.js` and is set by `setVfsHandlers(handlers)`. |
| 28 | 12 | "In such case, when `Cargo.toml` doesn't specify a crate name, Cargo will transparently replace `-` with `_`" | VALIDATED | Rust Reference, two routes (the HTML page and the raw source, rule `items.extern-crate.name-restrictions`) | The sentence continues "(Refer to RFC 940 for more details)." | End the quote with "…" |
| 29 | 12 | "The case that sentence refers to is set out in the sentence before it, which was not read for this file" | **STALE** | Same | "When naming Rust crates, hyphens are disallowed. However, Cargo packages may make use of them. In such case, …" | See the replacement text below. |
| 30 | — | Wording to be read by a person, changes 2a, 8b and 9: "AI-assisted development" | Unexpanded acronym | — | — | "artificial-intelligence-assisted software development", or quote the title verbatim: "Technical Advisory on AI-assisted software development". |

**Replacement text for change 12:** The Reference says: "When naming Rust crates, hyphens are disallowed. However, Cargo packages may make use of them. In such case, when `Cargo.toml` doesn't specify a crate name, Cargo will transparently replace `-` with `_`…" (https://doc.rust-lang.org/reference/items/extern-crates.html, read 2026-09-30). So a package whose name has a hyphen is imported under the name with an underscore, unless `Cargo.toml` names the crate. Read the name from `Cargo.toml` rather than applying the rule yourself. An `extern crate` declaration can also rename a crate:

**Optional stronger source for change 2a:** the final package-manager advisory is not a draft, and it states the install-script threat itself in section 3.2.2 (printed page 13, page image). About the ua-parser-js incident it says: "The attackers proceeded to add malicious code to the pre-install and post-install scripts, enabling automatic execution of the payload during installation."

## Counts
- 30 claims: 29 VALIDATED, 1 STALE, 0 REFUTED, 0 UNSOURCEABLE, 0 MISATTRIBUTED.
- Person-facing wording: 3 unexpanded "AI", 0 gate numbers, 0 invented abbreviations. "npm" and "PyPI" are product names already used throughout the file; "ASCII" appears only inside a verbatim quotation.
- 18 of 25 fetches and searches used.

## Not checked, plainly
- **Raw bytes.** Every non-PDF answer passed through the fetch tool's summarising model. The npm and PyPI values also agree with the session's raw curl runs, which were an independent reading of the same live endpoints.
- **Change 6d, "the same answer as the form with a plain `/`".** I did not fetch the plain form; this rests on session run (b).
- **Text carried over from the current file**, not new: the `email-validator-pro` downloads sentence; "never `throwOnError`"; the three options the body reads. I read only the first 15 lines of `readFileSync`.
- **Code-level claims**, outside this validator's scope: recipe behaviour (changes 6a–6c, 7a, 8a) and the pattern evasions in change 13. The session ran these.
- **Names I did not settle:** whether "French Cybersecurity Agency" is the agency's official English name, and whether "Top 10:2025" is OWASP's own name for the list. I read only the page title "A03:2025 Software Supply Chain Failures".
- **Not used:** the search summary's claim that Node's virtual-file-system module arrived in "v26.4.0". The new text makes no such claim.
- **Out of scope:** the critic's finding prose outside the `new:` blocks (for example "13.4%").

```yaml
response:
  dispatch_id: "d-s4-agent-r3-validate"   # does not match the schema's 26-character pattern; given by the brief
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool; never an invented time (schema requires date-time: conflict)
  findings:
    - id: citation-validator/d-s4-agent-r3-validate/001
      severity: low
      type: citation-stale
      file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md
      line_range: [451, 451]
      message: "Change 12 says the sentence before 'In such case' was not read; it was read today: 'When naming Rust crates, hyphens are disallowed. However, Cargo packages may make use of them.'"
      suggestion: "correct-to the replacement text for change 12 given in this report"
      confidence: HIGH
      confidence_rationale: "Two routes agree (rendered Reference page and raw extern-crates.md source); both were read through the fetch tool."
      citations:
        brief_url: https://doc.rust-lang.org/reference/items/extern-crates.html
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md, line_range: [451, 451] }]
    - id: citation-validator/d-s4-agent-r3-validate/002
      severity: low
      type: wording-unexpanded-acronym
      file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md
      line_range: [118, 381]
      message: "'AI-assisted development' is unexpanded in changes 2a, 8b and 9."
      suggestion: "correct-to 'artificial-intelligence-assisted software development', or quote the title verbatim"
      confidence: HIGH
      confidence_rationale: "Presence check on the three new blocks."
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md, line_range: [118, 381] }]
    - id: citation-validator/d-s4-agent-r3-validate/003
      severity: info
      type: citation-validated
      file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md
      message: "29 claims validated: joint report (page 10 quote, 'Last updated: September 2024'); agency draft version 0.4 table 5 (four sentences); final package-manager advisory (title, version 1.1, March 2026, sections 3.2.1 and 3.2.2); Tenable (Ron Popov, May 28 2026, both sentences); OWASP A03:2025 and its expansion; Rust quote; Node readFileSync handler branch and the virtual-file-system label; packaging sentence; npm, PyPI and bcrypt values; dependency-auditor line 3."
      suggestion: keep
      confidence: MEDIUM
      confidence_rationale: "PDFs read as page images; the other answers came through the fetch tool's model, not as raw bytes."
      citations:
        brief_url: https://www.enisa.europa.eu/sites/default/files/2026-09/ENISA%20Technical%20Advisory-AI-assisted-software-development-draft.pdf
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md, line_range: [92, 451] }]
  self_assessment:
    coverage: 0.97
    confidence_overall: MEDIUM
    limitations:
      - "No raw bytes for non-PDF sources; three PDFs read as page images."
      - "The plain-slash downloads form in change 6d was not re-fetched."
      - "dispatch_id and completed_at do not conform to the dispatch schema; tokens_used unknown."
    unknowns:
      - "Official English name of the French agency; official naming of 'Top 10:2025'."
  metadata:
    tokens_used: null
    tool_calls: 27
```

Files:
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md`
- `<home>/Code/ctoc/agents/security/dependency-auditor.md`
- Saved PDFs, under `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/`:
  - `webfetch-1790792100709-2lz2kx.pdf` (joint report)
  - `webfetch-1790792116507-xbjxsi.pdf` (draft advisory on AI-assisted development)
  - `webfetch-1790792186381-c1nfvx.pdf` (final package-manager advisory)

Sources:
- [ANSSI–BSI, AI Coding Assistants](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf?__blob=publicationFile&v=7)
- [ENISA draft, AI-assisted software development](https://www.enisa.europa.eu/sites/default/files/2026-09/ENISA%20Technical%20Advisory-AI-assisted-software-development-draft.pdf)
- [ENISA, Secure Use of Package Managers, final](https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf)
- [Tenable](https://www.tenable.com/blog/how-cyberattackers-inflate-malicious-package-npm-download-counts)
- [OWASP A03:2025](https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures) · [OWASP about](https://owasp.org/about/)
- [Rust Reference, extern crates](https://doc.rust-lang.org/reference/items/extern-crates.html) · [raw source](https://raw.githubusercontent.com/rust-lang/reference/master/src/items/extern-crates.md)
- [Node lib/fs.js](https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js) · [Node lib/internal/fs/utils.js](https://raw.githubusercontent.com/nodejs/node/main/lib/internal/fs/utils.js) · [Node Virtual File System docs](https://nodejs.org/api/vfs.html) · [Virtual File System pull request (search result)](https://github.com/nodejs/node/pull/61478)
- [npm downloads, @isaacs/cliui](https://api.npmjs.org/downloads/point/last-week/@isaacs%2fcliui) · [sigstore/latest](https://registry.npmjs.org/sigstore/latest) · [bcrypt/latest](https://registry.npmjs.org/bcrypt/latest)
- [PyPI JSON docs](https://docs.pypi.org/api/json/) · [PyPI sklearn](https://pypi.org/pypi/sklearn/json)
- [Python name normalization](https://packaging.python.org/en/latest/specifications/name-normalization/)