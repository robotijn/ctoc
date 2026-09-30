# Validation of the critic's proposed changes to the hallucination-detector agent (dispatch d-s4-agent-r1-validate-b)

**Summary:** Nothing I checked is refuted. One quoted fact cannot be sourced as written. Three proposed passages contradict the files they cite:
- **Change 7's response:** it would fail `.ctoc/architecture/dispatch-schema.yaml` on three counts. It omits `agent_version` and `completed_at`, and its `tokens_used: null` breaks the schema's integer rule.
- **Change 7's severity table:** it says it "follows the skill's triage table" but downgrades the skill's critical row.
- **Changes 5 and 8:** both hand "every other defect of assistant-written code" to ai-code-quality-reviewer. That agent's own description gives much of that work to other agents.

No test pins any text these changes remove.

## Fetches, in order (11 fetches, 0 searches, out of a budget of 20)
1. `https://axios.rest/pages/advanced/request-config`
2. `https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js`
3. `https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5`
4. `https://raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md`
5. `https://nodejs.org/api/globals.html`
6. `lib/fs.js` again, asking for the end of the file. The tool reported "The content cuts off mid-function" at `realpath.native = (path, options, callback) => {`.
7. `https://raw.githubusercontent.com/nodejs/node/main/doc/api/globals.md`, the source file for page 5.
8. `https://raw.githubusercontent.com/axios/axios/v1.x/README.md`, to confirm who publishes axios.rest.
9. `https://nodejs.org/api/fs.html`. It was truncated before the `readFileSync` section, so it gave nothing.
10. `lib/fs.js` again, asking for the `readFileSync` body.
11. `finished-proposals.md` again, asking for its introduction.

Every quote came through the fetch tool's summarising model, so none is guaranteed byte-exact. S1 and S4 each had two independent sources that agreed.

## Part 1 — external citations

| Item | Verdict | Verbatim evidence | Action |
|---|---|---|---|
| **S1:** axios's request configuration has no `body` key | VALIDATED | The page title is "Request config \| axios \| Promise based HTTP client". It lists 44 keys (url … maxRate) and none is `body`. It says "The `data` is the data to be sent as the request body. … Only applicable for request methods `PUT`, `POST`, `DELETE` , and `PATCH`." The page is axios's own: axios's GitHub README links `<a href="https://axios.rest"><b>Website</b></a>` and `…/pages/getting-started/first-steps.html"><b>Documentation</b></a>`. The README's own Request Config section also has no `body` key. | keep |
| **S2a:** `throwOnError` "appears nowhere in the main branch of Node.js's `lib/fs.js`" | UNSOURCEABLE as a whole-file absence | Fetch 2 answered "does not appear anywhere", but fetch 6 of the same address showed the copy was truncated, so the whole file was never read. I did read the complete `readFileSync` body (fetch 10). It reads only `options.buffer`, `options.encoding` and `options.flag`, after `options = getOptions(options, { flag: 'r' });`. A second route: the installed `node_modules/@types/node/fs.d.ts` (package version 22.19.21) declares only `encoding` and `flag` for `readFileSync` (lines 2914–2952). An exact search found no `throwOnError` in that file. | correct-to: scope the row to `fs.readFileSync`, not "an `fs` call such as" (only `readFileSync` was read). New wording: "Not a `readFileSync` option: on the main branch of Node.js's `lib/fs.js`, the body of `readFileSync` reads `options.buffer`, `options.encoding` and `options.flag`, and never `throwOnError` (…/lib/fs.js, read 2026-09-30)." |
| **S2b:** TanStack's rename sentence | VALIDATED | It is a heading on the page: "### The `useErrorBoundary` option has been renamed to `throwOnError`". The text below it says "…it has been renamed to `throwOnError` to more accurately reflect its functionality." | keep |
| **S3:** the finished-proposals line and the year 2019 | VALIDATED (the quote and the year) | Raw row: "\| [`Array.prototype.{flat,flatMap}`][flat] \| Brian Terlson<br />Michael Ficarra<br />Mathias Bynens \| … \| 2019 \|". The year is in the column "Expected Publication Year". The introduction says "Finished proposals are proposals that have reached stage 4, and are (or soon will be) included in the [latest draft](https://tc39.es/ecma262/) of the specification." The page never names who keeps the list, so the attribution "the ECMAScript standards committee's list" cannot be sourced from it. | correct-to: "the finished-proposals list of the `tc39/proposals` repository gives "`Array.prototype.{flat,flatMap}`" an expected publication year of 2019" |
| **S4:** the two Node.js version lines for global `fetch` | VALIDATED in substance; the quotation is not verbatim | The rendered page is a table: "v21.0.0 \| No longer experimental." and "v18.0.0 \| No longer behind `--experimental-fetch` CLI flag." The source file `globals.md` says `version: v18.0.0` … `description: No longer behind \`--experimental-fetch\` CLI flag.` and `version: v21.0.0` … `description: No longer experimental.` The proposed quote "v18.0.0: No longer behind `--experimental-fetch` CLI flag" joins the version and the text with a colon and drops the final period. That string is not on the page. | correct-to: "Node.js's history table for `fetch` lists version v18.0.0 as "No longer behind `--experimental-fetch` CLI flag." and version v21.0.0 as "No longer experimental." (https://nodejs.org/api/globals.html, read 2026-09-30)" |

