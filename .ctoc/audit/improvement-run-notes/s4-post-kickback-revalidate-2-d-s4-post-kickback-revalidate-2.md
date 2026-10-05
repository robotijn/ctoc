<!-- saved verbatim by the session from subagent a962ae4aa828d5843 (ctoc:ai-quality:citation-validator), dispatch d-s4-post-kickback-revalidate-2, 2026-09-30 23:33 CEST -->

**Result.** All the text changed in the third pass holds up against its sources. Nothing is refuted or misattributed. One new sentence can be read the wrong way (wrapper line 317, "in that case"), and adding the signal trap made two "always exits 0" sentences slightly too strong. The fixes are below: one recommended, two optional.

The two files now agree on all four points you named: the PyPI placeholder label, the exit-status rule, the `created` caveat and the renamed-package rule. The prose uses only the words the recipes print.

I used 6 of the 15 fetches. No fetched page addressed a reviewer.

## Wrapper: `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`

| Line | Claim | Verdict | Source sentence |
|---|---|---|---|
| 151 | A quote or `$(…)` in a name is refused by "the recipe's own character check", which prints "NOT CHECKED: refused by the character check" | VERIFIED | All three recipes print exactly that string (lines 161–163, 193, 228, 231). Session note line 64: `x'; echo INJECTED; '$(echo INJECTED2) \| NOT CHECKED: refused by the character check`. Lines 77 and 84 show the same for PyPI and crates.io. |
| 151 | In the session's run, the line after the end marker executed | VERIFIED | Session note line 98: "DID run the third line as shell code (output began `INJECTED-BY-NEWLINE`…" |
| 166, 195 | `trap 'exit 1' HUP INT TERM` removes the temporary file in both shells | VERIFIED; rests on two recorded runs, I ran nothing | Second security scan, new finding 4: "Tested: with this line, both shells removed the file on termination and hang-up signals, and normal output was unchanged. A kill signal that cannot be caught still leaves the file." Session at 23:26: "30 before and 30 after — the new `trap 'exit 1' HUP INT TERM` line removes the file in both shells" |
| 184 | "a HELD BY NPM line never skips the look-alike check" | VERIFIED (agrees with line 244; no longer clashes with the confidence table) | Line 244: "Report `registry_placeholder` only when the look-alike check has also run on the name; a HELD BY NPM line never skips it." |
| 184 | `JSON.stringify` escapes line feed and carriage return | VERIFIED | QuoteJSONString escape table: "`0x000A` U+000A \| LINE FEED (LF) \| `\n`" and "`0x000D` U+000D \| CARRIAGE RETURN (CR) \| `\r`" (https://tc39.es/proposal-well-formed-stringify/) |
| 184 | U+2028, U+2029 and U+0085 pass through unescaped | VERIFIED by two independent routes: the specification text, and the scan's measurement in Node. I did not run Node. | Specification: "Else if C has a numeric value less than 0x0020 (SPACE), or C has the same numeric value as a leading-surrogate code unit or trailing-surrogate code unit, then … UnicodeEscape(unit)." / "Else, Set product to the string-concatenation of product and the UTF16Encoding of C." All three characters are above 0x0020, are not surrogates and are not in the table. Scan: "I measured that `JSON.stringify` leaves the Unicode line separator (U+2028), paragraph separator (U+2029) and next-line character (U+0085) unescaped." |
| 184 | "the Step 13 security review measured this", with the note's path | VERIFIED | The path exists and contains the sentence quoted above |
| 250 | The verdict is the first line on standard output, and the exit status is 0 whatever was found | VERIFIED, with one gap (optional leftover 3) | Every branch prints exactly one verdict line first, and curl's messages go to standard error (`-sS`). But `trap 'exit 1' HUP INT TERM` now gives exit status 1 when a signal stops the recipe, so "always" no longer holds in that case. |
| 250 | On a status 200 answer, npm prints DOWNLOADS LAST WEEK or DOWNLOADS NOT READ | VERIFIED | Lines 174–179: `if [ "$code" = 200 ]` … `"DOWNLOADS LAST WEEK "+n:"DOWNLOADS NOT READ"` … `echo "DOWNLOADS NOT READ (answer: ${dcode:-none})"` |
| 250 | A DOWNLOADS line can follow COULD NOT LOOK | VERIFIED | The download query depends only on `$code` being 200. So it also runs after "COULD NOT LOOK (answer unreadable)" and "(no latest version in the answer)". |
| 250 | A pipeline must fail unless the verdict line begins REGISTERED | VERIFIED against the printed words | Only the three REGISTERED lines begin that way. HELD BY NPM, NOT ON THE REGISTRY, COULD NOT LOOK and NOT CHECKED do not. |
| 256 | `fs` `created` is "2014-06-02T02:18:51.732Z" | VERIFIED | https://registry.npmjs.org/fs today: `"created":"2014-06-02T02:18:51.732Z"`. The session's curl read (note line 101) gives the same. |
| 256 | That date belongs to a version of the package that formerly held the name | VERIFIED | Same answer: `"0.0.1":"2014-06-02T02:18:51.732Z"`, and the description "This package name is not currently in use, but was formerly occupied by another package." |
| 256 | The placeholder "0.0.1-security" is dated "2016-08-23T17:56:58.976Z" | VERIFIED | `"0.0.1-security":"2016-08-23T17:56:58.976Z"` |
| 256 | Re-registration by someone else was not checked | VERIFIED as a declared limit | No note I read records such a check |
| 258 | The attestation sentence is marked as the file's own reasoning | VERIFIED | "(this file's own reasoning)" is present |
| 268 | These tools cannot see whether a target is a symbolic link | Not a citation. It agrees with line 18, which limits Bash to registry queries and `date`. | — |
| 317 | moment falls back to the native `this.toDate().toISOString()` "(same file)" | VERIFIED as code; the wording can be misread (recommended leftover 1) | format.js today: `var utc = keepOffset !== true,` / `m = utc ? this.clone().utc() : this;` / `if (m.year() < 0 \|\| m.year() > 9999) {` / `if (isFunction(Date.prototype.toISOString)) {` / `if (utc) {` / `return this.toDate().toISOString();` / otherwise `return new Date(this.valueOf() + this.utcOffset() * 60 * 1000)`. The native call is the Coordinated Universal Time branch, for years 0 to 9999. "in that case" comes straight after "unless called with `keepOffset` true", so it reads as the keepOffset case, which returns the other expression. |
| 317 | Node.js 24 gave "2026-09-30T10:00:00.000Z" in a time zone two hours ahead | VERIFIED; rests on recorded runs | Note line 47: "gave `2026-09-30T10:00:00.000Z` at an offset of −120 minutes". Line 52: "Repeated the Node run under TZ=Europe/Amsterdam: `2026-09-30T10:00:00.000Z -120`". An offset of −120 means local time is two hours ahead, and 12:00 local is 10:00 Coordinated Universal Time, so the figures agree. |

