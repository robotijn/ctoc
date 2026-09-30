**Re-validation of `agents/ai-quality/hallucination-detector.md` after round 1 (dispatch `d-s4-agent-r1-revalidate`)**

The edited file is in good shape: 82 of its 85 citation-shaped claims check out, and nothing is refuted. Three items need action before it ships:

1. **The response template breaks the machine schema the file says it follows.** Line 364 writes `tokens_used: null`. `.ctoc/architecture/dispatch-schema.yaml` line 134 requires an integer of 0 or more (`tokens_used: { type: integer, minimum: 0 }`), and line 132 makes the field mandatory. Round 1's second validator (row 24) already called this a fork for whoever owns the schema. It is still open.
2. **Line 135 has an unsourced comparison.** It says the character check "is meant to be stricter than any registry's". No source was read that supports this. The first research note says, in its own words rather than a quotation, that npm limits names to 214 characters, and this rule sets no length limit at all.
3. **Line 167 is now out of date.** It says a missing scoped name at the `%2f` address "was not checked". I checked it today and it answered 404.

Every other quotation matches the wording today's reports validated, character for character. That includes all six places where round 1 applied a correction: the Twist sentences, the PyPI quarantine sentence, the Spracklen method, the Node.js fetch history, the finished-proposals row, and the `readFileSync` body.

## Claims in file order

"Local" means I read the repository file this session. "Report A" and "Report B" are today's validation reports. "Research" and "Gaps" are the two research notes.