S2's second row, the rule row for `autoValidate` and `cacheTimeout`, asserts nothing about either key, so there is nothing in it to source. Its pointer to "Detection Methods, section 2" resolves to the agent file's `### 2. Export Verification` (lines 64 and 85).

## Part 2 — internal consistency

### Change 5 (the role and the "Read the method first" section)

| # | Statement | Verdict | File and line | Quote |
|---|---|---|---|---|
| 1 | "Your tools are Read, Grep and Bash" | Consistent | agent line 4 | `tools: Read, Grep, Bash` |
| 2 | The skill holds the categories, examples across seven languages and the triage table | Consistent | skill lines 61, 75, 380–385 | "## Hallucination Categories", "## 7-Language Coverage", "Triage tier" table |
| 3 | The eight commands change 5 lists are ones the skill gives | Consistent, all eight present | skill lines 119, 246, 253, 138, 280, 281, 154, 175 | `python -c "import django.core.validators as m; …"`, `require('package-name')`, `importlib.import_module('package_name')`, `dotnet add package NewtonsoftEx.AdvancedJson`, `npm ci && npm audit --omit=dev`, `pip install -r requirements.txt && pip-audit`, `mvn dependency:resolve`, `go mod download github.com/uber-go/cachepro` |
| 4 | The skill's existence tests | Consistent | skill lines 46–47 | "`npm view <pkg>` returns a non-empty JSON object"; "`pip index versions <pkg>` succeeds" |
| 5 | Sections "Severity", "Letter schema" and "Refinement Loop — critic mode" | Consistent as prefixes; each real heading has a suffix | skill lines 376, 397, 428 | "## Severity (internal triage vs. refinement-loop output)"; "## Letter schema (refinement-loop output contract)"; "## Refinement Loop — critic mode (v6.9.8)" |
| 6 | "Tool Integration (2026)", including its pre-merge gate | Consistent | skill lines 264, 276 | "## Tool Integration (2026)"; "Recommended pre-merge gate (CI):" |
| 7 | The red-line sentence (quoted by change 1a) | Consistent | skill lines 389, 395 | "NEVER auto-install a hallucinated dependency to "see if it works" — that's exactly the slopsquatting attack path." |
| 8 | "the loop is **NOT RUNNING** today" | Consistent, verbatim | `docs/REFINEMENT_LOOP.md` line 8 | "## Status: this is a design record — the loop is **NOT RUNNING** today" |
| 9 | The skill's categories for a cited vulnerability identifier, a cited measurement and a docstring contradiction | Consistent | skill lines 71–73, 410–412 | `hallucinated_cve`, `hallucinated_benchmark`, `claim_contradicted_by_docstring` |
| 10 | dependency-checker owns vulnerabilities, outdated versions and licences | Consistent; "unmaintained" is claimed by dependency-auditor, not dependency-checker | `agents/security/dependency-checker.md` line 3 | "Audits dependencies for vulnerabilities, outdated versions, and license issues (quick scan)." |
| 11 | dependency-auditor owns the whole dependency graph and its typosquat check | Consistent; its description does not claim licences | `agents/security/dependency-auditor.md` line 3 | "walks the full transitive dependency graph … flags typosquats, install-time hook abuse and unmaintained packages" |
| 12 | ai-code-quality-reviewer owns stale framework idioms, and so "exists in another version" | Consistent | `agents/ai-quality/ai-code-quality-reviewer.md` lines 3 and 40 | "An interface that is deprecated or removed in the framework version the project pins, or that exists only in a later version." |
| 13 | "every other defect of assistant-written code: ai-code-quality-reviewer" | **Inconsistent** | same file, lines 3 and 45 | "leaves naming, comment, error-handling and structure review to code-reviewer"; line 45 hands further classes to about twenty other agents. Correct-to: "a misread request, incomplete output, missing edge cases, over-engineering, fabricated patterns, vacuous tests, tests changed to pass, and changes to a coding assistant's configuration: ai-code-quality-reviewer" |
| 14 | type-checker owns a real call given an argument of the wrong type | Consistent | `agents/quality/type-checker.md` line 3; sibling line 45 | "Static type analysis …"; "a real call given an argument of the wrong type (type-checker)" |
| 15 | citation-validator owns citation-shaped claims in skill and agent files | Consistent | `agents/ai-quality/citation-validator.md` line 3 | "validator of citation-shaped claims in skill/agent markdown" |
| 16 | "You dispatch no one" | Consistent | agent line 8; `docs/DISPATCH_PROTOCOL.md` line 54 | `reports_to: cto-chief`; "Tier 2 cannot dispatch (enforced)" |
| 17 | `reviewer_directed_instruction` with severity high, taken from the sibling | Consistent | sibling line 75 | "Report it as a finding of type `reviewer_directed_instruction`, severity high, quoting it." |
| 18 | `coverage` redefined as the share of names and members settled (also in change 7) | **Different meaning** from the protocol; the machine schema only bounds the value to 0–1 | protocol line 129; schema lines 116–119 | "fraction of changed lines analyzed" |

