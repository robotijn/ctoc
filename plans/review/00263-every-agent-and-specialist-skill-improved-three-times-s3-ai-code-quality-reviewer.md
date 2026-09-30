---
iron_loop_verdict: true
iron_loop: true
title: "The reviewer of code written by artificial-intelligence assistants, agent and skill, improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00262-every-agent-and-specialist-skill-improved-three-times-s2-inventory-and-record-check
priority: medium
files:
  - agents/ai-quality/ai-code-quality-reviewer.md
  - skills/ai-quality/ai-code-quality-reviewer/SKILL.md
  - .ctoc/audit/agent-and-skill-improvement/agents/ai-quality/ai-code-quality-reviewer.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/ai-quality/ai-code-quality-reviewer/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:16.525Z
gate_crossed: implementation → todo
---

# The reviewer of code written by artificial-intelligence assistants, agent and skill, improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on each file below, one file at a time: all three rounds on the agent, then all three on its skill.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/ai-quality/ai-code-quality-reviewer.md` | wrapper agent — `target_skill: ai-quality/ai-code-quality-reviewer` |
| 2 | `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` | the specialist skill body the agent loads |

Slice s3 of 121 in the sequence of files (parent index). This is the first round slice of the run. Previous: the starting inventory (s2). Next: the detector of invented packages and interfaces (s4).

### What the rounds research

The defects typical of code produced by large-language-model coding assistants — over-engineering, missing edge cases, invented patterns, invented imports, outdated framework idioms, tests that assert nothing. Authoritative sources first: the original research papers that measured such defects (read the paper itself, never a summary of it), and the vendors' own documentation for every assistant the trigger phrases name (GitHub Copilot, Cursor, Claude Code) wherever the files state how a product behaves. Check whether any statistic in the files is attributed to a study that says something else, and whether the list of defect classes misses one the current literature documents. Sibling boundary: `hallucination-detector` owns invented packages and interfaces; `code-reviewer` owns general review; the files must defer rather than duplicate.

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out; the boundary with sibling agents; any claim that a mechanism runs when it does not (for example that the refinement loop runs — `docs/REFINEMENT_LOOP.md` records it as not running); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it applies — the defects are language-general. The round's record decides and states why.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Skill fences** (run for every skill body): `tests/skill-loading.test.js` (its trigger-phrase corpus must still match — phrases may be added, never removed or narrowed without proof), `tests/plugin-skill-discovery.test.js`, `tests/architecture-invariants.test.js` (every skill body declares `type: skill` and never `allowed-tools:`), `tests/no-model-optimized-for.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/claim-census.test.js`, `tests/claim-ledger-gate.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`.
- **Specific to these files:** the wrapper keeps `name`, `type: wrapper` and `target_skill`, and still resolves to its skill (`tests/skill-loading.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`).
- **The record check:** `tests/agent-and-skill-improvement-record.test.js`.
- The complete list of tests that read each file is the inventory's measured `tests_reading` (slice s2); run every test it names. The lists above are the corpus-wide fences plus what the planner found by searching the test files for these exact paths; the full gate settles the rest.
- **What may change:** body text, `description`, `when_to_load` and `related_skills`. Every other frontmatter key — `name`, `type`, `target_skill`, `tools`, `model`, `effort`, `effort_level`, `tier`, `reports_to`, `dispatch_protocol` among them — stays byte-identical, and so do the field names, literal values and file paths of any output that code or another agent reads (the dispatch schema in `.ctoc/architecture/dispatch-schema.yaml` among them).

### How each round runs, and who does what

The build executor holds Read, Write, Edit and Bash and no way to dispatch another agent, so the dispatcher (the session driving the build, acting as CTO Chief under the dispatch protocol) dispatches the read-only agents — at most five in flight — and hands their outputs to the executor verbatim. Per file, per round:

1. **Read and fingerprint** (executor): the file, its paired file, the siblings it defers to, every test the inventory lists for it; fingerprint = `sha256:` plus the hexadecimal digest of the file's bytes.
2. **Research and critique** (`agents/pipeline/agent-critic.md`): briefed with the file path and fingerprint, every earlier round's findings and source classes for this file, and a request for its deepest reasoning (the owner's word: ultrathink).
3. **Validate** (`agents/ai-quality/citation-validator.md`): every citation-shaped claim already in the file and in the proposed changes; it fetches the sources itself.
4. **Update** (executor): only what the validator passed; a refuted or unsourceable claim is corrected or stripped as the verdict recommends. If the fingerprint moved since the read, the critique is discarded and the round restarts.
5. **Re-validate:** the validator reads the edited file once more; leftovers are fixed and re-checked within the circuit breaker (three attempts on one step, five in total per slice), after which the round is held and put to the human.
6. **Prove** (executor): the fences that read the file.
7. **Record, last** (executor): the round entry, written only after the above and after every late correction the round triggered.

A refuted claim is searched for by exact text in every in-scope file (scenario 7): a file not yet started — the record names the slice that will meet it; a file in this slice — corrected here; a finished file — a late correction (scenario 28 and decision 2 below). The full text is the parent index section "How a round runs, and who does what".

### The evidence record this slice produces

- `.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/ai-code-quality-reviewer.md.json` — three round entries for the agent.
- `.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/ai-code-quality-reviewer/SKILL.md.json` — three round entries for the skill.
- `.ctoc/audit/agent-and-skill-improvement/late-corrections.json` and `.ctoc/audit/agent-and-skill-improvement/for-the-human.json` — only when a round triggers a late correction or a finding it may not apply.

Each round entry holds the round number, the date (a date only), the queries, each source (address, date read, what it bore on, supported or refuted or not bearing), each finding with its evidence and decision, the fingerprints before and after, the validator's counts before and after the edit, the fences and results, the dispatch identifiers, the fingerprints of the instruments used, the paired files compared, and the seven-language result. The exact shape is the parent index section "The record's exact shape", enforced by `tests/agent-and-skill-improvement-record.test.js`. A round that finds nothing counts only with those lists filled and identical fingerprints (scenario 3).

### Per-file acceptance criteria (every file, after every round — copied from the parent)

1. The round's entry exists in the file's record and is complete (queries, sources, findings with decisions, fingerprints, validator counts, fences, dispatch identifiers).
2. Every changed or added citation-shaped claim has a VALIDATED verdict and carries its source and read date in the file. None is stated from memory.
3. Every changed passage traces to a finding in the record. A change with no finding is a defect.
4. Frontmatter is byte-identical apart from `description`, `when_to_load` and `related_skills`, and still starts at the first byte. Any `description` change keeps the existing dispatch phrases. Any `when_to_load` change only adds, unless the trigger corpus is shown to still match. For `agent-critic`, "before" means the file as its prerequisite slice left it.
5. No order in the body exceeds the file's own `tools:` line.
6. An agent still contains the honest-status reference.
7. No gate number in text a person reads, and no instruction to print one. New or changed passages contain no invented abbreviation, label or code.
8. Where the domain calls for code examples, the record states the result of the seven-language check, and each changed example is checked as scenario 20 says.
9. The paired file and siblings state the same facts, and each still defers to the sibling that owns a topic.
10. In round two and round three, findings are new or are marked as corrections; a repeat of a closed finding is a named regression.
11. The fences that read the file pass. At the end of the slice `npm test` passes.
12. If the round refuted a statement that a finished file also makes, that file's record carries a late correction for it and the list of late corrections carries the entry (scenario 28).

