<!-- saved verbatim by the session from subagent a5fe96f3692e3ba10 (ctoc:ai-quality:citation-validator), dispatch d-s4-post-kickback-revalidate, 2026-09-30 23:20 CEST -->

**Result.** Most of the text added or changed since the last two re-reads holds up against the sources, but not all of it. I found eight claims that are false or wrongly attributed as written, and the executor must fix them:

1. Skill line 56 still says the PyPI recipe tells a held name apart. Since the Step 10 return it prints no placeholder label.
2. Both files tell a pipeline to "fail on any line other than REGISTERED". On every status 200 answer, the npm recipe also prints a DOWNLOADS line.
3. Skill line 346 says `npm audit` includes development dependencies. That is untrue when NODE_ENV is set to production.
4. Wrapper line 151 says "the recipe's second check" refuses a quoted name. That is true only for the npm recipe; PyPI refuses it on its first check, and crates.io/Maven with its `bad()` check.
5. Skill line 92 cites react-codeshift's answer for a block that has no react-codeshift in it.

The claims you named specifically hold:
- the date-fns `formatISO` and moment `toISOString` claims;
- the held-name rule and its evidence;
- the "shares at least one maintainer" rule;
- the C17 compile sentence;
- the Conan and vcpkg sentence;
- the `created`-date limit.

I made 23 fetches and 1 search, out of the 30 allowed. No fetched page contained text aimed at a reviewer.

## Wrapper: `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`

