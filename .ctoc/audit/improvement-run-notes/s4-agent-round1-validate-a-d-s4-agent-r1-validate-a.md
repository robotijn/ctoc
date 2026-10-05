**Result.** I checked 42 statements. 37 are validated and 2 are wrong in a way that would ship in the agent's instructions. One address is out of date, and 2 statements were not checked. Fix these before the executor applies anything:

1. **Change 1a: the figures "0.00% to 0.10%" and "1.97% to 6.02%" are not quotations, and their scope is wrong.** Neither range appears in the running text of the paper. The single values are cells in Table 1, and they come from different prompt conditions. That same table also covers prompts with no user mistake, and it reaches 53.79% for invented library names under "From 2025".
2. **Change 2: the PyPI quarantine quotation is not on the page.** The page says "This is often coupled with prohibiting the Project name from being reused", and "This" means removing the whole project. It does not say "removals are pretty much coupled…". Changing "often" to "pretty much" changes a frequency claim.
3. **The recipes: the second character check inside each recipe cannot stop a single quote.** The shell reads `name='…'` before any `case` runs, so a `'` in the name ends the quoting and whatever follows it runs. Only the agent's own check before it writes the command guards against this.

Every quotation below was pulled out by the fetch tool's summarising model, not copied byte for byte by me. Where two reads with different prompts gave the same words, I say so. I read the shell recipes but did not run them; I have no shell tool.

## Fetches in order (35 of 35 used)

1. registry.npmjs.org/fs/latest
2. registry.npmjs.org/crossenv
3. registry.npmjs.org/email-validator-pro
4. pypi.org/pypi/email-validator-pro/json (404)
5. pypi.org/pypi/sklearn/json
6. crates.io/api/v1/crates/tokio_advanced (404)
7. index.crates.io/to/ki/tokio_advanced (404)
8. repo1.maven.org/…/commons-security/maven-metadata.xml (404)
9. api.npmjs.org/downloads/point/last-week/email-validator-pro
10. registry.npmjs.org/bcrypt/latest
11. docs.pypi.org/api/json/
12. docs.pypi.org/api/
13. docs.pypi.org/api/index-api/
14. packaging.python.org, the page on distribution packages and import packages
15. pip.pypa.io/en/stable/news/
16. rust-lang.github.io/rfcs/3463-crates-io-policy-update.html
17. docs.npmjs.com/policies/unpublish
18. blog.pypi.org quarantine post: the "pretty much" wording is not on the page
19. docs.npmjs.com/threats-and-mitigations
20. blog.pypi.org quarantine post again: the tool refused because of its quote-length limit
21. blog.pypi.org quarantine post a third time: "This is often coupled…"
22. arxiv.org/html/2406.10279 (six quotations)
23. arxiv.org/html/2406.10279 (end of the adversary sentence, the 13.4% denominator, how names were extracted)
24. arxiv.org/html/2501.19012
25. arxiv.org/html/2509.22202v3 (body text; inconclusive on the ranges)
26. arxiv.org/abs/2509.22202 (version history; abstract of version 4)
27. lasso.security/blog/ai-package-hallucinations
28. arxiv.org/html/2509.22202v3 (abstract; where the values sit)
29. arxiv.org/html/2509.22202v4 (abstract; which table cells hold the values)
30. arxiv.org/html/2509.22202v4: neither range appears as a phrase in the running text
31. Web search for the quarantine sentence (the search summary was not used as evidence)
32. arxiv.org/html/2509.22202v4 (the two running-text sentences; the "From 2025" value)
33. arxiv.org/abs/2406.10279 (authors, version 3)
34. registry.npmjs.org/@isaacs%2fcliui
35. raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md

Local reads, not counted in the budget: the critique, its supplement, both research notes, the dispatch schema, and a search of the skill file for its "Red Lines" section.

## Every checked statement