### Change 7 (severity, confidence and the response format)

| # | Statement | Verdict | File and line | Quote |
|---|---|---|---|---|
| 19 | The five severity levels | Consistent | protocol line 97; schema line 147 | `critical \| high \| medium \| low \| info` |
| 20 | "The levels below follow the skill's triage table" | **Inconsistent on two rows.** (a) The skill rates a registered hallucinated name as critical; change 7 rates `suspected_lookalike`, and a `hallucinated_import` registered after the training cutoff, as high. (b) Change 7 narrows the skill's "security-critical path" to authentication, authorisation or cryptography. The other rows match. | skill lines 382–385 | "Hallucinated package that an attacker has already registered (slopsquatting hit)" is CRITICAL; "fictional function in security-critical path" is HIGH. Correct-to: say "except that a registered look-alike is high, not critical, because a registry answer cannot show intent" |
| 21 | Confidence values and their criteria | Consistent | protocol lines 148, 185–187; schema line 165 | `HIGH/MEDIUM/LOW`; "Deterministic measurement … → HIGH" |
| 22 | Field names and nesting that change 7 uses | Consistent with the protocol's example | protocol lines 87–139 | — |
| 23 | Required response fields | **Missing `agent_version` and `completed_at`** | schema line 88 | `required: [dispatch_id, protocol_version, agent, agent_version, completed_at, findings, self_assessment, metadata]` |
| 24 | `tokens_used: null` | **Fails the schema**, and the field is required. This is a real fork: `null` is honest, but `0` would be an invented measurement. The schema's owner has to decide. | schema line 134; protocol line 149 | `tokens_used: { type: integer, minimum: 0 }` |
| 25 | No `citations.brief_url` | **Inconsistent with the protocol text**; the machine schema makes it optional (line 173) | protocol lines 204–209 | "Every finding must include: … **Brief URL** … Without citations, the finding is treated as LOW confidence" |
| 26 | Extra fields `registry_checked` and `registry_response` | Not defined anywhere. The protocol text is silent on fields an agent adds (line 261 is about revising the protocol). The schema has no `additionalProperties: false` (whole file read), so under JSON Schema's default rule these fields validate. | schema lines 139–188 | — |
| 27 | The `type` values | Permitted. All seven skill `kind` values are reused verbatim; five are added (`registry_placeholder`, `suspected_lookalike`, `renamed_package`, `wrong_package_for_environment`, `reviewer_directed_instruction`). | protocol line 98; skill lines 406–412 | "# category-specific" |
| 28 | `registry_checked` and `registry_response` take the skill's names and values | Consistent; the list of allowed values is identical | skill lines 416–417 | `npm \| pypi \| maven \| nuget \| cargo \| goproxy \| pg_available_extensions \| nvd \| none`; `"HTTP 404"` |

### Change 8 (the new frontmatter description)