## Skill: `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`

| Line | Claim | Verdict | Source sentence |
|---|---|---|---|
| 45 | A `created` date is "necessary and not sufficient": it can be older than the package now behind the name, and whether it survives an unpublish and a new registration was not checked | VERIFIED | The `fs` answer above. Matches wrapper line 256. |
| 56 | npm prints HELD BY NPM when the only maintainer is `npm` and the version or description reads as npm's hold; PyPI prints no placeholder label | VERIFIED | Wrapper line 170: `held=mm.length===1&&!!mm[0]&&mm[0].name==="npm"&&(/-security$/.test(v)\|\|/security holding package/i.test(…))`. Line 199 prints only `REGISTERED name=…`. The skill text matches the second security scan's new finding 1 word for word. |
| 87 | The templates take "a package name or version" | Not a citation. True of the file: the crates.io template on line 229 takes `<version>`. | — |
| 92 | The react-codeshift clause is removed | VERIFIED | Line 92 now reads "checked against the vendors' documentation and the npm registry's answers, read 2026-09-30". The block's registry addresses are react-smart-cache, email-validator-pro, react-query and zod. |
| 119, 146, 172 | "the parent plan's criterion 4" is removed | VERIFIED | An exact-text search for "criterion" in the skill finds nothing |
| 259–264 | Compiled against stand-in declarations; the three declarations compile; the call is undeclared; "shows only that the lines are valid C17" | VERIFIED against the executor's note; one wording point (optional leftover 2) | Note line 16: "This checks that the lines are valid C17; what OpenSSL declares rests on its manual page and `util/libcrypto.num`." Line 17: "exit 0, no diagnostics". Line 18: "error: call to undeclared function 'EVP_Q_encrypt'; ISO C99 and later do not support implicit function declarations". The call line was rejected, so only the three declarations were shown to be valid C17. |
| 340–341 | The verdict is the first line; exit 0; fail unless it begins REGISTERED | VERIFIED; same signal gap as wrapper line 250 | As wrapper line 250 |
| 347 | The job keeps no cache or artifact that a later job restores | Not a citation. It is the scan's own advice, which it marked "believed, not verified". | — |
| 348 | `npm audit` includes development dependencies unless `NODE_ENV` is production, which makes `omit` default to dev (address, read 2026-09-30) | VERIFIED | npm-audit v12 today: "Default: 'dev' if the `NODE_ENV` environment variable is set to 'production'; otherwise, empty." |