| # | Change | Text | Verdict | Source and what I saw | Corrected wording |
|---|---|---|---|---|---|
| 1 | 1a | Skill red line: "see if it works", "exactly the slopsquatting attack path" | VALIDATED (local read) | SKILL.md line 395, under "## Red Lines" (line 389) | keep |
| 2 | 1a | "a study of seven models writing Python" | VALIDATED | Version 4: seven models, from GPT-4o-mini to Claude-4.5-Haiku; Python only | keep |
| 3 | 1a | Under prompts with no user error, invented library names ran "0.00% to 0.10%" and invented members "1.97% to 6.02%" | **REFUTED** | Version 4 running text: both ranges NOT FOUND. Where the values sit: 0.10% is Qwen-2.5-Coder under "No description"; 1.97% is GPT-4o-mini under "No description"; 6.02% is Claude-4.5-Haiku under "Alternative". Table 1 is the experiment on how users describe a library, with no user mistakes, and it includes columns "From 2023/2024/2025"; under "From 2025" invented library names reach "53.79%". The running text says "Adjective-based descriptions rarely caused library name hallucinations (mostly ≈ 0%)." and "Library member hallucinations remained consistently low (mostly 1%–5%) across all LLMs." The two reads (fetches 30 and 32) gave identical words. | "Members need this check as much as package names do. In a study of seven models writing Python, when the prompt described the library in plain words, "Adjective-based descriptions rarely caused library name hallucinations (mostly ≈ 0%)", while "Library member hallucinations remained consistently low (mostly 1%–5%) across all LLMs." (Twist and colleagues, https://arxiv.org/html/2509.22202v4, read 2026-09-30)" |
| 4 | 1a and 9 | Cites `arxiv.org/html/2509.22202v3` | STALE (the address, not the figures) | History: version 3 of 19 May 2026; version 4 of 21 August 2026, "Accepted to Proceedings of EMNLP 2026" | Cite `https://arxiv.org/html/2509.22202v4` in both places |
| 5 | 2 | took its invented names from "'pip install' and 'npm install' commands", not from import statements | VALIDATED (quotation); the framing leaves out part of the method | "we parse the generated Python and JavaScript code for 'pip install' and 'npm install' commands, respectively". The authors also asked the model: "The model is then prompted for a list of packages that would be required to run the given code" (heuristics 2 and 3) | "one study took the package names it checked partly from "'pip install' and 'npm install' commands" in the generated code, and partly by asking the model which packages the code needs, never from import statements, because …" |
| 6 | 2 | "There is no way to definitively determine the required packages from a code snippet alone." | VALIDATED | The same words | keep |
| 7 | 2 and 9 | "Spracklen and colleagues" | VALIDATED | Abstract page: "Joseph Spracklen, Raveen Wijewickrama, …"; version 3, 2 March 2025 | keep |
| 8 | 2 | npm holds `fs`, latest version "0.0.1-security" | VALIDATED | version "0.0.1-security" | keep |
| 9 | 2 | "PyPI and other package indices do not enforce any relationship …" | VALIDATED | Identical words; the page sets "do not enforce any relationship" in italics | keep |
| 10 | 2 | "The project is matched case-insensitively with the `_`, `-` and `.` characters considered equal." | VALIDATED | The same sentence, on the index endpoint's page | keep |
| 11 | 2 | "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." | VALIDATED | The same words | keep |
| 12 | 2 (amended) | `@isaacs%2fcliui` answered 200 with the name "@isaacs/cliui" | VALIDATED | name `@isaacs/cliui`, latest "9.0.0", `time.created` "2023-05-02T03:24:28.629Z" | keep |
| 13 | 2 (amended) | A name never registered (`qwzxkvj…`) answered 404 | NOT CHECKED | Budget; rests on the second research note, fetch 21 | — |
| 14 | 2 (amended) | npm's registry document describes no not-found response | NOT CHECKED | Budget | — |
| 15 | 2 | The PyPI documentation lists only "200 OK - no error" | VALIDATED | The page shows `"200 OK" - no error` for both endpoints; "does not mention a 404 status code anywhere" | keep |
| 16 | 2 | PyPI 404 for `email-validator-pro` | VALIDATED | "HTTP 404 Not Found" | keep |
| 17 | 2 | pip 25.1 lines | VALIDATED | 25.1 (26 April 2025): "Remove `experimental` warning from `pip index versions` command." (#13188); "Add a structured `--json` output to `pip index versions`" (#13194). The newest release listed is 26.2.1. | keep |
| 18 | 2 | crates.io: "a maximum of 1 request per second"; "a user-agent header that allows us to uniquely identify your application" | VALIDATED | "We require users of the crates.io API to limit themselves to a maximum of 1 request per second." Both rules apply to the application programming interface, which is what the recipe queries. | keep. Optional: "crates.io's policy (RFC 3463)" |
| 19 | 2 | `tokio_advanced` answered 404 on the crates.io interface | VALIDATED | 404 | keep |
| 20 | 2 | `org.apache.commons:commons-security` metadata answered 404 | VALIDATED | 404 | keep |
| 21 | 2 | `crossenv`: latest "0.0.2-security", description "security holding package" | VALIDATED | dist-tags `{"latest":"0.0.2-security"}`; description "security holding package" | keep |
| 22 | 2 | `sklearn` summary "deprecated sklearn package, use scikit-learn instead" | VALIDATED | The same words; version "0.0.post12" | keep |
| 23 | 2 | "we'll probably give it to you if you want it", cited to fs/latest | VALIDATED; this settles the supplement's question 2 | It sits in fs/latest's `description`: "…npm is hanging on to the package name, but loosely, and we'll probably give it to you if you want it." It also appears in crossenv's readme. | keep |
| 24 | 2 | "until 24 hours have passed" | VALIDATED | "If you entirely unpublish all versions of a package, you may not publish any new versions of that package until 24 hours have passed." The page is silent on whether another user can then take the name. | keep |
| 25 | 2 | "removals are pretty much coupled with prohibiting the Project name from being reused" | **REFUTED** (misquotation) | "When reviewing and acting on malware reports, PyPI Admins had one main tool at their disposal: complete removal of the Project from the PyPI database. This is often coupled with prohibiting the Project name from being reused." Two reads with different prompts agree; the first said the "pretty much" wording is absent. The error comes from research note lines 143 and 272. | "on PyPI, an administrator's "complete removal of the Project from the PyPI database" "is often coupled with prohibiting the Project name from being reused" (https://blog.pypi.org/posts/2024-12-30-quarantine/, read 2026-09-30)" |
| 26 | 2 | "All API requests are cached" | VALIDATED (the quotation) | "All API requests are cached. Requests to the JSON, RSS or Index APIs are cached by our CDN provider." The sentence "so a name registered minutes ago can still answer 404" is an inference; the page states no cache duration. | keep ("can" is the right strength) |
| 27 | 2 | "A variant of this attack is when a public package is registered with the same name of a private package that an organization is using." | VALIDATED | The same words, under the typosquatting and dependency-confusion heading | keep |
| 28 | 2 recipe | The npm answer carries `time.created` | VALIDATED; this settles the supplement's question 1 | Top-level `time.created` = "2017-05-18T04:34:21.018Z" for email-validator-pro, and at the top level for crossenv and @isaacs/cliui too | keep |
| 29 | 2 recipe | The PyPI `info` object has `name`, `version` and `summary` | VALIDATED | All three exist in the sklearn answer and in the documented field list | keep |
| 30 | 4 (amended) | bcrypt install script "node-gyp-build" | VALIDATED | `scripts.install`: "node-gyp-build" (version 6.0.0) | keep |
| 31 | 4 (amended) | "Pre-built binaries for various NodeJS versions are made available on a best-effort basis." | VALIDATED | The tool reported the sentence IDENTICAL | keep |
| 32 | 4 | email-validator-pro: name, latest "1.0.1", created "2017-05-18T04:34:21.018Z" | VALIDATED | `{"latest":"1.0.1"}`; versions 1.0.0 and 1.0.1 | keep |
| 33 | 4 | PyPI answered 404 for it that day | VALIDATED | Same fetch as row 16 | keep |
| 34 | 4 | `tokio_advanced`: 404 on the interface and on the sparse index | VALIDATED | Both 404 | keep |
| 35 | 9 | "An adversary can exploit … by publishing a package … with the same name as the hallucinated … package" | VALIDATED | "…to an open-source repository with the same name as the hallucinated or fictitious package and containing some malicious code/functionality". The omissions are faithful. | keep |
| 36 | 9 | "43% of hallucinated packages were repeated in all 10 queries" | VALIDATED | "…while 39% did not repeat at all" | keep |
| 37 | 9 | huggingface-cli, "more than 30k authentic downloads" (Lanyado, Lasso Security) | VALIDATED | "In three months the fake and empty package got more than 30k authentic downloads! (and still counting)." Bar Lanyado, 28 March 2024 | keep |
| 38 | 9 | "Only 13.4% … have a Levenshtein distance of 1 or 2" | VALIDATED | "Only 13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2", measured to "the closest valid package" | keep. The denominator is unsettled (see the note below the table). |
| 39 | 9 | a package "was first registered after the model's knowledge cutoff date" | VALIDATED | Krishna, Galinkin, Derczynski, Martin, "Importing Phantoms", version 1 | keep |
| 40 | 9 | The npm downloads endpoint | VALIDATED | `{"downloads":5,"start":"2026-09-22","end":"2026-09-28","package":"email-validator-pro"}`. The count field is `downloads`. | keep |
| 41 | 9 | PyPI `downloads` "is always `-1` and should not be used" | VALIDATED | The same words, listed among the deprecated keys | keep |
| 42 | 9 | "up to 26% … up to 99% … up to 85%" | VALIDATED; identical in versions 3 and 4 | Three reads (abstract of version 3, abstract page, abstract of version 4) give the same three sentences | keep the figures; move the address to version 4 (row 4) |

**The 13.4% denominator does not agree across my two reads of the same page.**
- The fetch tool said 76,489 is "all hallucinated packages".
- But the 8.7% sentence on the same page gives 76,489 as "hallucinated Python packages".

I did not settle which is right. The new text does not state the scope, so nothing needs to change.

**Change 4 contradicts change 9, as a matter of logic rather than citation.**
- Change 4 says: "A name is invented only when the registry of the code's own ecosystem has no such name".
- Change 9 reports a name first registered after the stated training cutoff as `hallucinated_import`.

Corrected wording: "A name is invented when the registry of the code's own ecosystem has no such name, or, when the dispatch states the model's training cutoff, when it was first registered after that cutoff (see the look-alike check)."

## The shell recipes (amended change 2), read, not run

**How the amended npm recipe handles the names asked about:**
- `@a/b/c` passes the first guard (its `*` can contain `/`), then the second guard refuses it (`*/*/*`).
- `a/b` passes the first two guards; the third guard refuses it (`[!@]*/*`).
- `@/x` and `@a/` are refused by the first guard, which requires a letter or digit on each side of the `/`.
- `..` is refused by the first guard.
- A name containing `%` (for example `a%2e%2e`) passes the first guard; the second guard refuses it, because `%` is outside the allowed set. So an encoded `..` cannot be formed.
- Space, `"`, `$`, backtick, `;`, `|`, `&` and newline are all refused by the second guard, which is applied to both kinds of name.
- The empty name is refused.
- A `..` inside a name, such as `a..b` or `@a../b`, passes, but it cannot form a path segment, because `/` is refused in unscoped names and written as `%2f` in scoped ones. That is harmless.
- `${name%%/*}%2f${name#*/}` is standard expansion and behaves the same in zsh.
- `[`, `]`, `{` and `}`, which curl would treat as glob patterns, are all refused.

**A failed `curl` never reads as "not on the registry".** This follows from the structure: only the literal string `404` leads to NOT ON THE REGISTRY, and any other value (`000`, empty, 401, 403, 429) leads to COULD NOT LOOK. That is true in all three recipes. That curl prints `000` when there is no response is believed, not verified this session; the routing does not depend on it.

**Defects:**
1. **High: a single quote breaks out before any check runs.** In `name='x';cmd;''`, the shell runs `cmd` while it reads the assignment. The supplement's sentence "each recipe checks it a second time" (line 212) is therefore wrong about `'`.
   - Corrected wording: "…each recipe checks it a second time; that check cannot catch a single quote, which ends the quoting before any check runs, so your own check is the only guard against it."
   - This is the risk the critique's finding 16 hands to you: whether to enforce the rule with a hook.
2. **Medium: an answer that cannot be read gives no verdict.**
   - A 200 with a body cut short (by `--max-time`, or because `mktemp` failed) makes Node throw. Node prints an error trace and no COULD NOT LOOK label.
   - The recipe also ignores curl's exit status.
   - Fix: put `rc=$?; [ "$rc" -eq 0 ] || code="none (curl exit $rc)"` after the `code=` line, and add `|| echo "COULD NOT LOOK (answer unreadable)"` after each `node -e`.
3. **Medium: a 200 with no `dist-tags.latest` prints `REGISTERED latest=`.** That is a "registered" verdict with no version behind it.
   - Fix: when the version is empty, print "COULD NOT LOOK (no latest version in the answer)".
   - This also makes safe the untested case of a missing scoped name, which I could not probe.
4. **Medium: the crates.io and Maven Central check lets `/` and `..` through.** It checks the whole address against `[A-Za-z0-9:/._-]`, so a crate name, groupId or artifactId containing `/` or `..` passes. The request can then reach a different resource on the same host, and a 200 there prints REGISTERED.
   - Fix: run the unscoped-name guard on each part (crate name; artifactId; each part of the groupId between dots) before building the address, and refuse any `..` segment.
5. **Medium: change 9 orders reads the recipes cannot supply.**
   - Change 9 orders reading PyPI's earliest upload date and each package's "Repository link and maintainer, read from the same registry answer".
   - Both recipes print only a few fields, then delete the body. Change 5 says to query each name once.
   - Also, change 9 gives no written recipe for the downloads endpoint ("queried the way the npm recipe queries the registry"). So the agent writes that `curl` by hand, with the guards optional.
   - Fix: print the needed fields from the same answer, after confirming their names in a live answer (I did not confirm the npm field names), and add the downloads address to the npm recipe after the guards.
6. **Low:**
   - The PyPI recipe labels `sklearn`, a placeholder, as `REGISTERED`, while npm labels its placeholders `HELD BY NPM`.
   - Bracket ranges depend on the locale in some shells. This is believed, not verified; `export LC_ALL=C` at the top would remove the doubt.

**Is statement (b) true: is a paraphrase presented as a quotation?** Yes, in two places:
- **Row 3.** Research note line 209 put the ranges in quotation marks, but they are ranges read off Table 1.
- **Row 25.** Research note lines 143 and 272 misquote the quarantine post.

The figures the notes marked as paraphrased (Spracklen's mitigation figures, Lasso's rates per model) do not appear in the new text.

## Counts

| Verdict | Count |
|---|---|
| Validated | 37 |
| Refuted | 2 (rows 3 and 25) |
| Stale | 1 (row 4) |
| Unsourceable | 0 |
| Misattributed | 0 |
| Not checked | 2 (rows 13 and 14) |
| Recipe defects | 6 |
| Logic contradictions | 1 |

## Not checked

- **Whether a missing scoped name answers 404 at the `%2f` address.** My budget ran out. With fix 3 above, any answer other than 200 or 404 is harmless.
- **Rows 13 and 14**, the unscoped 404 and the registry document, which appear in the supplement's text.
- **The supplement's changes S1 to S4**, outside this brief: the TanStack rename sentence, the two Node.js `globals` version lines, the finished-proposals line, the axios `body` observation, and the observation that `throwOnError` is absent from `lib/fs.js`.
- **The carried sentence "Use bcryptjs where native builds aren't available"**, which the second research note validated. I did not fetch it again.
- **The npm downloads endpoint for scoped names.**
- **Whether every artifact on Maven Central has an artifact-level `maven-metadata.xml`.** A missing one would produce a false 404 reported at HIGH confidence.
- **npm's answer for a fully unpublished name.**
- **Running any recipe.** My statements about the behaviour of `node -e` arguments and of curl's `000` are believed, not tested.

## Structured response

```yaml
response:
  dispatch_id: "d-s4-agent-r1-validate-a"   # not a ULID as the schema's pattern requires; used as given
  protocol_version: 1
  agent: ai-quality/citation-validator
  findings:
    - id: citation-validator/d-s4-agent-r1-validate-a/001
      severity: critical
      type: citation-fabricated
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md
      line_range: [74, 74]
      message: '"0.00% to 0.10%" and "1.97% to 6.02%" are presented as quotations. Neither appears in the running text of version 4, and the scope "prompts with no user error" is contradicted by the same table ("From 2025" reaches 53.79%).'
      suggestion: 'correct-to: use the two running-text sentences of version 4 ("mostly ≈ 0%"; "mostly 1%–5%"), cited to https://arxiv.org/html/2509.22202v4'
      confidence: HIGH
      confidence_rationale: "Search of the running text: NOT FOUND. The table cells were located in two reads. The two replacement sentences were identical in two reads."
      citations:
        brief_url: https://arxiv.org/html/2509.22202v4
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md, line_range: [74, 74] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/002
      severity: critical
      type: citation-fabricated
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [272, 272]
      message: 'The page says "This is often coupled with prohibiting the Project name from being reused", not "removals are pretty much coupled…".'
      suggestion: 'correct-to: an administrator''s "complete removal of the Project from the PyPI database" "is often coupled with prohibiting the Project name from being reused"'
      confidence: HIGH
      confidence_rationale: "Two reads with different prompts agree; the first reported the quoted phrase absent."
      citations:
        brief_url: https://blog.pypi.org/posts/2024-12-30-quarantine/
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [272, 272] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/003
      severity: low
      type: citation-stale
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md
      line_range: [611, 611]
      message: "Cites version 3; version 4 (21 August 2026, accepted to EMNLP 2026) is the latest. The three 'up to' figures are the same in both."
      suggestion: "correct-to: https://arxiv.org/html/2509.22202v4 (lines 74 and 611)"
      confidence: HIGH
      confidence_rationale: "Version history read from the abstract page; the figures read in both versions."
      citations:
        brief_url: https://arxiv.org/abs/2509.22202
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md, line_range: [611, 611] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/004
      severity: high
      type: recipe-defect
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [212, 218]
      message: "A single quote in a name ends the quoting when the shell reads the assignment, before any case check runs; the 'second check' cannot catch it."
      suggestion: "correct-to the wording in the report; the enforcement decision stays with the human (critique finding 16)"
      confidence: HIGH
      confidence_rationale: "How shell quoting parses; read, not run."
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [212, 218] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/005
      severity: medium
      type: recipe-defect
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [222, 246]
      message: "An unreadable 200 body gives a Node error with no verdict label; curl's exit status is ignored; a 200 with no latest version prints REGISTERED."
      suggestion: "Add the curl exit-status line, '|| echo COULD NOT LOOK' after node, and an empty-version guard"
      confidence: MEDIUM
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [222, 246] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/006
      severity: medium
      type: recipe-defect
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [259, 260]
      message: "The whole-address check lets '/' and '..' in crate and Maven names through, so the request can reach another resource and a 200 there reads REGISTERED."
      suggestion: "Guard each name part separately before building the address; refuse '..' segments"
      confidence: MEDIUM
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [259, 260] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/007
      severity: medium
      type: unexecutable-order
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md
      line_range: [605, 607]
      message: "The look-alike check needs the PyPI upload date, the repository and the maintainer, which the recipes discard; the downloads query has no guarded recipe."
      suggestion: "Print those fields from the same answer (field names to be confirmed live) and add a guarded downloads query"
      confidence: MEDIUM
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md, line_range: [605, 607] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/008
      severity: medium
      type: logic-contradiction
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [169, 169]
      message: "'invented only when the registry has no such name' contradicts change 9's rule on registration after the training cutoff."
      suggestion: "correct-to the wording in the report"
      confidence: HIGH
      confidence_rationale: "Both sentences read side by side."
      citations:
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [169, 169] }]
    - id: citation-validator/d-s4-agent-r1-validate-a/009
      severity: low
      type: citation-framing
      file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md
      line_range: [202, 202]
      message: "Spracklen also obtained names by asking the model (heuristics 2 and 3), not only from install commands."
      suggestion: "correct-to the 'partly … and partly by asking the model' wording"
      confidence: HIGH
      confidence_rationale: "The heuristic 2 and 3 text was read."
      citations:
        brief_url: https://arxiv.org/html/2406.10279
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md, line_range: [202, 202] }]
  self_assessment:
    coverage: 0.93        # 40 of 43 requested items settled
    confidence_overall: MEDIUM
    limitations:
      - "Every quotation was pulled out by the fetch tool's summarising model, not copied byte for byte."
      - "The shell recipes were read, not run."
      - "The budget of 35 fetches and searches is exhausted."
    unknowns:
      - "Whether a missing scoped npm name answers 404 at the %2f address."
      - "Rows 13 and 14; supplement changes S1 to S4; Maven metadata coverage; the npm answer for an unpublished name."
      - "The 76,489 denominator of the 13.4% figure: Python only, or all names."
  metadata:
    tokens_used: null     # not measurable from inside this agent; the schema wants an integer
    tool_calls: 41