| # | Statement | Verdict | File and line | Quote |
|---|---|---|---|---|
| 29 | A valid single-line YAML plain scalar | Consistent. An exact search for a second `": "`, a `" #"` or a trailing colon on the proposed line found none. | critic report line 564 | — |
| 30 | Every dispatch phrase kept byte for byte | Consistent. An anchored exact match of both the first sentence and the "Dispatch when …" sentence hit line 564, and the same sentences are on agent line 3. | — | — |
| 31 | "leaves … to dependency-checker and dependency-auditor" | Consistent, taking the two agents together | rows 10–11 | — |
| 32 | "every other defect of assistant-written code to ai-code-quality-reviewer" | **Inconsistent**, same as row 13 | — | — |

### Tests

No test pins "Hallucination Detection Report", "Output Format", "Prevention Tips" or "Common AI Hallucinations" for this agent (exact search of `tests/**/*.test.js`). The four files that name the agent:

- **`tests/critic-warnings-are-critical.test.js`** reads the skill file, not the agent file (line 61).
- **`tests/skill-loading.test.js`** matches the skill's `when_to_load` phrases (lines 272–277), not the agent's description.
- **Two golden-corpus fixture files** only mention the agent; they do not read it.

Fences that walk every agent file:

- **`tests/agent-honest-status-fence.test.js`** pins the honest-status reference. The proposed text keeps it: change 15 deletes only agent lines 198–205, and the honest-status section at lines 207–209 stays.
- **`tests/watcher-shape.test.js`** pins section headings only for conforming agents. This agent is listed as legacy (`.ctoc/watcher-baseline.json` line 14), so its headings are not pinned.
- **`tests/cu5-s4-compliance-aiquality-wrappers.test.js`** does not list this agent (lines 27–30).

### Wording a person reads, across all proposed new texts

- **Gate numbers:** none.
- **Invented abbreviations:** none.
- **Unexpanded acronyms in prose (fixable):**
  - "JSON object" (change 5)
  - "JSON API" (change 2, amended; change 9)
  - "HTTP 404" and "HTTP 200" in prose (change 2's observation paragraph; change 4's Rust comment and paragraph; change 7's example `message` and `rationale`)
  - "README" (changes 2 and 4)
  - "CTO Chief" (changes 5 and 7). This is the coordinator's proper name, so it is arguably fine.
- **Acronyms inside verbatim quotes (keep, or add a gloss):** "CLI flag" (S4), "NodeJS" (the bcrypt README quote in change 4), "All API requests are cached" (change 2).
- **Code and machine values (fine):** `JSON.parse`, the recipes' echo strings, and the identifiers `hallucinated_cve` and `nvd`.
- **Change 8:** "AI" and "APIs" appear only in the retained sentences, which must stay byte-identical. The added sentences introduce no acronym.
- **S3:** removes the earlier "ES2019".

## Counts

| Part | Checked | Result |
|---|---|---|
| Part 1 | 5 claims | 4 validated (S1, S2b, S3, S4), and two of those need wording corrections (S3's attribution, S4's quotation form). 1 unsourceable (S2a). 0 refuted, 0 stale. |
| Part 2 | 32 statements | 22 consistent; 2 consistent only partly (rows 10 and 11); 7 inconsistent (rows 13, 20, 23, 24, 25, 32, plus the coverage meaning in row 18); 1 not defined by the protocol but valid under the schema (row 26). |

## Not checked

- **Assigned to the other dispatch:** changes 1a, 2, 4 and 9, and the supplement's list of details to confirm (the `time.created` field path, where the npm placeholder sentence appears, a 404 for a missing scoped name, the bcrypt README sentence, the name "@isaacs/cliui").
- **`lib/fs.js` beyond the truncation point,** so the claim that `throwOnError` appears nowhere in the whole file.
- **Two helpers that `readFileSync` hands `options` to,** `validateReadFileBufferOptions` and `getReadFileBufferByteLengthName`. They may read other option keys.
- **Whether `go list -m …@latest`** (skill lines 174 and 236) downloads the module. Change 5 does not list it.
- **`tests/helpers/agent-resolver.js`,** not read in full.
- **No test or fence was run.** I have no Bash tool, so the gate-words, unexecutable-instruction, compliance-claims and reachability fences were not run against the proposed text.
- **ai-code-quality-reviewer.md past line 60.**
- **TanStack Query's version 5 reference for `throwOnError`.** Only the migration guide was read.
- **Byte-exactness of every quote,** because each one passed through the fetch tool's model.

Files: `/Users/account/Code/ctoc/.ctoc/architecture/dispatch-schema.yaml`, `/Users/account/Code/ctoc/docs/DISPATCH_PROTOCOL.md`, `/Users/account/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`, `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md`, `/Users/account/Code/ctoc/node_modules/@types/node/fs.d.ts`