| # | Line | Claim | Verdict | Basis |
|---|---|---|---|---|
| 1 | 3 | The term "slopsquatting" | VALIDATED | Research, Part A, row for line 3 |
| 2 | 3 | Handoffs in the description to dependency-checker, dependency-auditor and ai-code-quality-reviewer | VALIDATED | Local: line 3 of each agent's file |
| 3 | 4, 18 | Tools are Read, Grep and Bash | VALIDATED | Local: frontmatter line 4 |
| 4 | 22 | The skill holds the categories, examples in seven languages, and the triage table | VALIDATED | Local: skill headings at lines 61, 75 and 380 |
| 5 | 24 | The eight install/load/run commands are in the skill | VALIDATED | Local: skill lines 119, 246, 253, 138, 280, 281, 154, 175 |
| 6 | 25 | The skill's existence tests: `npm view <pkg>` returns a non-empty result, `pip index versions <pkg>` succeeds | VALIDATED | Local: skill lines 46–47 |
| 7 | 25 | `npm view` reports a name npm holds as a placeholder as existing | VALIDATED | Research, Part A, rows for lines 68–69 (`fs`, `crossenv`) |
| 8 | 26 | The three skill section headings, exact | VALIDATED | Local: skill lines 376, 397, 428 |
| 9 | 26 | "the loop is **NOT RUNNING** today" | VALIDATED | Local: `docs/REFINEMENT_LOOP.md` line 8, exact, bold markers included |
| 10 | 27 | "Tool Integration (2026)" and its pre-merge gate | VALIDATED | Local: skill lines 264 and 276 |
| 11 | 39 | The skill's `hallucinated_cve`, `hallucinated_benchmark` and `claim_contradicted_by_docstring` categories | VALIDATED | Local: skill lines 410–412 |
| 12 | 43 | dependency-checker owns vulnerabilities, outdated versions and licences | VALIDATED | Local: `agents/security/dependency-checker.md` line 3 |
| 13 | 44 | dependency-auditor owns the transitive graph, unmaintained packages and typosquats | VALIDATED | Local: `dependency-auditor.md` line 3 |
| 14 | 45 | ai-code-quality-reviewer owns stale framework idioms (deprecated, removed, or only in a later version) | VALIDATED | Local: `ai-code-quality-reviewer.md` line 40 |
| 15 | 46 | ai-code-quality-reviewer's classes, including what it calls fabricated patterns | VALIDATED | Local: that file's lines 3, 18 and 38 (Report B row 13's correction is applied) |
| 16 | 47 | code-reviewer owns naming, comments, error handling and structure | VALIDATED | Local: ai-code-quality-reviewer line 3; code-reviewer line 3 |
| 17 | 48 | type-checker owns a real call given an argument of the wrong type | VALIDATED | Local: ai-code-quality-reviewer line 45 |
| 18 | 49 | citation-validator owns citation-shaped claims | VALIDATED | Local: `citation-validator.md` line 3 |
| 19 | 51 | "You dispatch no one"; CTO Chief decides what runs next | VALIDATED | Local: frontmatter `reports_to`; `DISPATCH_PROTOCOL.md` line 54; `agents/coordinator/cto-chief.md` exists |
| 20 | 59, 324 | The protocol's "fraction of changed lines analyzed" | VALIDATED | Local: `DISPATCH_PROTOCOL.md` line 129 |
| 21 | 70–71, 275 | `react-query` still installs and was renamed to `@tanstack/react-query` at v4 | VALIDATED | Research, Part A, rows for lines 24 and 25 |
| 22 | 73 | bcrypt has `hashSync` | VALIDATED | Gaps 1a |
| 23 | 74 | bcrypt's install script is "node-gyp-build" | VALIDATED | Report A row 30 |
| 24 | 75–76 | bcrypt readme sentence "Pre-built binaries … best-effort basis." and its address | VALIDATED | Report A row 31 and Gaps 1b; identical text |
| 25 | 77, 276 | Use bcryptjs where native builds are not available | VALIDATED | Gaps 2 |
| 26 | 85–87 | `tokio_advanced` answered 404 at both crates.io addresses | VALIDATED | Report A rows 19 and 34 |
| 27 | 91 | email-validator-pro: name, "1.0.1", created "2017-05-18T04:34:21.018Z" | VALIDATED | Report A rows 28 and 32 |
| 28 | 91, 185 | PyPI answered 404 for email-validator-pro | VALIDATED | Report A rows 16 and 33 |
| 29 | 91 | The definition of an invented name, including the training-cutoff clause | VALIDATED | Identical to Report A's corrected wording; source is row 39 |
| 30 | 97 | axios's request configuration has no `body` key (axios.rest) | VALIDATED | Report B, first external item (axios `body` key) |
| 31 | 98 | GET takes no body; use `params` | VALIDATED | Gaps 3a |
| 32 | 101, 258, 283 | moment has no `formatISO`; it is a date-fns function | VALIDATED | Gaps 4a and 4b for date-fns and moment instances. Fetch 2 for the static `moment.formatISO`: "formatISO" does not appear in `src/moment.js` |
| 33 | 104 | `readFileSync` has no `throwOnError` option | VALIDATED | Gaps 5a; Report B's `lib/fs.js` item |
| 34 | 110 | Django has no `validate_strong_password` | VALIDATED | Research, Part A, row for line 55 |
| 35 | 113 | FastAPI has no `auto_validate` parameter | VALIDATED | Gaps 6 |
| 36 | 118 | `useAutoFetch` is not a standard React hook | VALIDATED | Gaps 7a |
| 37 | 125 | Spracklen: names taken partly from install commands and partly by asking the model; the "no way to definitively determine" quotation; the authors | VALIDATED | Report A rows 5, 6, 7; identical to row 5's correction |
| 38 | 129 | npm holds `fs` with version "0.0.1-security" | VALIDATED | Report A row 8 |
| 39 | 131 | The Python packaging quotation "PyPI and other package indices do not enforce any relationship …" | VALIDATED | Report A row 9 |
| 40 | 132 | "The project is matched case-insensitively …" | VALIDATED | Report A row 10 |
| 41 | 133 | "8.7% (6,705/76,489) …" | VALIDATED | Report A row 11 |
| 42 | 135 | The rule "is meant to be stricter than any registry's" | **UNSOURCEABLE** | See correction 2 below |
| 43 | 135 | The recipe's second check cannot catch a single quote | VALIDATED (reasoning, not a source) | Report A, recipe defect 1; identical wording |
| 44 | 150 | npm answer fields `dist-tags.latest`, `description`, `time.created` | VALIDATED | Report A rows 21 and 28 |
| 45 | 155–157, 167 | The last-week downloads address and its `downloads` field | VALIDATED | Report A row 40 |
| 46 | 167 | `@isaacs%2fcliui` answered 200 with the name "@isaacs/cliui" | VALIDATED | Report A row 12 |
| 47 | 167 | A missing scoped name at `%2f`: "was not checked" | **SUPERSEDED** | Fetch 1 answered 404. See correction 3 below |
| 48 | 178 | PyPI `info.name`, `info.version`, `info.summary` | VALIDATED | Report A row 29 |
| 49 | 185 | The PyPI documentation lists only "200 OK - no error" | VALIDATED | Report A row 15, and fetch 4: the page reads "- `200 OK` - no error" twice, and "404" does not appear. The text matches once the code formatting is removed |
| 50 | 185 | The two pip 25.1 lines | VALIDATED | Report A row 17 |
| 51 | 191 | The crates.io policy quotations (RFC 3463) | VALIDATED | Report A row 18 |
| 52 | 192 | `commons-security` metadata answered 404 | VALIDATED | Report A row 20 |
| 53 | 212 | The skill's Postgres extension check queries a database | VALIDATED | Local: skill line 240, `psql -c "SELECT * FROM pg_available_extensions …"` |
| 54 | 216 | `crossenv`: "0.0.2-security", "security holding package" | VALIDATED | Report A row 21 |
| 55 | 216 | `sklearn` summary | VALIDATED | Report A row 22 |
| 56 | 216 | "we'll probably give it to you if you want it" | VALIDATED | Report A row 23 |
| 57 | 218 | "until 24 hours have passed" | VALIDATED | Report A row 24 |
| 58 | 218 | PyPI quarantine: "complete removal of the Project from the PyPI database" and "is often coupled with prohibiting the Project name from being reused" | VALIDATED | Report A row 25; identical to its correction |
| 59 | 218 | "All API requests are cached" | VALIDATED | Report A row 26 |
| 60 | 219 | npm's "A variant of this attack …" | VALIDATED | Report A row 27 |
| 61 | 222 | Spracklen's adversary sentence | VALIDATED | Report A row 35 |
| 62 | 222 | "43% of hallucinated packages were repeated in all 10 queries" | VALIDATED | Report A row 36 |
| 63 | 222 | huggingface-cli, "more than 30k authentic downloads" (Lanyado, Lasso Security) | VALIDATED | Report A row 37 |
| 64 | 224 | "Only 13.4% … Levenshtein distance of 1 or 2" | VALIDATED | Report A row 38 |
| 65 | 226 | Krishna: "was first registered after the model's knowledge cutoff date" | VALIDATED | Report A row 39 |
| 66 | 227 | PyPI `downloads` "is always `-1` and should not be used" | VALIDATED | Report A row 41 |
| 67 | 232 | Twist: seven models writing Python; the figures 26%, 99% and 85%; version 4 address | VALIDATED | Report A rows 2, 4 and 42 |
| 68 | 236 | The skill's red line "see if it works" / "exactly the slopsquatting attack path", under "Red Lines" | VALIDATED | Local: skill lines 389 and 395; Report A row 1 |
| 69 | 244 | Twist: "(mostly ≈ 0%)" and "(mostly 1%–5%) across all LLMs." | VALIDATED | Report A row 3; identical to its correction |
| 70 | 250 | `AxiosRequestConfig` has no `body` field; the payload goes in `data` | VALIDATED | Gaps 3b (documentation), and fetch 3 (`index.d.ts`): no `body` property, and `data?: D;` |
| 71 | 277 | Node.js `fetch` history for v18.0.0 and v21.0.0 | VALIDATED | Report B, Node.js `fetch` history item; identical to its correction |
| 72 | 278 | `axios.post` takes `data`, not `body` | VALIDATED | Gaps 3c |
| 73 | 283 | `moment().toISOString()` exists | VALIDATED | Gaps 4c |
| 74 | 284 | lodash has `cloneDeep`, not `deepClone` | VALIDATED | Gaps 10 |
| 75 | 285 | The TC39 finished-proposals row and the year 2019 | VALIDATED | Report B, finished-proposals item; identical to its correction |
| 76 | 286 | `React.useAutoEffect` does not exist | VALIDATED | Gaps 7b |
| 77 | 291 | The body of `readFileSync` reads only `buffer`, `encoding` and `flag` | VALIDATED | Report B, `lib/fs.js` item; identical to its correction |
| 78 | 291 | TanStack Query version 5 renamed `useErrorBoundary` to `throwOnError` | VALIDATED | Report B, TanStack rename item |
| 79 | 296 | The protocol's five severity levels | VALIDATED | Local: protocol line 97; schema line 147 |
| 80 | 296 | The severity table follows the skill's triage table, with one declared departure (the "slopsquatting hit" row) | VALIDATED | Local: I compared all 15 rows with skill lines 382–385. Every row either matches, is not named by the skill, or is the declared departure |
| 81 | 324 | The protocol's machine form is `.ctoc/architecture/dispatch-schema.yaml` | VALIDATED | Local: the schema's header says "CTOC Dispatch Protocol v1 — JSON Schema (in YAML form)" |
| 82 | 324 | `registry_checked` and `registry_response` take their names and values from the skill's letter schema | VALIDATED | Local: skill lines 416–417; the value lists are identical |
| 83 | 327–365 | The template carries every required field | VALIDATED | Local: all 8 response fields, 7 finding fields, 2 self-assessment fields and 2 metadata fields are present |
| 84 | 364 | `tokens_used: null` fits the schema | **MISMATCH** | See correction 1 below |
| 85 | 374 | The honest-status fragment exists | VALIDATED | Local: `skills/agent-fragments/honest-status.md` line 1 |

## Corrections, with the exact file text

**1. Line 364: the file and the schema disagree.**
- File: `tokens_used: null  # not measurable from inside this agent; never estimate it`
- Schema, line 134: `tokens_used: { type: integer, minimum: 0 }`
- This is a decision for whoever owns the schema, so I present the two options without picking one:
  - **Change the schema** to allow null (`type: [integer, "null"]`). This edits the schema file, not this one.
  - **Keep the template and say so openly.** Add to line 324: "`metadata.tokens_used` is `null`, which the machine schema rejects because it requires an integer. This is deliberate: a count this agent cannot measure would be invented."

**2. Line 135: the unsourced comparison.**
- File: "This rule is this file's own and is meant to be stricter than any registry's."
- Corrected: "This rule is this file's own, written for the shell. It is not a registry's naming rule, and a name that passes it can still be one a registry would refuse."
- Recommended action: remove the unsupported comparison.

**3. Line 167: now checked.**
- File: "Whether a missing scoped name answers 404 at that address was not checked; any answer other than 200 or 404 reads COULD NOT LOOK."
- Corrected: "A scoped name made up for the probe, `@qzvxkj-no-such-scope-20260930/qzvxkj-no-such-pkg-20260930`, answered with status 404 (not found) at https://registry.npmjs.org/@qzvxkj-no-such-scope-20260930%2fqzvxkj-no-such-pkg-20260930 on 2026-09-30; any answer other than 200 or 404 reads COULD NOT LOOK."

## Counts

| Verdict | Count |
|---|---|
| Claims | 85 |
| Validated | 82 |
| – by today's reports (web sources) | 53 |
| – by my own reads of repository files | 26 |
| – by my fetches (rows 32 and 70 also lean on report evidence; row 49 is also validated by Report A) | 3 |
| Refuted | 0 |
| Unsourceable | 1 (row 42) |
| Mismatched | 1 (row 84) |
| Superseded by a fetch | 1 (row 47) |
| Misattributed | 0 |

## Fetches, in order (4 of the 25 allowed; no searches)

1. `https://registry.npmjs.org/@qzvxkj-no-such-scope-20260930%2fqzvxkj-no-such-pkg-20260930`: status 404; the body was not returned.
2. `https://raw.githubusercontent.com/moment/moment/develop/src/moment.js`: "formatISO" does not appear in the file.
3. `https://raw.githubusercontent.com/axios/axios/v1.x/index.d.ts`: `AxiosRequestConfig` has no `body` property, and `data?: D;` is present.
4. `https://docs.pypi.org/api/json/`: "- `200 OK` - no error" appears twice, and "404" does not appear.

None of the four pages contained text aimed at a reviewer or an agent.

## What I did not check

- **The file's fingerprint** (`sha256:c399cc87…`). I have no hashing tool, so I cannot confirm I read that exact revision.
- **Whether the fetch tool sent `%2f` byte for byte.** I cannot observe that, so row 47's 404 is as the tool reported it.
- **Byte-exactness of quotations.** Every quotation, in the reports and in my four fetches, passed through the fetch tool's summarising model.
- **The recipes.** They were read, not run.
- **Report A's rows 13 and 14.** The file no longer makes either claim, so I spent no fetch on them. The npm recipe's 404 branch for an unscoped name rests on Gaps row 13a, an observed 404.
- **Two helper functions in `lib/fs.js`** that `readFileSync` hands its options to. Report B did not read them either. The claim in row 77 is limited to the function's own body, so it holds.
- **The denominator behind the 13.4% figure.** Report A left it unsettled, and the file states no scope for it.
- **The protocol's dispatch identifier pattern.** It requires a 26-character sortable identifier. An identifier like this dispatch's (`d-s4-…`) fails it whatever the agent writes; that is outside this file.

## Structured response

```yaml
response:
  dispatch_id: "d-s4-agent-r1-revalidate"   # not the schema's 26-character pattern; used as given
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null        # no clock available to this agent; never an invented time
  findings:
    - id: citation-validator/d-s4-agent-r1-revalidate/001
      severity: high
      type: citation-unsourceable
      file: agents/ai-quality/hallucination-detector.md
      line_range: [135, 135]
      message: '"meant to be stricter than any registry''s" has no source; the research note (its own words, not a quotation) says npm limits names to 214 characters, and this rule has no length limit.'
      suggestion: "strip-the-specificity: \"This rule is this file's own, written for the shell. It is not a registry's naming rule, and a name that passes it can still be one a registry would refuse.\""
      confidence: MEDIUM
      citations:
        evidence: [{ file: agents/ai-quality/hallucination-detector.md, line_range: [135, 135] }]
    - id: citation-validator/d-s4-agent-r1-revalidate/002
      severity: medium
      type: citation-mismatch
      file: agents/ai-quality/hallucination-detector.md
      line_range: [364, 364]
      message: "The template writes tokens_used: null; dispatch-schema.yaml line 134 requires an integer of 0 or more, and line 132 makes the field mandatory. This is the fork Report B (row 24) left for the schema's owner."
      suggestion: "An owner decision: either allow null in the schema, or state the deliberate departure at line 324."
      confidence: HIGH
      confidence_rationale: "Both files read this session; the schema type is quoted."
      citations:
        evidence:
          - { file: agents/ai-quality/hallucination-detector.md, line_range: [364, 364] }
          - { file: .ctoc/architecture/dispatch-schema.yaml, line_range: [132, 134] }
    - id: citation-validator/d-s4-agent-r1-revalidate/003
      severity: info
      type: citation-superseded
      file: agents/ai-quality/hallucination-detector.md
      line_range: [167, 167]
      message: "The missing-scoped-name case was 'not checked'; a probe at the %2f address answered 404 on 2026-09-30."
      suggestion: "correct-to the wording in correction 3 above"
      confidence: HIGH
      confidence_rationale: "Status returned by the fetch tool during this dispatch: HTTP 404 Not Found."
      citations:
        brief_url: https://registry.npmjs.org/@qzvxkj-no-such-scope-20260930%2fqzvxkj-no-such-pkg-20260930
        evidence: [{ file: agents/ai-quality/hallucination-detector.md, line_range: [167, 167] }]
  self_assessment:
    coverage: 1.0
    confidence_overall: MEDIUM
    limitations:
      - "All quotations passed through the fetch tool's summarising model; none is byte-verified."
      - "The file's fingerprint was not verified; there is no hashing tool."
      - "The recipes were read, not run."
    unknowns:
      - "Whether the fetch tool preserved %2f byte for byte."
      - "The two option helpers inside lib/fs.js."
  metadata:
    tokens_used: null   # not measurable here; the schema wants an integer (the same fork as finding 002)
    tool_calls: 24
```

Files: `/Users/account/Code/ctoc/agents/ai-quality/hallucination-detector.md`, `/Users/account/Code/ctoc/.ctoc/architecture/dispatch-schema.yaml`, `/Users/account/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`, `/Users/account/Code/ctoc/docs/DISPATCH_PROTOCOL.md`, `/Users/account/Code/ctoc/docs/REFINEMENT_LOOP.md`