**Where the two files agree:**
- **PyPI placeholder label:** skill lines 56 and 76, and wrapper lines 205 and 244 ("the PyPI recipe prints no such label").
- **Exit-status rule:** wrapper line 250 and skill lines 340–341.
- **The `created` caveat:** skill line 45 and wrapper line 256.
- **Renamed-package rule:** wrapper line 260 ("npm: it shares at least one maintainer with it"), lines 337 and 350, and skill line 410 ("the LOW tier stays, and the limitations say 'maintainers not read'").
- **Printed words:** every word the prose uses is printed by a recipe. The prose never quotes NOT ON THE REGISTRY; it says "Status 404 (not found)", which is what that line carries ("(HTTP 404)").

## Leftovers

Each `old` below appears exactly once in its file (checked by exact-text search).

1. **Recommended.** Wrapper:
   - old: `in that case returning the native`
   - new: `and when it converts and the year is between 0 and 9999 it returns the native`
2. **Optional.** Skill:
   - old: `That shows only that the lines are valid C17:`
   - new: `That shows only that the three declarations are valid C17:`
3. **Optional; the new trap makes "always" too strong in both files.** The crates.io and Maven Central recipe has no trap, so a signal kills it with the default status. The new wording covers both cases.
   - Wrapper old: `and always exits with status 0, whatever it found;`
   - Wrapper new: `and exits with status 0 whatever it found (only a signal that stops it gives another status);`
   - Skill old: `and always exit 0 (npm's DOWNLOADS line is not a verdict):`
   - Skill new: `and exit 0 whatever they found (only a signal that stops them gives another status; npm's DOWNLOADS line is not a verdict):`

**Leads, not corrections:**
- **Who ran the no-network test (record finding f-s4-skill-r3-68, record line 2576).** The record says "the executor's no-network run left no file in either shell". No note I read records an executor run after the trap was added. The runs recorded after it was added are the session's at 23:26 (offline, and the termination signal with 30 files before and after) and the scan's. The earlier "No temporary file left behind" (note line 95) is the session's, made before the trap existed. I did not read the plan's Step 10 return entry, so this is unsettled, not refuted.
- **`npm audit` and an explicit omit setting.** An `omit` given on the command line or in a configuration file would also drop development dependencies, but skill line 348 names only `NODE_ENV`. The only text I read on this is the entry's "(can be set multiple times)". Believed, not checked.
- **Wrapper line 18, "and deletes".** This line is unchanged. The scan notes that "A kill signal that cannot be caught still leaves the file."

## What I did not check