```

Injection check: no fetched page addressed a reviewer or an agent. The npm placeholder text is addressed to people who want to adopt the name. The search tool's own formatting note is not page content.

Sources:
- [npm fs/latest](https://registry.npmjs.org/fs/latest) · [npm crossenv](https://registry.npmjs.org/crossenv) · [npm email-validator-pro](https://registry.npmjs.org/email-validator-pro) · [npm @isaacs/cliui](https://registry.npmjs.org/@isaacs%2fcliui) · [npm bcrypt/latest](https://registry.npmjs.org/bcrypt/latest) · [npm downloads](https://api.npmjs.org/downloads/point/last-week/email-validator-pro)
- [PyPI email-validator-pro](https://pypi.org/pypi/email-validator-pro/json) · [PyPI sklearn](https://pypi.org/pypi/sklearn/json) · [PyPI JSON API](https://docs.pypi.org/api/json/) · [PyPI API](https://docs.pypi.org/api/) · [PyPI Index API](https://docs.pypi.org/api/index-api/) · [PyPI quarantine post](https://blog.pypi.org/posts/2024-12-30-quarantine/)
- [Python packaging: distribution and import packages](https://packaging.python.org/en/latest/discussions/distribution-package-vs-import-package/) · [pip news](https://pip.pypa.io/en/stable/news/)
- [crates.io tokio_advanced](https://crates.io/api/v1/crates/tokio_advanced) · [crates.io sparse index](https://index.crates.io/to/ki/tokio_advanced) · [RFC 3463](https://rust-lang.github.io/rfcs/3463-crates-io-policy-update.html) · [Maven Central metadata](https://repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml)
- [npm unpublish policy](https://docs.npmjs.com/policies/unpublish) · [npm threats and mitigations](https://docs.npmjs.com/threats-and-mitigations)
- [Spracklen, HTML](https://arxiv.org/html/2406.10279) · [Spracklen, abstract](https://arxiv.org/abs/2406.10279) · [Krishna](https://arxiv.org/html/2501.19012) · [Twist, abstract](https://arxiv.org/abs/2509.22202) · [Twist, version 3](https://arxiv.org/html/2509.22202v3) · [Twist, version 4](https://arxiv.org/html/2509.22202v4) · [Lasso Security](https://www.lasso.security/blog/ai-package-hallucinations) · [bcrypt README](https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md)

Files: `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round1-critic-d-s4-agent-r1-critic.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round1-critic-supplement-d-s4-agent-r1-critic.md`, `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`