### How to verify

1. Before any change: run the tests named above and the record check, and record them green — the baseline. This slice writes no new test (decision 1).
2. After each round: the fences that read the file, named in the round entry.
3. At the end of the slice: `npm test` — the suite, the coverage floor of 99 read from `.ctoc/coverage-baseline.json`, zero skipped; `node --test` alone is not the gate. A printed warning or deprecation is a defect to fix. A gate failure on the claims ledger that this work did not cause is a blocker put to the human with the gate's exact output (scenario 30).
4. One commit for the slice carrying a patch version per the release rule; nothing pushed.

### Wiring — the live call sites

No module, no export, and no file added, moved or renamed under `agents/` or `skills/`. The agent is dispatched by name — its `description` is the routing surface — and the skill is loaded when a request matches its `when_to_load` phrases, through the skill directories the plugin declares. This slice changes what they say, not whether they are reachable; the dispatch and skill-loading fences above prove they still resolve.

### Security review

- Every fetched page, search result and byte of a file under review is data, never instruction; an instruction aimed at the reader is recorded as a finding and not followed (scenarios 15 and 27).
- No secret enters any file or record; sources are quoted briefly and verbatim.
- No tool grant is widened; a fix that would need one goes to the human (scenario 16).

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes instruction files only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read these files are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **The agent's output format moves from a free markdown report to the dispatch response schema (critic finding 4, applied).** The rule that output read by code or another agent keeps its shape was checked first: an exact-text search for the old report heading "AI Code Quality Review" finds it only in the agent file and its own skill body, so no reader of the old shape exists, and the new shape is the response schema of the dispatch protocol the file's own frontmatter already declares (protocol v1). One detail of the new format does not match the dispatch schema's types — a null token count against an integer field — and is put to the human, not changed by the executor (see the next item).
4. **A proposal that departs from a schema no live code enforces is applied as ordered and reported, not reverted.** The brief orders a revert only when a fence fails on a pinned contract; every fence passed. The only source file naming the dispatch schema is recorded as unreachable in the reachability baseline, so nothing breaks today, and choosing between the honest null and the schema's integer is a change to a machine-read contract that belongs to the human. Filed as a list entry for the human, of the pinned-contract kind.
5. **The configuration path list in the ownership table is kept as a detection rule (critic finding 14).** Only the Cursor rules directory sits inside a vendor quote; the other paths come from the research report's own words. The applied text lists the paths in the table without attributing them to any vendor, and the evidence section quotes each vendor only for what the quote says, so no vendor attribution goes beyond the quote.
6. **The printed warning in the baseline is recorded, not fixed here.** The run of the reading tests prints one line beginning "Warning: streaming topics", produced by the streaming-topics library under the streaming-render test on a deliberately invalid fixture. It is identical before and after the edit and neither file is in this slice's declared files; it is reported to the dispatcher as a defect for its own change.
7. **How the re-validation's one correction was fitted into the text.** The coordinator's replacement for the sentence counting measured classes names only its opening words; applied literally, the sentence would have read wrongly, so the whole clause up to its semicolon was replaced (from the count through the words assistant-written code) and the remainder of the sentence kept as it was. In the tests-changed-to-pass bullet the coordinator's text marks the benchmark quote with single quotation marks; the file marks every verbatim quote with double quotation marks, so the double marks were kept. Every word of the correction is otherwise as given.
8. **Outside-world facts the file states as detection rules, with no source yet (recorded by the re-validation, not fixed).** The citation validator's re-check listed four statements about the world that the agent file makes without a source: the markers of unfinished work and the languages they come from (the incomplete-output row); the dependency manifest file names (the stale-framework-idioms row); which files configure a coding assistant (the coding-assistant-configuration row); and the phrase about a look-alike package name registered in advance (the hallucinated-imports row). They are detection rules the file defines, not claims attributed to a source, so round 1 keeps them as written. Round 2 sources them, where the round 1 research report already read the vendor pages that bear on them: GitHub's Copilot code review page for the Copilot instruction files, Claude Code's Code Review page for the review instruction file, and Cursor's rules page for the agents instruction file.
9. **The instruments recorded are the installed plugin copies, version 6.14.65, not the repository's.** The dispatcher ran the installed agent critic and citation validator; the record's instrument entries name the two definitions by their repository paths, as the record shape requires, and carry the fingerprints of the installed copies that actually ran. The record shape has no note field for an instrument, so this fact is recorded here and in the list entry for the human about the installed critic having no web tools.
10. **The record carries twenty findings, not the nineteen the coordinator listed.** The twentieth is the executor's own finding from the first turn, the null token count against the dispatch schema's integer type, recorded as reported to the human with its list entry. Leaving it out would have left a list entry for the human that no finding in the record explains.
11. **Round 2 of the agent file: the two findings with no text change.** The critic's finding 13 (no Rust manifest named, and the Gradle Kotlin build file seen only in a fetch summary) is recorded as rejected with the reason "no source this round" and left for round 3. Its finding 14 (every agent the file hands work to was checked against its own definition) is recorded as rejected with the reason "verified, no change needed". The record check requires only that a round with a changed file holds at least one applied finding, which the twelve applied changes satisfy, so a verification with no edit need not be marked applied.
12. **The claim counts the round-2 researcher could not reconcile are consistent.** The round-1 research report on disk examined 34 claims across the agent and its skill; ten of them (rows 1 to 10) are the agent file's, and those are round 1's counts before the edit. The 30 claims are the re-validation of the edited agent file, a different set. The researcher also could not compute the file's fingerprint; the executor confirmed it before applying round 2.
13. **Three wordings kept as detection conventions, for round 3 to source.** The round-2 re-validation listed four unsourced wordings. The frequency word "often" was removed (the three hits now "can be by design"). The other three are kept as conventions the file defines and are for round 3 to source: the lockfile names for each ecosystem (the version rule says "a lockfile" and names none); the read-only collection given as an example of a deliberate unsupported-operation exception, which is the research report's own gloss and not in the Oracle quote; and the documentation directory named as a place to search for out-of-date documentation, which is a common convention rather than a sourced fact.
14. **Finding kinds are copied as the round-2 critique gives them.** The coordinator's message said six of the critique's fourteen findings are corrections of an earlier round; the critique itself marks four (findings 6, 7, 9 and 10), and the record copies the critique. With the re-validation's correction added as finding 15, round 2 holds five corrections.
15. **Round 3 of the agent file: the regulator evidence bullet (critic finding 8) is rejected, because one of its quotes is not on the named page.** The executor read the saved copy of the joint French and German report, pages 1 to 3 and 8 to 12, with its own Read tool. The title, the date "Last updated: September 2024", the two agencies' names and nine of the bullet's ten quotes are on the pages the bullet names. The tenth, attributed to page 9, reads "can be incorrect or completely hallucinated"; the page prints "can be incorrect or completetly hallucinated", a spelling slip in the source. The coordinator's rule is that a quote not found on its named page is rejected, not applied, and correcting a proposal is not the executor's to do, so the whole proposal is rejected and the file carries no regulator bullet this turn. Two ways to re-issue it are for the dispatcher: quote the page as printed, marked as the source's spelling, or drop that one clause. Findings 6 and 7, whose hand-ons the bullet was to source, are applied: they route work to named agents and state no attributed fact.
16. **Round 3, the findings with no text change.** Finding 9 is recorded as reported to the human for the licensing gap alone (the report names licensing violations as a risk it leaves out, and no agent owns detecting reproduced licensed code); its list entry uses the out-of-scope-file kind, the closest the list allows, because filling the gap changes a file outside this slice. Its other observations (no contradiction, the automation-bias agreement, the code-block flagging not added, the two other regulators not bearing) carry no change and are part of the same finding. Findings 10 and 11 are recorded as rejected with the reason "verified, no change needed".
17. **Finding 8 re-issued and applied; this supersedes the rejection in decision 15.** The coordinator re-issued the regulator bullet with one change: the page-9 quote is rendered as the source prints it, "completetly", with the words "(the source's spelling)" outside the quotation marks. The executor re-read pages 9 to 12 of the saved report and found all ten quotes on the pages named; the title, the date and the agency names were read from pages 1 to 3 in the same turn. The marker is placed directly after the closing quotation mark and the critic's page citation kept after it, so the clause ends with the source-spelling marker and then the page number. For the record: finding 8 is applied (kind new), and a finding 12 (kind correction-of-earlier-round) records that the regulator quote is rendered as printed with its spelling slip marked, applied.
18. **The settings key in the restated trailer sentence rests on the re-validation alone.** The round-3 re-validation found the commit-trailer quote misattributed a second time, because the settings page's wording comes back differently on every read, and gave the correct-to text naming the key attribution.commit. That key name appears in none of the research or critique reports saved on disk; its only source is the re-validation, whose report reached the executor through the coordinator's message and is not saved as a file. The three re-validation reports of the agent file's rounds are all in that position. The text is applied exactly as given, because the validator is the instrument that fetches the source; that the re-validation reports are not on disk is noted for the dispatcher.
19. **Skill body, round 1: the commit-trailer cell of the new tool table is corrected here, not applied as proposed.** The critic's table (finding 21) quotes the settings reference's trailer wording that the agent's round-3 re-validation found misattributed, because the page's wording changes between reads. The plan's rule for a refuted claim found in a file of this slice is to correct it here, so that one cell states the fact as the agent file now does, without quotation marks and with its source and read date; the rest of finding 21 is applied exactly. This is recorded as the executor's own finding in the skill's record.
20. **Skill body, round 1: the two attributions the critic could not pin are carried by the research report and are applied.** The asyncio.run() recommendation quote is in the research report (its section on what the skill is missing, item 9), which does not name the page; the critic attributes it to the current event-loop page, where the report's other asyncio quotes come from, and the re-validation should confirm that page. The C replacement code for gets is the report's own replacement (item 1), and the quote naming fgets and gets_s as the recommended replacements is also in the report; the fgets page itself was not read. The C# version-history quote renders the source's link text (Using declarations) without its link markup.
21. **Skill body, round 1: the baseline was run after the edit, against the original bytes.** The skill's fences were first run after the twenty-five changes. To record an honest baseline, the original file (fingerprint equal to the inventory's) was put back temporarily, the same fences run, and the edited file restored; its fingerprint after restoring equals the fingerprint after the edit. Both runs are green.
22. **Skill body, round 1: the critic's three items for the finished agent file go to the human, not into the agent.** None is a refuted claim in the agent, so the late-correction rule for refuted statements does not require them; the agent's record already holds three rounds. They are filed as one list entry for the human, of the late-correction-not-applied kind, with three options presented flat. One of them matters now: the agent's limit 2 names the skill's letter-schema section and the letter rule in its severity section, and this round removes both.
23. **Decision 22 is superseded: the three items were applied to the agent file as late corrections.** The coordinator ruled that the agent file is in this slice's files, so the rule "a file in this slice — corrected here" applies. The three corrections (the stale section reference in limit 2; the measurement for stale framework idioms and the source for vacuous tests; the workspace settings file on the configuration list) are recorded as late corrections on the agent's record and in the list of late corrections, and the list entry for the human about them is removed, since the list shape has no field to mark an entry resolved.
24. **The agent's count of measured classes was recounted from the bullets, not set to six.** Five classes carry a measurement of how often they appear in assistant-written code: misread request, incomplete output and missing edge cases (Tambon and colleagues), hallucinated imports (Spracklen and colleagues) and stale framework idioms (Wang and colleagues, the deprecated usage rate). Tests changed to pass carries a propensity under a forced conflict, and vacuous tests carries a documented tendency with no rate (the skill's research report says of the Konstantinou paper: "The paper gives a tendency, not a rate."). The sentence therefore names five, a sixth and a seventh, rather than six measured classes.
25. **One full-gate run covers all three late corrections.** The three corrections were applied as one set, the agent's fences run after the set, then the full gate once; each late-correction entry records that one run.
26. **Items for the skill's round 2 to source (from the skill's round-1 re-validation), kept as written this round:** the Java comment that a HashMap mutated from a parallel stream is not thread-safe (the Java Collections documentation); the C++ replacement line using std::make_unique (cppreference's make_unique page); the question-mark placeholder in the Python safe form, which the text already labels illustrative (the paramstyle section of the Python database interface specification, PEP 249); and two caveats on the fgets replacement — the size expression gives the buffer size only when the buffer is an array, not a pointer, and fgets keeps the newline it reads.
27. **Skill body, round 2: two Check details are applied although the research names rather than quotes them.** The name of the integer-equality assertion and the phrase "with specified user tolerance" for the floating-point tolerance assertion come from the research report's evidence column, not from a verbatim quote of Check's page; both are in the report, so they pass the rule that a quote or name must be in the report, and the coordinator ruled to keep them. The C++ Core Guidelines rules R.23 and R.11 were read on a mirror, and the text says so.
28. **Skill body, round 2: the findings with no text change.** Finding 15 (a change that adds no tests) is reported to the human as a scope finding, with a list entry of the out-of-scope-file kind naming coverage-enforcer as the likely owner and three options presented flat. Finding 16 (the examples validated as correct) is recorded as rejected with the reason "verified, no change needed".
29. **Items for the skill's round 3 to source (from the round-2 re-validation), kept as written:** the three-argument form of the Java collector that builds a concurrent map (a key mapper, a value mapper and a merge function), used in the reduction added to the race example; and the C preprocessor rule that commas inside parentheses stay within one macro argument, on which the GoogleTest pair's braced arguments rely.
30. **The page-9 spelling is settled by the PDF's text layer: the agent file is correct and is not changed.** The round-3 researcher read the word before "hallucinated" as "completly" from the page image, the critic read "completetly". The coordinator extracted the saved report's text layer with pdftotext, and the executor repeated it for page 9 only; both print "incorrect or completetly hallucinated, which might lead to security issues and reduce code maintenability", which is the agent file's quotation. The command:

```
pdftotext -f 9 -l 9 <the saved copy of the joint French and German report> -
```

31. **Skill body, round 3: regulator and standards quotes were checked against the saved documents' text layers.** Every quote attributed to the joint French and German report was found on the page the text names (pages 8, 9, 10 and 11), by extracting each page with pdftotext; the NIST Special Publication 800-218 quote on code review was found on the saved copy's printed page 14. The text layer drops the hyphen where a hyphenated word breaks across a line ("well-worded", "human-readable"); the page images show the hyphen, so the quotes keep it.
32. **Skill body, round 3: the findings with no text change.** Finding 19 (a change that adds no tests) is recorded as reported to the human under the existing list entry, whose evidence now also carries the regulator's sentence "Automatic function tests should be employed." (printed page 9); the entry shape holds that in its evidence text. Findings 20 (provenance record) and 21 (the page-9 spelling, settled by decision 30) are recorded as rejected with the reason "verified, no change needed".
33. **One late correction to the agent file from this round, as the coordinator directed:** the software-bill-of-materials hand-on to sbom-cra-checker in the agent's hand-on list, for consistency with the skill, recorded as the fourth late correction with its own run of the agent's fences and a full-gate run. The critic's first item for the agent (the spelling) needs no correction (decision 30); its third needs no agent change.
34. **Finding kinds of the skill's round 3 are copied as the critique gives them.** The coordinator's message said four of its findings are corrections of an earlier round; the critique marks three (findings 1, 2 and 7), and the record copies the critique.
35. **The commit carries the attribution line of the model that did the work.** The coordinator asked for a co-author line naming another model; the session's attribution instruction names the model that ran this build, and a co-author line is a statement of fact about authorship, so the commit carries that one.
36. **Self-review against the twelve per-file criteria, both files.** (1) Each record holds three complete rounds; the record check passes. (2) Every changed or added claim carries its source and read date; the final re-validations examined 84 claims in the agent and 136 in the skill, all validated, and the four late corrections were validated. (3) Every changed passage traces to a finding or a late correction in the records. (4) Frontmatter: the agent changed only its description, keeping all nine dispatch phrases; the skill changed only its description and added ten related skills; the trigger phrases and every other key are byte-identical, and both files still start at the first byte. (5) No order exceeds the agent's Read and Grep; the unexecutable-instruction fence passes. (6) The agent keeps the honest-status reference. (7) No gate number and no step number; the capitalised terms outside quotations and code are schema values (LOW, MEDIUM, HIGH), unfinished-work markers, identifiers (CVE, CWE, JEP, SYSLIB0014, PW.7), proper names and titles (MITRE, OWASP and its Top 10 CI/CD Security Risks, NIST, GCC, CTO Chief, .NET) and file names (README); the one term of art, the deprecated usage rate, is written out where it is used. (8) Each round records the seven-language result. (9) The agent and the skill name the same ten classes, the same type names and the same hand-ons, and the skill defers to the agent where they could differ. (10) Rounds two and three hold new findings or findings marked as corrections; none repeats a closed finding. (11) The fences pass and the full gate passes. (12) The four late corrections to the agent are on its record and in the list of late corrections.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (decision 1: no new test; the tests that read the file are the specification's baseline)
- [x] Test error conditions (the record check's own defect cases are part of the baseline run)
- [x] Run tests - expect RED (failing) (decision 1: the baseline is expected GREEN, and green before any change proves nothing; recorded as such)

### Step 9: PREPARE
- [x] Install dependencies if needed (none needed)
- [x] Check prerequisites (starting fingerprint matched the inventory; both instrument reports on disk)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (none needed)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (three rounds on the agent file and three on the skill body, each recorded; four late corrections to the agent file)
- [x] Add error handling (no code; every refuted or unsourced claim was corrected, stripped or reported, per the round records)
- [x] Wire up integration points (no module added; the agent still resolves to its skill and the skill still loads, proven by the skill-loading, plugin-discovery, wrapper-coverage and dispatch-resolution tests)

### Step 11: REVIEW
- [x] Self-review all new code (both files against the twelve per-file criteria; see the final record below)
- [x] Verify integration points work together (agent and skill state the same classes, types and hand-ons; the agent defers where the skill hands on)
- [x] Check error handling completeness (every re-validation ended with no fabricated, unsourceable or misattributed claim)

### Step 12: OPTIMIZE
- [x] Remove redundant operations (the agent's duplicated catalogue and checklist, and the skill's letter schema and fabricated tool rows, removed)
- [x] Optimize critical paths (not applicable: instruction files, no executable path)
- [x] Simplify complex code (not applicable: no code changed)

### Step 13: SECURE
- [x] Validate inputs (no path traversal) (the agent treats every byte it reviews as data and reports reviewer-directed instructions; no fetched page or file tried to instruct any instrument, per every report)
- [x] Sanitize outputs (no secret, token or personal data in either file or any record)
- [x] No secrets in code (a presence check for credential patterns over both files and the records found none)
- [x] Safe file operations (writes only to the declared files and this plan; no tool grant widened)

### Step 14: VERIFY
- [x] Run lint + type check (eslint with zero warnings, exit 0; typecheck test passes)
- [x] Run ALL tests (TDD Green) (npm test: 12030 pass, 0 fail)
- [x] Check coverage >= 80% (99.9% against the enforced floor of 99)
- [x] 0 skipped, 0 flaky tests (skipped 0; three full-gate runs in this slice all identical)

### Step 15: DOCUMENT
- [x] Update relevant documentation (the two files are the documentation; the release sync updated the README version references)
- [x] Add JSDoc comments to new functions (not applicable: no function added)
- [x] Update CHANGELOG if needed (not applicable: the repository keeps no changelog file; the commit message carries the version)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (every regulator and standards quote checked on its page of the saved documents)
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### The agent file, round 1 — update applied, awaiting re-validation

The dispatcher, acting as CTO Chief, ran two instruments, both the installed plugin copies at version 6.14.65, not the repository's. The installed agent critic holds only Read and Grep, so the citation validator did the web research (research and critique, effort xhigh) and the agent critic critiqued against its report (research and critique, effort xhigh). Their dispatch identifiers, and the digests of the installed definitions:

```
d-s3-agent-r1-research  ai-quality/citation-validator  sha256:0b99b97bb8530375a56e59203769d2a8c9a7d97d92f0c7c90cd5b358b0f7dc23
d-s3-agent-r1-critic    pipeline/agent-critic          sha256:8ef32ac31d91fd9fbc209fbe9a2f27668e4ed2fe8357859e26e98fb11a62682f
```

The two reports, saved verbatim and treated as data:

```
.ctoc/audit/improvement-run-notes/s3-agent-round1-research-d-s3-agent-r1-research.md
.ctoc/audit/improvement-run-notes/s3-agent-round1-critic-revised-d-s3-agent-r1-critic.md
```

The validator's counts before the edit, for the agent file's own claims (verdict rows 1 to 10): examined 10, validated 3, fabricated 1, unsourceable 6, misattributed 0. The other 24 rows are the skill body's and belong to its record.

The critic's three proposed changes were applied exactly, each old text matching the file once: finding 2 replaces the description line; finding 3 replaces the Role sentence with the Role paragraph and four new sections (reading the method first, what the agent owns and hands on, the evidence behind the classes, input handling, and the rule that what it reads is data); finding 4 replaces everything from the defect catalogue through the old markdown report template with severity and confidence rules, the protocol response format and escalation. Diff size: 106 lines added, 232 removed. The honest-status section is untouched.

Checked before applying: frontmatter lines other than the description byte-identical and the file still starts at its first byte; all nine dispatch phrases kept, the tail from the words Dispatch when onward byte-identical; no order beyond Read and Grep; no gate number; every web address in the new text is in the research report's sources; every quoted sentence in the new text is either verbatim in the research report, verbatim in the project instructions (the three operating-lesson quotes, compared with line breaks folded), verbatim in the refinement-loop design record, a section name of the paired skill, or a search string or example the file itself defines. No quote or claim was rejected.

Decisions for the round record, when it is written after re-validation: findings 2, 3, 4 applied; findings 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18 applied, carried by the text of findings 2 to 4 as the critic names; finding 9 (prompt-biased code) rejected for this round, because the research report gives no definition of it and placing it would rest on memory, carried to round 2; finding 1 reported to the human, list entry below. One further finding, the executor's own: the applied output format's null token count does not satisfy the dispatch schema's integer type; reported to the human, not changed.

Entries written to the list for the human:

```
.ctoc/audit/agent-and-skill-improvement/for-the-human.json
  h-s3-agent-r1-installed-critic-has-no-web-tools          kind instrument-list
  h-s3-agent-r1-tokens-used-null-versus-dispatch-schema    kind pinned-contract
```

The round record itself is not written yet: it needs the validator's counts after the edit.

## Verification Evidence

Fingerprint of the agent file before the round, equal to the inventory's starting fingerprint, and after the update:

```
before  sha256:9066b7fafa3300b0d257c5bc56af119e5fa7577765d35f3f4dd5789e9af55f60
after   sha256:07d69318e496773dab98162b27f2d6382cdce5c3cbeb9e8e552f3160fc93c488
```

Baseline, before any change: the 25 tests the inventory lists as reading the agent file, plus the record check. Green, as expected; being green before a change proves nothing about the change.

```
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  cancelled 0  skipped 0  todo 0
```

After the update, the same run:

```
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  cancelled 0  skipped 0  todo 0
```

Both runs print one warning line, identical before and after, from the streaming-render test on an invalid fixture, produced outside this slice's files:

```
Warning: streaming topics <temporary directory>/.ctoc/streaming/topics.json is invalid: topic[0].questions must be an array
```

The record check alone, after the two list entries were written:

```
node --test tests/agent-and-skill-improvement-record.test.js
pass 15  fail 0
```

### The agent file, round 1 — the re-validation's correction

The re-validation, dispatch d-s3-agent-r1-revalidate (citation validator), examined 30 claims in the edited file: 29 validated, 0 fabricated, 0 unsourceable, 1 misattributed. The misattribution presented the ImpossibleBench result as a frequency in assistant-written code; the benchmark measures behaviour on tasks made impossible by tests that conflict with the specification. Corrected in the evidence section only: the sentence counting measured classes now says four classes carry a frequency and a fifth carries a propensity under a forced conflict, and the tests-changed-to-pass bullet now says what the benchmark measures, with the GitHub guidance quote kept after it. Decisions 7 and 8 above record how the wording was fitted and the four unsourced detection rules left for round 2.

Fingerprint after the correction:

```
before  sha256:07d69318e496773dab98162b27f2d6382cdce5c3cbeb9e8e552f3160fc93c488
after   sha256:6cb024d000c83e7b5d41ce598e4142d70ea48191edc6f92a614b04150974ddff
```

The tests that read the file, after the correction; the same one warning line from the streaming-render test is printed, unchanged:

```
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
```

### The agent file, round 1 — record written

The re-check of the two corrected lines came back validated; the final counts for the agent file are examined 30, validated 30, fabricated 0, unsourceable 0, misattributed 0. The round 1 record is written:

```
.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/ai-code-quality-reviewer.md.json
```

It holds one round entry: three dispatches (research, critique, re-validation); the five queries and nineteen sources the revised critique kept as bearing on the agent file, copied verbatim; twenty findings (eighteen from the critique, the re-validation's correction, and the executor's own schema finding); the validator counts before (10 examined: 3 validated, 1 fabricated, 6 unsourceable) and final (30 examined, all validated); no claim left unverified; the 26 tests run, each passing; the paired skill body compared; and the seven-language result copied from the critique, with no example checked because the file now carries no defect examples. Decisions 9 and 10 above record the instruments and the twentieth finding.

The record check, then every reading test run one file at a time and then together; the agent file's fingerprint is unchanged by writing the record:

```
node --test tests/agent-and-skill-improvement-record.test.js
pass 15  fail 0
each of the 26 files alone: 0 failures
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
agent file  sha256:6cb024d000c83e7b5d41ce598e4142d70ea48191edc6f92a614b04150974ddff
```

### The agent file, round 2 — update applied, awaiting re-validation

Instruments, both installed 6.14.65 copies as in round 1: the research by the citation validator (source classes: standards bodies and established publishers) and the critique by the agent critic. The saved reports, treated as data:

```
d-s3-agent-r2-research  .ctoc/audit/improvement-run-notes/s3-agent-round2-research-d-s3-agent-r2-research.md
d-s3-agent-r2-critic    .ctoc/audit/improvement-run-notes/s3-agent-round2-critic-d-s3-agent-r2-critic.md
```

The validator's counts before the edit, for the file's unsourced detection rules: examined 18, validated 18, fabricated 0, unsourceable 0, misattributed 0.

The starting fingerprint equalled round 1's ending fingerprint. All twelve proposed changes (findings 1 to 12) were applied exactly, each old text matching the file once at the time it was applied. Before applying: every quoted sentence in the new text is in the round-2 research report, and the root Cursor rules file quote and its help-centre address are in the round-1 report, as the critic says; every web address is in one of the two reports; the two sibling agents newly named (type-checker, documentation-updater) exist, and the skill's type names being mapped are in its letter schema. Frontmatter is byte-identical to the file as round 1 left it, the tools line is unchanged, the honest-status reference is kept, and no gate number appears. No proposal was rejected. Findings 13 and 14 carry no text change (decision 11).

What changed, by place: a new evidence bullet for the two hand-ons and a detection-rules bullet with the sources of every marker, manifest and configuration file (finding 1); the unfinished-work markers narrowed to a pass statement, three comment markers added and three by-design hits named (finding 2); four configuration files added and the hand-on to the model-security agent reworded (finding 3); two .NET version files added (finding 4); a documentation-out-of-date check handed to the documentation agent (finding 5); wrong-type arguments handed to the type checker (finding 6, a correction of round 1's finding 10); prompt-biased code placed under a misread request, with its definition in the evidence (findings 7 and 8, closing round 1's finding 9); error handling split between its two owners (findings 9 and 10); the skill's type names mapped onto the agent's (finding 11); a review-guide source for over-engineering and vacuous tests (finding 12).

```
before  sha256:6cb024d000c83e7b5d41ce598e4142d70ea48191edc6f92a614b04150974ddff
after   sha256:01e6edeccd6447bc5cc0a4d36f79d95e48aea84e25705bbc72e524dcecc8b333
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
```

The same one warning line from the streaming-render test is printed, unchanged. The round-2 record is not written yet; it needs the re-validation counts.

### The agent file, round 2 — re-validation's correction and record written

The re-validation, dispatch d-s3-agent-r2-revalidate (citation validator), examined 59 claims: 59 validated, two of them at medium confidence (the literal Maven and Gradle file names), none fabricated, unsourceable or misattributed. It listed four unsourced wordings; one was corrected (the frequency word dropped: the three hits "can be by design"), and three are kept as conventions for round 3 (decision 13).

The round-2 entry is appended to the agent's record: three dispatches; the twenty queries and twenty-one sources from the round-2 critique, copied verbatim; fifteen findings (the critique's fourteen with their kinds as given, twelve applied, finding 13 rejected as "no source this round", finding 14 rejected as "verified, no change needed", plus the re-validation's correction as finding 15, applied); validator counts before 18 examined, all validated, and final 59 examined, all validated; no claim left unverified; the 26 tests, each passing; the paired skill body compared; the seven-language result copied from the critique. Decision 14 records the count of corrections.

```
round 2 before  sha256:6cb024d000c83e7b5d41ce598e4142d70ea48191edc6f92a614b04150974ddff
round 2 after   sha256:35c007e82d5c3bd6d71f6abf87f3b4de6a3a8f38073fb9600f4fdbc2ad55c12c
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
node --test tests/agent-and-skill-improvement-record.test.js
pass 15  fail 0
```

### The agent file, round 3 — update applied, awaiting re-validation

Instruments, both installed 6.14.65 copies: the research by the citation validator (angle: raw re-reads, remaining gaps, regulators) and the critique by the agent critic, which also read the saved regulator report itself. The saved reports, treated as data:

```
d-s3-agent-r3-research  .ctoc/audit/improvement-run-notes/s3-agent-round3-research-d-s3-agent-r3-research.md
d-s3-agent-r3-critic    .ctoc/audit/improvement-run-notes/s3-agent-round3-critic-d-s3-agent-r3-critic.md
```

The validator's counts before the edit, over the sixteen quotes re-read: examined 16, validated 14, fabricated 0, unsourceable 0, misattributed 2 (the commit-trailer quote and the word "only" in the sentence on Oracle).

The starting fingerprint equalled round 2's ending fingerprint. Seven of the eight proposed changes were applied exactly, each old text matching the file once: the commit-trailer quote replaced with the settings page's own words (finding 1, correcting round 1's finding 18); the Oracle sentence replaced with Oracle's collection documentation (finding 2, correcting round 2's finding 1); the manifest list gains the Kotlin Gradle build file and the Rust manifest, the unnamed lockfile becomes eight named lockfiles, and a missing lockfile is not a finding (finding 3); the sources for those files (finding 4); Google's over-engineering sentence completed (finding 5); weak cryptography, vulnerable or outdated dependencies and credentials in code handed to their agents (finding 6); the documentation check reworded to any documentation directory and extended to generated comments that describe behaviour the code lacks (finding 7). Every quote and address in those seven is in the round-3 research report; the two sibling agents newly named (dependency-checker, secrets-detector) exist. Finding 8, the regulator bullet, is rejected (decision 15). Frontmatter is byte-identical, the tools line unchanged, the honest-status reference kept, and no gate number appears.

One entry was written to the list for the human, for the licensing gap (decision 16):

```
.ctoc/audit/agent-and-skill-improvement/for-the-human.json
  h-s3-agent-r3-licensing-gap-no-owning-agent    kind out-of-scope-file
```

```
before  sha256:35c007e82d5c3bd6d71f6abf87f3b4de6a3a8f38073fb9600f4fdbc2ad55c12c
after   sha256:25c9f4ee0ddeaf22b7e130efa5ee82d8d84b2de903d29ce251d02fae3414a734
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
node --test tests/agent-and-skill-improvement-record.test.js
pass 15  fail 0
```

The same one warning line from the streaming-render test is printed, unchanged. The round-3 record is not written yet.

### The agent file, round 3 — finding 8 re-issued and applied

The regulator bullet is now in the evidence section, with the page-9 quote as the source prints it and marked as the source's spelling (decision 17). All ten quotes were checked again against pages 9 to 12 of the saved report before applying; the critic's old text matched the file once.

```
before  sha256:25c9f4ee0ddeaf22b7e130efa5ee82d8d84b2de903d29ce251d02fae3414a734
after   sha256:6ea93b209e53d0810c3d0f9073503d1a9ffa1feede070e0e3482b0bc1fc7e1f4
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
```

Round 3's fingerprint before, for the record, stays round 2's end (sha256:35c007e8…c12c). The same one warning line from the streaming-render test is printed, unchanged. The round-3 record is not written yet.

### The agent file, round 3 — re-validation's correction and record written; the agent file's three rounds are complete

The re-validation, dispatch d-s3-agent-r3-revalidate (citation validator), examined 84 claims: 83 validated and 1 misattributed, the commit-trailer quote, whose page wording is not stable across reads. The sentence now states the fact without quotation marks, with its source and read date, exactly as the validator gave it (decision 18). The final counts are 84 examined, all validated.

The round-3 entry is appended to the agent's record, which now holds three rounds: three dispatches; the twenty queries and nineteen sources from the round-3 critique, copied verbatim; thirteen findings (the critique's eleven, with finding 8 applied as re-issued, finding 9 reported to the human for the licensing gap, findings 10 and 11 rejected as "verified, no change needed"; plus finding 12, the quote rendered as printed, and finding 13, the trailer sentence restated, both corrections of an earlier round, applied); validator counts before 16 examined (14 validated, 2 misattributed) and final 84 examined, all validated; no claim left unverified; the 26 tests, each passing; the paired skill body compared; the seven-language result copied from the critique.

```
.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/ai-code-quality-reviewer.md.json
round 1  sha256:9066b7fa…5f60 -> sha256:6cb024d0…ddff
round 2  sha256:6cb024d0…ddff -> sha256:35c007e8…c12c
round 3  sha256:35c007e8…c12c -> sha256:21dea700f84541dc1bad8cd9b25cf441be0d353014920bd4ec5e105225a92c6b
node --test <the 25 reading tests> tests/agent-and-skill-improvement-record.test.js
tests 623  pass 623  fail 0  skipped 0
node --test tests/agent-and-skill-improvement-record.test.js
pass 15  fail 0
```

The agent file's three rounds are complete. Next in this slice: the three rounds of the skill body.

### The skill body, round 1 — update applied, awaiting re-validation

Instruments, both installed 6.14.65 copies. The saved reports, treated as data:

```
d-s3-skill-r1-research  .ctoc/audit/improvement-run-notes/s3-skill-round1-research-d-s3-skill-r1-research.md
d-s3-skill-r1-critic    .ctoc/audit/improvement-run-notes/s3-skill-round1-critic-d-s3-skill-r1-critic.md
```

The validator's counts before the edit: examined 54, validated 24, fabricated 5, unsourceable 19, misattributed 6.

The starting fingerprint equalled the inventory's. All twenty-five proposed changes were applied, each old text matching the file once; twenty-four exactly, and finding 21 with its commit-trailer cell corrected (decision 19). Every quoted sentence in the new text was found in the skill's research report, the agent's three research reports and its round-3 critique, the agent's record, the agent file, the project instructions or the refinement-loop design record; the two regulator quotes (pages 9 and 12) were read on the saved report earlier in this session, and the saved file is unchanged; every web address is in one of those reports. Decision 20 records the two attributions the critic could not pin. Frontmatter: only the description changed and nine skills were added to the related-skills list, each existing as a skill body; the trigger phrases and every other key are byte-identical, the type is still skill and no allowed-tools key exists. No gate number and no step number appear. Findings 26 (trigger phrases left unchanged) and 27 (three items for the agent file, decision 22) carry no text change.

```
.ctoc/audit/agent-and-skill-improvement/for-the-human.json
  h-s3-skill-r1-three-items-for-the-finished-agent-file    kind late-correction-not-applied
```

The skill's fences: the eighteen tests the inventory lists as reading the skill body, plus the skill-loading, plugin-discovery, architecture-invariants, critic-warnings, refinement-loop-claims, wrapper-coverage, claim-census and README-numbers tests and the record check (twenty-two files). Baseline run against the original bytes (decision 21) and after the edit:

```
baseline (original, sha256:a30ec5a401cb9e8251d96b31744909fbd7404ff26c498fd1634408e8abee96f9)
  tests 758  pass 758  fail 0  skipped 0
after    (sha256:dde239139147078eb9e9f6714b2c1cefe73765c1e033d8a5d6354f50270d8641)
  tests 758  pass 758  fail 0  skipped 0
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
```

The same one warning line from the streaming-render test is printed in both runs, unchanged. The skill's round-1 record is not written yet.

### The skill body, round 1 — re-validation's correction, late corrections to the agent, records written

The skill's re-validation, dispatch d-s3-skill-r1-revalidate (citation validator), examined 87 claims, all validated. Of the four unsourced wordings it listed, one was reworded (the sentence on C and C++ markers now speaks about this file, not the languages); the other three, and two caveats on the fgets example, are left for round 2 (decision 26).

Three late corrections were then applied to the finished agent file as one set (decisions 23 to 25): its limit 2 now names only the skill's critic-mode section, which the skill labels a design record; its evidence section gains the Wang measurement for stale framework idioms and the Konstantinou finding for vacuous tests, and its count sentence is recounted; its configuration list and evidence gain the workspace settings file with the CVE-2025-53773 disclosure quote. The agent's fences, the skill's fences, and then the full gate:

```
agent file   sha256:21dea700f84541dc1bad8cd9b25cf441be0d353014920bd4ec5e105225a92c6b -> sha256:b256ccdefa675ecf3585a9c003ce22657941405cd73573f33503232b69f3cb8c
skill body   sha256:dde239139147078eb9e9f6714b2c1cefe73765c1e033d8a5d6354f50270d8641 -> sha256:37a49e5f22d7102a4c0c083ad19bc13b35fa6b06502be08a1966a447ea5655cb
node --test <the agent's 25 reading tests> tests/agent-and-skill-improvement-record.test.js
  tests 623  pass 623  fail 0  skipped 0
node --test <the skill's 22 test files>
  tests 758  pass 758  fail 0  skipped 0
npm test
  tests 12030  pass 12030  fail 0  skipped 0
  [CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
```

The full gate's output carries warning lines and one assertion stack trace that come from tests exercising deliberately broken fixtures in temporary directories (corrupt quality-state files, a directory where a topics file belongs, an invalid topics file, a demonstration project whose verification is meant to fail); no line is a deprecation warning, and none comes from the two files this slice changes.

Written last, after the late corrections, as the plan orders:

```
.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/ai-code-quality-reviewer.md.json   late_corrections lc-s3-agent-1, lc-s3-agent-2, lc-s3-agent-3
.ctoc/audit/agent-and-skill-improvement/late-corrections.json                                the same three entries, with path
.ctoc/audit/agent-and-skill-improvement/for-the-human.json                                   entry for the three items removed
.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/ai-code-quality-reviewer/SKILL.md.json   round 1
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
```

The skill's round-1 entry holds three dispatches; the five queries and twenty sources from the critique, verbatim; twenty-nine findings (twenty-five applied, finding 26 rejected as "verified, no change needed", finding 27 applied as the three late corrections, finding 28 the corrected trailer cell and finding 29 the reworded marker sentence, both corrections, applied); validator counts before 54 examined (24 validated, 5 fabricated, 19 unsourceable, 6 misattributed) and final 87 examined, all validated; the 22 test files, each passing; the agent file as the paired file compared; the seven-language result and the examples checked, copied from the critique.

### The skill body, round 2 — update applied, awaiting re-validation

Instruments, both installed 6.14.65 copies. The saved reports, treated as data:

```
d-s3-skill-r2-research  .ctoc/audit/improvement-run-notes/s3-skill-round2-research-d-s3-skill-r2-research.md
d-s3-skill-r2-critic    .ctoc/audit/improvement-run-notes/s3-skill-round2-critic-d-s3-skill-r2-critic.md
```

The validator's counts before the edit, as given: examined 16, validated 14, fabricated 0, unsourceable 1, misattributed 1 (the misattribution is a premise of the brief, not a claim in the file).

The starting fingerprint equalled round 1's ending fingerprint. All seventeen proposed changes were applied exactly, each old text matching the file once; every quote and web address in them is in the round-2 research report or in the earlier reports and the agent file. Frontmatter is byte-identical; no gate number appears, and the abbreviation for create, read, update and delete is gone. Decisions 27 and 28 record the two Check details and the findings with no text change.

```
.ctoc/audit/agent-and-skill-improvement/for-the-human.json
  h-s3-skill-r2-change-adds-no-tests-no-owner    kind out-of-scope-file
before  sha256:37a49e5f22d7102a4c0c083ad19bc13b35fa6b06502be08a1966a447ea5655cb
after   sha256:80e4fb47c121e555b01b20ab8decd11ca56dd683196f5c02ada07223a0540dcc
node --test <the skill's 22 test files>
  tests 758  pass 758  fail 0  skipped 0
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
```

The same one warning line from the streaming-render test is printed, unchanged. The skill's round-2 record is not written yet.

### The skill body, round 2 — record written

The re-validation, dispatch d-s3-skill-r2-revalidate (citation validator), examined 120 claims, all validated; no text change was needed, and two code facts are left for round 3 (decision 29). The round-2 entry is appended to the skill's record, which now holds two rounds: three dispatches; the two queries and twenty-five sources from the round-2 critique, verbatim; nineteen findings with the critique's kinds (six corrections of round 1: findings 4, 5, 6, 7, 11 and 13), seventeen applied, finding 15 reported to the human with its list entry, finding 16 rejected as "verified, no change needed"; validator counts before 16 examined (14 validated, 1 unsourceable, 1 misattributed) and final 120 examined, all validated; the 22 test files, each passing; the agent file as the paired file compared; the seven-language result and examples checked, copied from the critique.

```
.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/ai-code-quality-reviewer/SKILL.md.json
round 1  sha256:a30ec5a4…96f9 -> sha256:37a49e5f…55cb
round 2  sha256:37a49e5f…55cb -> sha256:80e4fb47c121e555b01b20ab8decd11ca56dd683196f5c02ada07223a0540dcc
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
```

### The skill body, round 3 — update applied, fourth late correction to the agent, awaiting re-validation

Instruments, both installed 6.14.65 copies. The saved reports, treated as data:

```
d-s3-skill-r3-research  .ctoc/audit/improvement-run-notes/s3-skill-round3-research-d-s3-skill-r3-research.md
d-s3-skill-r3-critic    .ctoc/audit/improvement-run-notes/s3-skill-round3-critic-d-s3-skill-r3-critic.md
```

The validator's counts before the edit, as given: examined 31, validated 28, fabricated 0, unsourceable 0, misattributed 3.

The starting fingerprint equalled round 2's ending fingerprint. All eighteen proposed changes were applied exactly, each old text matching the file once. Every quote is in the round-3 research report, and the regulator and standards quotes were also found on their named pages of the saved documents (decision 31). Frontmatter differs from round 2's only by the added related skill for the software bill of materials check, whose skill body and agent exist; no allowed-tools key, no gate number. Decisions 30 to 33 record the spelling, the page checks, the findings with no text change, and the late correction.

```
skill body   sha256:80e4fb47c121e555b01b20ab8decd11ca56dd683196f5c02ada07223a0540dcc -> sha256:13261a77d335529b7edcc1b6d4d8163ee9f6dbed08cc59a17eb63b0e9ec431c7
agent file   sha256:b256ccdefa675ecf3585a9c003ce22657941405cd73573f33503232b69f3cb8c -> sha256:2ef7de0896063c4105b47553a80a5cb2ca4ea431d96c7d281a027828c0d65356   (late correction lc-s3-agent-4)
node --test <the skill's 22 test files>
  tests 758  pass 758  fail 0  skipped 0
node --test <the agent's 25 reading tests> tests/agent-and-skill-improvement-record.test.js
  tests 623  pass 623  fail 0  skipped 0
npm test
  tests 12030  pass 12030  fail 0  skipped 0
  [CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] PASS
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
```

No deprecation warning appears in the full gate's output. The skill's round-3 record is not written yet; it needs the re-validation counts.

### The skill body, round 3 — record written; the slice's finish

The final re-validation, dispatch d-s3-skill-r3-revalidate (citation validator), examined 136 claims, all validated, and verified the agent's new hand-on to the software-bill-of-materials checker; no text change. The re-validation reports are saved alongside the other reports:

```
.ctoc/audit/improvement-run-notes/s3-agent-revalidations-d-s3-agent-r1-r2-r3-revalidate.md
.ctoc/audit/improvement-run-notes/s3-skill-revalidations-d-s3-skill-r1-r2-r3-revalidate.md
```

The round-3 entry is appended to the skill's record, which now holds three rounds: three dispatches; the twelve queries and twelve sources from the round-3 critique, verbatim; twenty-one findings with the critique's kinds (decision 34), eighteen applied, finding 19 reported to the human under the existing list entry, findings 20 and 21 rejected as "verified, no change needed"; validator counts before 31 examined (28 validated, 3 misattributed) and final 136 examined, all validated; the 22 test files, each passing; the agent file as the paired file compared; the seven-language result copied from the critique. Decision 36 is the self-review against the twelve criteria.

Final fingerprints and the gate, after the patch version bump to 6.14.70 and the release sync:

```
agent file  sha256:2ef7de0896063c4105b47553a80a5cb2ca4ea431d96c7d281a027828c0d65356
skill body  sha256:13261a77d335529b7edcc1b6d4d8163ee9f6dbed08cc59a17eb63b0e9ec431c7
node --test tests/agent-and-skill-improvement-record.test.js
  pass 15  fail 0
npm run lint
  exit 0 (eslint, zero warnings)
npm run typecheck
  pass 1  fail 0
npm test
  tests 12030  pass 12030  fail 0  skipped 0
  [CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  exit status 0
```

The gate's output has no deprecation warning. Its six warning lines come from tests that feed deliberately broken fixtures in temporary directories (corrupt quality-state files, invalid or unreadable streaming-topics files); the only lines naming the two changed files are passing test lines.

Left for the human, in the list for the human:

```
.ctoc/audit/agent-and-skill-improvement/for-the-human.json
  h-s3-agent-r1-installed-critic-has-no-web-tools          the installed agent critic has no web tools
  h-s3-agent-r1-tokens-used-null-versus-dispatch-schema    the null token count against the dispatch schema's integer type
  h-s3-agent-r3-licensing-gap-no-owning-agent              no agent owns licensed code reproduced into a change
  h-s3-skill-r2-change-adds-no-tests-no-owner              no class checks a change that adds no tests
```