- **Both fingerprints.** I have no hashing tool. The session note's heading records `542d05fe…` for the wrapper, which matches your brief, but that is the note's claim, not my check.
- **Anything run.** I ran neither Node nor the recipes, the trap, the C17 compile or the time-zone run. Those claims rest on the recorded runs named in the tables.
- **The current ECMAScript edition.** The multi-page specification fetch returned only its table of contents. I read the well-formed-stringify proposal's text instead, which is what went into ECMAScript 2019. I believe that step is unchanged since.
- **Findings with no text in the two files:**
  - f-60: I only confirmed that `validator_final` (20 examined, 16 validated, 3 fabricated, 1 misattributed) matches the predecessor's skill table.
  - f-64: the plan and the inbox question, not read.
  - f-67: the finding kinds, not read.
  - f-71 to f-73: passed to the human.
- **Text that did not change.** Not refetched.
- **Raw bytes.** Every fetch passed through a summarising model. The `fs` timestamps also match the session's curl read.

```yaml
response:
  dispatch_id: "d-s4-post-kickback-revalidate-2"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool
  findings:
    - {id: citation-validator/d-s4-post-kickback-revalidate-2/001, severity: medium, type: citation-wording-misreadable, file: agents/ai-quality/hallucination-detector.md, line_range: [317, 317], suggestion: "correct-to (Leftover 1)", confidence: HIGH, confidence_rationale: "format.js read today: the native call sits under if (utc) inside the 0-9999 year branch; the keepOffset branch returns new Date(this.valueOf() + this.utcOffset() * 60 * 1000)", citations: {brief_url: "https://raw.githubusercontent.com/moment/moment/develop/src/lib/moment/format.js", evidence: [{file: agents/ai-quality/hallucination-detector.md, line_range: [317, 317]}]}}
    - {id: citation-validator/d-s4-post-kickback-revalidate-2/002, severity: low, type: code-description-inexact, file: agents/ai-quality/hallucination-detector.md, line_range: [250, 250], suggestion: "correct-to (Leftover 3, both files)", confidence: HIGH, confidence_rationale: "trap 'exit 1' HUP INT TERM on lines 166 and 195 gives exit status 1 under those signals", citations: {evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [340, 341]}]}}
    - {id: citation-validator/d-s4-post-kickback-revalidate-2/003, severity: info, type: code-description-inexact, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [262, 262], suggestion: "correct-to (Leftover 2)", confidence: MEDIUM, citations: {evidence: [{file: .ctoc/audit/improvement-run-notes/s4-skill-round3-session-runs.md, line_range: [16, 18]}]}}
    - {id: citation-validator/d-s4-post-kickback-revalidate-2/004, severity: low, type: attribution-not-found, file: .ctoc/audit/agent-and-skill-improvement/skills/ai-quality/hallucination-detector/SKILL.md.json, line_range: [2576, 2576], suggestion: "lead: confirm an executor run exists, else attribute to the session's 23:26 run", confidence: LOW}
  counts: {examined: 28, validated: 25, not_a_citation: 3, refuted: 0, misattributed: 0, unverifiable: 0}
  self_assessment:
    coverage: 1.0
    confidence_overall: MEDIUM
    limitations: ["No fingerprint check (no hashing tool)", "Nothing run; the Node, trap, recipe and compile claims rest on recorded runs", "Web answers passed through a summarising model", "Current ECMAScript edition not read; the ECMAScript 2019 proposal text was", "6 of 15 fetches used"]
  metadata: {tokens_used: null, tool_calls: 22}
```

Sources:
- [npm audit v12](https://docs.npmjs.com/cli/v12/commands/npm-audit)
- [npm fs, raw](https://registry.npmjs.org/fs)
- [moment format.js](https://raw.githubusercontent.com/moment/moment/develop/src/lib/moment/format.js)
- [Well-formed JSON.stringify proposal (QuoteJSONString)](https://tc39.es/proposal-well-formed-stringify/)

Files: `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`, `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/hallucination-detector/SKILL.md.json`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round3-session-runs.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-step13-secure-2-d-s4-step13-secure-2.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round3-session-runs.md`