| Line | Claim | Verdict | Source sentence |
|---|---|---|---|
| 18 | The only file created is the recipe's `mktemp` file, and it is deleted | VERIFIED | Recipes: `trap 'rm -f "$body"' EXIT`. The crates.io recipe writes to `/dev/null`. Session note: "No temporary file left behind" |
| 25 | The skill records addresses for NuGet, the Go module proxy, ConanCenter and vcpkg, plus a Postgres query | VERIFIED | Skill lines 57, 58, 60 and 264–269 |
| 49 | C and C++ language issues go to sast-scanner | VERIFIED (the two files agree) | Skill 256: "use [[security/sast-scanner]] for the language itself". The agent exists. There is a lead below |
| 71, 100, 124 | "Node.js 24 ran the section 4 patterns"; checked against documentation, registry or source | VERIFIED | Round-3 session note: "Pattern evasions … in Node"; tool versions "node v24.14.1" |
| 113 | The decorated example "parses under Python 3.9.6" | VERIFIED | Round-2 session note: "after: parses"; "Python 3.9.6" |
| 151 | The Step 13 security review checked the quoted-name handling in bash 3.2.57 and zsh 5.9 | VERIFIED | Step 13 note, line 33: "in bash 3.2.57 and zsh 5.9, the payload … was read as literal text and then refused by the recipe's own character check." |
| 151 | "the recipe's second check refuses it" | REFUTED for two of the three recipes | npm refuses on its second `case`. PyPI refuses on its first `case`, and crates.io/Maven in `bad()`. See the Step 13 wording quoted above |
| 151 | A line break followed by the end marker is not stopped | VERIFIED | Session note: the three-line name "DID run the third line as shell code" |
| 152 | A refusal ends the call with `exit 0` | VERIFIED | Recipe code |
| 170, 184 | HELD BY NPM is printed only when `maintainers` is exactly `npm` and the version ends in `-security` or the description matches | VERIFIED (the code and the prose agree) | `held=mm.length===1&&…mm[0].name==="npm"&&(/-security$/…\|\|/security holding package/i…)` |
| 184 | `fs` and `crossenv` have `maintainers` `["npm"]`; email-validator-pro, react-codeshift and sigstore do not; `fs`'s `_npmUser.name` is a person | VERIFIED | Live today: fs "Top-level maintainers: npm", "_npmUser name: ehsalazar"; crossenv maintainers "npm", description "security holding package", latest "0.0.2-security"; email-validator-pro "grafluxe"; react-codeshift "debugducky". Sigstore rests on the session note |
| 184 | Every value goes through `JSON.stringify`, and an unreadable answer prints a fixed COULD NOT LOOK line | VERIFIED | Recipe code |
| 205 | The PyPI recipe prints no placeholder label; the "Deprecated, use X instead" risk; the Step 13 attribution | VERIFIED | Step 13 note: "A PyPI summary reading "Deprecated, use reqeusts-pro instead" printed `HELD BY PYPI`"; fix: "remove the HELD label" |
| 205 | The PyPI documentation lists only "200 OK - no error" | VERIFIED | docs.pypi.org/api/json/, today: "`200 OK` - no error" |
| 244 | crossenv, the sklearn summary, and npm's "we'll probably give it to you if you want it" | VERIFIED | Live today. fs: "…and we'll probably give it to you if you want it." sklearn: "deprecated sklearn package, use scikit-learn instead" |
| 250 | "fail on any line other than REGISTERED" | REFUTED against the printed vocabulary | On any status 200 answer the npm recipe prints a second line: `DOWNLOADS LAST WEEK n` or `DOWNLOADS NOT READ`. The REGISTERED line also carries fields after the word |
| 250 | Every recipe exits with status 0 | VERIFIED | Recipe code |
| 256 | Whether npm keeps `created` across an unpublish and a new registration was not checked | VERIFIED as a declared limit, and supported | Session note: "Not run: … whether time.created survives an npm name transfer". Today, fs `time`: `"created": "2014-06-02T02:18:51.732Z"`, `"0.0.1-security": "2016-08-23T17:56:58.976Z"`. `created` survived the name passing to npm's hold (optional correction 11) |
| 257 | The PyPI `downloads` field "is always `-1` and should not be used" | VERIFIED | Documentation today: "this key is always `-1` and should not be used." |
| 258 | A valid attestation shows only where a package was built | Not a citation (the file's own reasoning) | — |
| 260, 337, 350 | Renamed predecessor = "shares at least one maintainer"; precedence over the download comparison; the high route otherwise | VERIFIED (the three rows and skill 408 agree) | The session probe: react-query `tannerlinsley,tkdodo` against @tanstack `tannerlinsley,alemtuzlak,kevinvandy`. My two fetches were cut off but both showed `tannerlinsley` |
| 317 | moment's `toISOString` uses Coordinated Universal Time unless `keepOffset` is true; the quoted code | VERIFIED | Source: `var utc = keepOffset !== true,` / `m = utc ? this.clone().utc() : this;`. That is two source lines, joined in the file |
| 317 | Node.js 24 gave "2026-09-30T10:00:00.000Z" "at an offset of minus 120 minutes" | VERIFIED, but the wording can be misread | Session note: "gave `2026-09-30T10:00:00.000Z` at an offset of −120 minutes". Local 12:00 → 10:00Z means two hours *ahead* of Coordinated Universal Time. Read as a normal offset, "minus 120" gives the wrong sign |
| 317 | date-fns `formatISO` returns "The formatted date string (in local time zone)" at `date-fns@4.4.0` | VERIFIED | unpkg: "@returns The formatted date string (in local time zone)". The registry has `"version": "4.4.0"` |
| 350 | "could be re-registered by threat actors" (CISA and MITRE); PyPI, crates.io and Maven Central recipes print no maintainers | VERIFIED | MITRE today: "This may also include abandoned packages, which in some cases could be re-registered by threat actors after being removed by adversaries." Recipe code. There is a lead below |

## Skill: `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`

| Line | Claim | Verdict | Source sentence |
|---|---|---|---|
| 45 | A PyPI first upload is not set against the cutoff | VERIFIED; matches wrapper 256 | It does not carry the wrapper's new `created` limit (recommended correction 9) |
| 56 | "the npm and PyPI recipes also tell a name the registry holds as a placeholder apart" | **REFUTED** | Wrapper 205: "The recipe prints no placeholder label". Skill 76: "its PyPI recipe prints no placeholder label" |
| 56 | npm's `fs` is at "0.0.1-security" | VERIFIED | fs dist-tags today: "latest: 0.0.1-security" |
| 76 | npm holds a name when `maintainers` is exactly `npm` plus `-security` or "security holding package"; crossenv; fs; the session probe | VERIFIED | Live today (see wrapper line 184) |
| 76 | "PyPI: no field shows a hold" | VERIFIED for the JavaScript Object Notation interface the recipe queries | Documentation: no status field. Live sklearn `info` keys: none contains "status", "archived", "quarantine" or "hold". There is a lead below |
| 92 | "Node.js 24 was used to run the probes" | VERIFIED | Session notes, node v24.14.1 |
| 92 | "among them react-codeshift's raw answer" | MISATTRIBUTED | The block (lines 91–114) has no react-codeshift. That answer belongs to the table row at line 372 |
| 119, 146, 172, 190, 211 | The version and check lines | VERIFIED | Each names the sources its block cites |
| 237 | "SQL / PostgreSQL 18"; the `/docs/current/` citations | VERIFIED | Today: "PostgreSQL 18: Documentation: 18: 53.3. pg_available_extensions"; "The `pg_available_extensions` view lists the extensions that are available for installation." |
| 256 | ConanCenter quotation | VERIFIED | "ConanCenter is a central public repository where the community contributes packages for popular open-source libraries like Boost, Zlib, OpenSSL, Poco, etc." |
| 256 | vcpkg quotation; `ports/<name>` | VERIFIED | "vcpkg hosts a selection of libraries packaged into ports at https://github.com/Microsoft/vcpkg. This collection of ports is called the *curated registry*." / "the files for port `foo` is located in `ports/foo`" |
| 256 | Conan and vcpkg names are recorded as not checked; the addresses are observed facts, not recipes | VERIFIED (the two files agree) | Wrapper 25 and 240 |
| 259–262 | C17 compile with Apple clang 21: the SAFE declarations compile; the invented call is "undeclared" | VERIFIED against the local note | `s4-skill-round3-session-runs.md`: "Apple clang version 21.0.0"; "exit 0, no diagnostics"; "error: call to undeclared function 'EVP_Q_encrypt'" |
| 265–267 | Catalogue probes | VERIFIED (3 of 4 re-fetched) | zlib `config.yml` exists ("versions: "1.3.2""); libfastjson_pro and libfastjson-pro both "HTTP 404 Not Found" |
| 319 | The vulnerability record service answers 404 for CVE-2025-99999 | VERIFIED | "The server returned HTTP 404 Not Found." |
| 338–339 | "fail the job on any line other than REGISTERED" | REFUTED against the printed vocabulary | Same as wrapper line 250 |
| 346 | `npm audit` covers "all dependencies, development ones included" | REFUTED in part | npm-audit v12: omit "Default: 'dev' if the `NODE_ENV` environment variable is set to 'production'; otherwise, empty." |
| 372 | react-codeshift: 2026-01-14, "debugducky", "1.0.0"; the recipe prints REGISTERED | VERIFIED under the new rule | Today: maintainers "debugducky", created "2026-01-14T21:02:51.762Z", "🚫 Placeholder to prevent dependency confusion." |
| 377 | The moment and date-fns row | VERIFIED | As wrapper line 317 |
| 408 | The CISA and MITRE quotation; the npm recipe prints maintainers | VERIFIED | MITRE quoted above |

## Leftovers

Each `old` below occurs exactly once in its file, confirmed with exact-string searches. Corrections 1–7 are required, 8–9 recommended, 10–11 optional.

1. Skill: `the npm and PyPI recipes also tell a name the registry holds as a placeholder apart.` → `the npm recipe also prints HELD BY NPM for a name that looks held by npm, a lead that still goes to the look-alike check, and the PyPI recipe prints no placeholder label.`
2. Wrapper: `Every recipe prints its verdict as a line and always exits with status 0, whatever it found. Read the printed line; a pipeline built on these recipes must fail on any line other than REGISTERED followed by a look-alike check that cleared the name.` → `Every recipe prints its verdict as its first line on standard output and always exits with status 0, whatever it found; on a status 200 answer the npm recipe then prints a second line, DOWNLOADS LAST WEEK or DOWNLOADS NOT READ, which is not a verdict. Read the verdict line; a pipeline built on these recipes must fail unless the verdict line begins REGISTERED and a look-alike check then cleared the name.`
3. Skill: `The recipes print a verdict line and always exit 0: fail the job on any line other than` → `The recipes print their verdict as the first line and always exit 0 (npm's DOWNLOADS line is not a verdict): fail the job unless the verdict line begins`
4. Skill: `REGISTERED followed by a look-alike check that cleared the name.` → `REGISTERED and a look-alike check then cleared the name.`
5. Skill: `# all dependencies, development ones included: they run on developer and pipeline machines too;` → `# all dependencies, development ones included unless NODE_ENV is production, which makes npm's omit option default to dev (https://docs.npmjs.com/cli/v12/commands/npm-audit, read 2026-09-30): they run on developer and pipeline machines too;`
6. Wrapper: `and the recipe's second check refuses it;` → `and the recipe's own character check refuses it (it prints "NOT CHECKED: refused by the character check");`
7. Skill: `the npm registry's answers, among them react-codeshift's raw answer, read 2026-09-30` → `the npm registry's answers, read 2026-09-30`
8. Wrapper (recommended): `at an offset of minus 120 minutes (the session's run, 2026-09-30)` → `in a time zone two hours ahead of Coordinated Universal Time (the session's run, 2026-09-30)`
9. Skill (recommended, keeps the two files in step): `a PyPI first upload is not a registration date, so the wrapper does not set it against the cutoff (its look-alike check, item 1):` → `a PyPI first upload is not a registration date, so the wrapper does not set it against the cutoff, and a` `` `created` `` `date before the cutoff does not show that the package now behind the name existed then, because whether npm keeps that date across an unpublish and a new registration was not checked (its look-alike check, item 1):`
10. Wrapper (optional; links the Node.js run to moment's own source): `format.js, read 2026-09-30), and Node.js 24's` → `format.js, read 2026-09-30), in that case returning the native` `` `this.toDate().toISOString()` `` `(same file); Node.js 24's`
11. Wrapper (optional; the session should re-read the two timestamps with curl first, because mine passed through the fetch tool's model): `Whether npm keeps a name's` `` `created` `` `date when the name is unpublished and registered again was not checked, so a` `` `created` `` `date before the cutoff does not show that the package now behind the name existed then.` → `A` `` `created` `` `date can be older than the package now behind the name:` `` `fs` `` `has` `` `created` `` `"2014-06-02T02:18:51.732Z", the date of a version of the package that formerly held the name, while npm's placeholder version "0.0.1-security" is dated "2016-08-23T17:56:58.976Z" (https://registry.npmjs.org/fs, read 2026-09-30). Whether npm keeps the date when a name is unpublished and registered again by someone else was not checked, so a` `` `created` `` `date before the cutoff never shows that the package now behind the name existed then.`

(In 9 and 11 the backticks around `created` and `fs` are part of the text; they are shown as separate code spans only so they display.)

**Leads, not corrections.** These are for the executor, the re-run code review, or you:
- **PyPI owners.** PyPI's answer carries owner roles: sklearn has `"ownership":{"organization":null,"roles":[{"role":"Owner","user":"filo"},…]}`. The PyPI recipe could print owners, which would let the shared-maintainer rule apply to PyPI instead of writing "maintainers not read". That is a design choice.
- **PyPI status markers.** Since August 2025 PyPI's index interface serves a top-level `project-status` object with "active", "archived" or "quarantined" (blog.pypi.org). The recipe does not read it. A status marker is not a hold, so line 76 stands.
- **Who owns C and C++.** sast-scanner's scope is security vulnerabilities. memory-safety-checker names C and C++ memory patterns. "C and C++ language issues: sast-scanner" may be the wrong owner for issues that are not about security.
- **Renamed packages on PyPI.** Wrapper line 260 lets the renamed type win only when "the answer shows" the relation. For PyPI the only such evidence is the publisher's own summary, which line 244 says is the publisher's words.
- **DOWNLOADS NOT READ.** The prose never says what to record when the recipe prints DOWNLOADS NOT READ.

## What I did not check

- **Both fingerprints.** I have no hashing tool and no git, so I found the changed passages from findings f-s4-skill-r3-26 to 52 and the plan's Step 10 return entry, not from a diff.
- **Quotations not refetched.** Text that was unchanged or only moved rests on the earlier re-reads: Spracklen, the European Union Agency for Cybersecurity, Tenable, OWASP, the Open Source Security Foundation, the joint agency report, Twist, the Node.js `fetch` history, and the fs source code.
- **Raw bytes.** Every fetch passed through a summarising model. The fs timestamps in correction 11 need a curl re-read before they are used.
- **The full maintainer lists** for react-query and @tanstack/react-query. Both fetches were cut off; the full lists rest on the session's recipe run.
- **Sigstore's maintainer and vcpkg's `fmt` answer (status 200).** Not refetched.
- **Anything run.** I ran none of the recipes and did not re-run the C17 compile; those rest on the session and executor notes.
- **The re-registration case itself.** I did not check whether npm keeps `created` when someone else registers a name after it was unpublished.

Files: `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`, `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-step13-secure-d-s4-step13-secure.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round3-session-runs.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round3-session-runs.md`

```yaml
response:
  dispatch_id: "d-s4-post-kickback-revalidate"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool
  findings:
    - {id: citation-validator/d-s4-post-kickback-revalidate/001, severity: high, type: citation-fabricated-drift, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [56, 56], suggestion: "correct-to (Leftover 1)", confidence: HIGH, citations: {evidence: [{file: agents/ai-quality/hallucination-detector.md, line_range: [205, 205]}]}}
    - {id: citation-validator/d-s4-post-kickback-revalidate/002, severity: high, type: vocabulary-mismatch, file: agents/ai-quality/hallucination-detector.md, line_range: [250, 250], suggestion: "correct-to (Leftovers 2–4, both files)", confidence: HIGH}
    - {id: citation-validator/d-s4-post-kickback-revalidate/003, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [346, 346], suggestion: "correct-to (Leftover 5)", confidence: HIGH, citations: {brief_url: https://docs.npmjs.com/cli/v12/commands/npm-audit}}
    - {id: citation-validator/d-s4-post-kickback-revalidate/004, severity: medium, type: code-description-inexact, file: agents/ai-quality/hallucination-detector.md, line_range: [151, 151], suggestion: "correct-to (Leftover 6)", confidence: HIGH}
    - {id: citation-validator/d-s4-post-kickback-revalidate/005, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [92, 92], suggestion: "correct-to (Leftover 7)", confidence: HIGH}
  self_assessment:
    coverage: 1.0
    confidence_overall: MEDIUM
    limitations: ["No fingerprint or diff check", "Web answers passed through a summarising model", "23 of 30 fetches used"]
  metadata: {tokens_used: null, tool_calls: 41}
```

Sources:
- [moment format.js](https://raw.githubusercontent.com/moment/moment/develop/src/lib/moment/format.js)
- [date-fns 4.4.0 formatISO.js](https://unpkg.com/date-fns@4.4.0/formatISO.js)
- [date-fns 4.4.0 registry entry](https://registry.npmjs.org/date-fns/4.4.0)
- [npm fs](https://registry.npmjs.org/fs)
- [npm crossenv](https://registry.npmjs.org/crossenv)
- [npm react-codeshift](https://registry.npmjs.org/react-codeshift)
- [npm email-validator-pro](https://registry.npmjs.org/email-validator-pro)
- [npm react-query](https://registry.npmjs.org/react-query)
- [npm @tanstack/react-query](https://registry.npmjs.org/@tanstack%2freact-query)
- [PyPI JSON interface documentation](https://docs.pypi.org/api/json/)
- [PyPI sklearn answer](https://pypi.org/pypi/sklearn/json)
- [PyPI project status markers blog post](https://blog.pypi.org/posts/2025-08-14-project-status-markers/)
- [vcpkg registries concepts](https://learn.microsoft.com/en-us/vcpkg/concepts/registries)
- [Conan introduction](https://docs.conan.io/2/introduction.html)
- [PostgreSQL pg_available_extensions](https://www.postgresql.org/docs/current/view-pg-available-extensions.html)
- [npm audit v12](https://docs.npmjs.com/cli/v12/commands/npm-audit)
- [MITRE ATT&CK T1195.001](https://attack.mitre.org/techniques/T1195/001/)
- [CVE record service, CVE-2025-99999](https://cveawg.mitre.org/api/cve/CVE-2025-99999)
- [conan-center-index zlib config.yml](https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml)
