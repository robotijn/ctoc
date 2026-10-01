<!-- saved verbatim by the session from subagent a7ef4143363dc59b4 (ctoc:pipeline:agent-critic), dispatch d-s5-agent-r2-critic, 2026-10-01 01:18 CEST -->

**Verdict: refine the file (weighted score 6.8 of 10, scored as a security agent).** I propose 33 changes, grouped into 10 findings. Three more findings are considered and rejected, and there are 10 new items for the skill round. Every `old` below was copied from the file at fingerprint `4445b971…`. I have no hashing tool, so the executor must confirm that fingerprint before applying anything.

The defects that matter, most severe first:
1. **The identifier lookup reads frozen data and stamps it as current.** It downloads `dist/ATLAS.yaml`, which MITRE has deprecated. That is the false-green shape this repository fences.
2. **The table of identifiers is attributed to a release it was not read from.** In the current data, AML.T0053 AI Agent Tool Invocation also leads to AML.TA0015 Lateral Movement, and the table misses it.
3. **"Never a version number" is wrong.** `5.6.0` is the data-format version. The content version, `'2026.09'`, is exactly the sign of currency the file wants.
4. **The progress figure counts only twelve checks,** while "Checks" orders the agent to apply the skill's whole category list. A run can report full progress while leaving several classes unassessed.
5. **The 2026-edition caveat is stale,** now that the four 2026 entries have been read.

**Three things the inputs got wrong, which the file must not repeat:**
- **The brief's "byte-identical" premise is contradicted by the raw read.** The session note says the deprecated file "differs from `dist/legacy/ATLAS-5.6.0.yaml` by 316 diff lines". No change below says the two are identical, or that the deprecated file holds release 2026.04 content.
- **The research's line numbers are off by one in table B.** Its row "113 (check 9)" is check 9, which is line 112 today. Check 10, at line 113, has no reading of its own to source (it quotes the skill), so it is not changed.
- **The research's proposed fix would make things worse.** It suggested pointing the lookup at `dist/ATLAS-latest.yaml`. The raw read shows that file is a symbolic link, which raw.githubusercontent.com serves as 20 bytes of link text. A download would succeed and deliver no data. Rejected, see "Rejected".

**How each source was read.** "Direct" means the research read the page image itself. "Summarised ×N" means the quote came through the fetch tool's summarising model N times. "Read in full" means the session downloaded the whole file with curl and read it line by line. The validator must re-check every summarised quote before the edit.

---

## Findings and changes

### f-s5-agent-r2-1 · critical · robustness and integration · correction of f-s5-agent-r1-2
**What is wrong.** Step 1 downloads `main/dist/ATLAS.yaml` and then writes the current time into `taxonomy_resolved_at`, which claims the data is current.
- **Why the data is frozen.** MITRE's README says "`dist/ATLAS.yaml` is deprecated and will no longer be updated". The file has no AML.T0129, a technique the current data has. It names tactic AML.TA0001 "AI Attack Staging", where the current data says "AI Attack Adaptation".
- **The fix.** Replace the lookup with the recipe the session tested, byte for byte. Record the release, not only the time. Give the wording for each failure branch. Add the manifest to the material the agent treats as data.

**Sources.**
- The session's raw reads (`s5-agent-round2-session-runs.md`, sections 1–3, 2026-10-01), read in full:
  - README at tag v2026.09, lines 69–73;
  - `main/dist/ATLAS.yaml`;
  - `main/dist/manifest.yaml`;
  - `dist/v6/ATLAS-2026.09.yaml`;
  - the recipe's run at 2026-09-30T22:59:30Z;
  - the two symbolic links.
- The limit on releases numbered with a third part is this file's reading of the change log's "YYYY.MM.N" (see f-s5-agent-r2-3).

**Change 2**

old:
~~~text
1. `f="$(mktemp)"; curl -sS --fail --max-time 60 -o "$f" 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml' && echo "saved $f" || { rm -f "$f"; echo "COULD NOT DOWNLOAD"; }; date -u +%Y-%m-%dT%H:%M:%SZ`
2. Grep the saved file for the identifier's `id:` line, anchored at the end of the line (for example `id: AML.T0051$`), and read that entry's `name:` line and the identifiers listed on the lines under its `tactics:` key (each written `- AML.TA…`). A sub-technique entry (an identifier ending in `.000`, `.001` and so on) has no `tactics:` line of its own: take its parent technique's, and never read on into the next entry.
3. Delete the file with `rm -f` and the path step 1 printed.

Only if the download succeeded, put the time step 1 printed in `taxonomy_resolved_at`, and write in `taxonomy_mapping` that the identifier came from the main-branch data file. If step 1 printed "COULD NOT DOWNLOAD", or Bash has no network, write `taxonomy_resolved_at: "not resolved"`, take identifiers from the table and the lists below, and say in `self_assessment.limitations` that they are as read on the dates given here. Never run any other command against a network address.
~~~

new:
~~~text
1. Read MITRE's manifest of releases and download the data file it lists first, both lines in one Bash call:
   ```
   m="$(mktemp)"; f="$(mktemp)"
   if curl -sS --fail --max-time 60 -o "$m" 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml'; then rel="$(grep -m1 "^- release:" "$m" | sed "s/.*'\(.*\)'.*/\1/")"; p="$(grep -m1 '^    path: v6/' "$m" | sed 's/^ *path: //')"; case "$p" in (v6/ATLAS-[0-9][0-9][0-9][0-9].[0-9][0-9].yaml) if curl -sS --fail --max-time 120 -o "$f" "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/$p"; then echo "saved $f release $rel"; else rm -f "$f"; echo "COULD NOT DOWNLOAD (data file)"; fi;; (*) rm -f "$f"; echo "COULD NOT DOWNLOAD (manifest shape not recognised)";; esac; else rm -f "$m" "$f"; echo "COULD NOT DOWNLOAD (manifest)"; fi; rm -f "$m"; date -u +%Y-%m-%dT%H:%M:%SZ
   ```
   It prints either `saved <path> release <release>` or one of `COULD NOT DOWNLOAD (manifest)`, `COULD NOT DOWNLOAD (manifest shape not recognised)` and `COULD NOT DOWNLOAD (data file)`, and then the time. It deletes the manifest in every branch, and the data file in every branch but the first. Run once for this file (2026-09-30T22:59:30Z), it printed `release 2026.09`. It takes the release from the manifest's first entry, which that day was the latest, and admits only a path written `v6/ATLAS-`, four digits, a dot, two digits and `.yaml`, so no other text from the manifest reaches the second address; a release numbered with a third part, which the change log's scheme quoted above allows, is refused as "manifest shape not recognised". It never downloads `dist/ATLAS.yaml`, which MITRE says "is deprecated and will no longer be updated" (README at tag v2026.09, https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/README.md, read in full 2026-10-01), nor either `ATLAS-latest.yaml`: both are symbolic links, which raw.githubusercontent.com serves as their link text, not as data (read in full 2026-10-01).
2. Read the saved file with these commands, putting the path step 1 printed where `<path>` stands and your identifier where `AML.T0051` or `AML.TA0005` stands:
   - the name: `grep -A1 '^  AML.T0051:$' '<path>' | grep 'name:'`
   - the tactics it achieves, one line each: `grep -A3 'source: AML.T0051$' '<path>' | grep -B1 'relationship-type: achieves' | grep 'target:'`
   - each tactic's name: `grep -A2 '^  AML.TA0005:$' '<path>' | grep 'name:'`
   If the first command prints nothing, the identifier was not found in that release: write no ATLAS identifier for that finding and say so in `self_assessment.limitations`. If the second prints nothing for a sub-technique (an identifier ending in `.000`, `.001` and so on), run it for the parent technique; if it prints nothing for the technique either, write the technique with no tactic and say so there.
3. Delete the saved file with `rm -f '<path>'`.

Only after a `saved` line, write `taxonomy_resolved_at: "release <release>, <time>"` with the release and the time step 1 printed, and in `taxonomy_mapping` "ATLAS release <release>, looked up in this dispatch". Where that release is later than 2026.09 and the table below disagrees, the lookup wins; if it is earlier, use the table and say so in `self_assessment.limitations`. After any `COULD NOT DOWNLOAD` line, or if Bash has no network, write `taxonomy_resolved_at: "not resolved"`, take identifiers from the table and the lists below, and write in `self_assessment.limitations` the line step 1 printed and that the identifiers are as read on the dates given here. Never run any other command against a network address.
~~~

**Change 9**

old: `and the ATLAS data file — is material under review`
new: `and the ATLAS manifest and data file — is material under review`

**Change 30**

old: `# or the time step 1 of the lookup printed after a successful download`
new: `# or, after a saved line, "release <release>, <time>" as step 1 of the lookup printed them`

### f-s5-agent-r2-2 · high · research grounding · correction of f-s5-agent-r1-2
**What is wrong.**
- **Misattributed source.** The table is labelled "release v2026.09" and "Tactic in that release", but it was read from the deprecated file.
- **Current values.** Relabelled to the current data file, five rows keep their values. AML.T0053 gains AML.TA0015 Lateral Movement.
- **Tactic name.** AML.TA0001 is now "AI Attack Adaptation".

**Sources.** Session note, section 2 (read in full 2026-10-01). It records the `achieves` targets of all six techniques and the names of all sixteen tactics. The address is the one the session's recipe run fetched (section 3); section 2 does not name its branch.

**Change 5**

old:
~~~text
**MITRE ATLAS, release v2026.09.** The identifiers your checks use most, from the data file at that tag (https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml, read 2026-10-01):

| Identifier | Name | Tactic in that release | Checks |
~~~

new:
~~~text
**MITRE ATLAS, content release 2026.09.** The identifiers your checks use most, from the current data file `dist/v6/ATLAS-2026.09.yaml` (https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-2026.09.yaml, downloaded and read in full 2026-10-01; its collection block reads `version: '2026.09'`). Technique entries in that file carry no tactic of their own; a technique's tactics are the targets of its `achieves` relationships:

| Identifier | Name | Tactics it achieves in release 2026.09 | Checks |
~~~

**Change 6**

old: `| AML.T0053 | AI Agent Tool Invocation | AML.TA0005 Execution; AML.TA0012 Privilege Escalation | 4 |`
new: `| AML.T0053 | AI Agent Tool Invocation | AML.TA0005 Execution; AML.TA0012 Privilege Escalation; AML.TA0015 Lateral Movement | 4 |`

**Change 7**

old: `The skill's mapping table puts LLM Prompt Injection under Initial Access and Extract LLM System Prompt under Credential Access. The data file of that release puts them under Execution and Exfiltration, and this table wins.`

new: `The skill's mapping table puts LLM Prompt Injection under Initial Access and Extract LLM System Prompt under Credential Access, names AML.TA0001 "AI Attack Staging" and has no Lateral Movement. The current data file puts the two techniques under Execution and Exfiltration, names AML.TA0001 "AI Attack Adaptation" (the deprecated `dist/ATLAS.yaml` still says "AI Attack Staging") and has AML.TA0015 Lateral Movement (read in full 2026-10-01); this table, or a lookup made during this dispatch, wins.`

**Change 25**

old: `sub-technique Indirect), ATLAS v2026.09, this file's table"`
new: `sub-technique Indirect), ATLAS release 2026.09, this file's table"`

**Change 26**

old: `Extract LLM System Prompt, ATLAS v2026.09, this file's table"`
new: `Extract LLM System Prompt, ATLAS release 2026.09, this file's table"`

### f-s5-agent-r2-3 · high · research grounding · correction of f-s5-agent-r1-2
**What is wrong.** "Never a version number" is wrong. `5.6.0` is the version of the data format, and the content version is the sign of currency.

**Sources.**
- The change log, section 2026.05. The research labels this quote "copied exactly", which is not the same as a direct read, so the validator must confirm it word for word. The session's raw README line 63 corroborates the split.
- The manifest and the data file's head, read in full 2026-10-01.
- The absence of AML.T0129 from the deprecated file, read in full 2026-10-01.

**Change 1**

old: ``The sign of currency is the release tag and its date, never a version number: the data file at the v2026.09 tag still reads `version: 5.6.0` (read 2026-10-01).``

new: ``The sign of currency is the content release and its date, which MITRE now numbers apart from the data format: "Starting with this release, there is a split in versioning between the ATLAS Knowledge Base content and the ATLAS Data Format. Monthly ATLAS content releases will follow a YYYY.MM.N versioning scheme with the version stored in the Collection object." (change log, section 2026.05, https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/CHANGELOG.md, read 2026-10-01). The current data file's collection block reads `version: '2026.09'`, and MITRE's manifest of releases dates that release `release-date: '2026-09-15'` (https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml; both read in full 2026-10-01). A `version: 5.6.0` line is a data-format version, not a content release: the manifest last pairs format 5.6.0 with release 2026.04, and the deprecated `dist/ATLAS.yaml`, which still carries that line, has no AML.T0129, a technique the current data file has (read in full 2026-10-01).``

### f-s5-agent-r2-4 · high · research grounding and boundaries · correction of f-s5-agent-r1-2 and f-s5-agent-r1-8
**What is wrong.** The caveat "the 2026 entry texts were not read" is no longer true. Four more 2026 entries were read, and they show that entries sharing a name differ in text.

**Rule.** A quoted sentence goes only under the identifier of the entry it was read in.
- **Check 1** gains the 2026 sentence and NIST pages 53–54. The two are marked as not independent, because the 2026 entry cites NIST.
- **The Taxonomies section** gains OWASP's link from its 2026 Excessive Agency entry to three agentic entries.

**Sources.**
- 2026 README, summarised ×1.
- LLM01:2026:
  - its prevention sentence and "consistent with NIST", summarised ×2;
  - the absence of both 2025 sentences check 1 quotes, found by two reads.
- LLM03:2026: the two renamed mitigations and the agentic link, summarised ×2 each.
- LLM06:2026: the missing logits mitigation, summarised ×2.
- LLM10:2026: both sentences check 3 quotes, summarised ×1.
- NIST pages 53–54: direct.

All read 2026-10-01.

**Change 3**

old: `You may give the 2026 identifier beside the 2025 one, taken by entry name. Apart from Hidden Context Exposure's definition, the 2026 entry texts were not read for this file, so a 2026 identifier is a match by name, not a claim that the two entries cover the same ground.`

new: ``You may give the 2026 identifier beside the 2025 one, taken by entry name; it is a match by name, never a claim that the two entries cover the same ground. OWASP says the 2026 edition "updates the ordering, scope, examples, mitigations, and framework mappings across the list" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/README.md, read 2026-10-01), and entries that share a name differ in text. Of the 2026 entries read for this file (each at https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/ followed by its file name, read 2026-10-01): `LLM01_PromptInjection.md` contains neither of the two 2025 sentences check 1 quotes; `LLM06_UnboundedConsumption.md` does not list the logits mitigation check 9 quotes from LLM10:2025; `LLM03_ExcessiveAgency.md` words the mitigations checks 4 and 7 quote from LLM06:2025 as "Execute tools in user's context" and "Implement authorization in logic"; and `LLM10_ImproperOutputHandling.md` contains both sentences check 3 quotes from LLM05:2025. So quote a sentence only under the identifier of the entry it was read in: a 2025 sentence under its 2025 identifier, a 2026 sentence under its 2026 identifier.``

**Change 4**

old: `check 12 uses its entry headings as the document writes them.`
new: ``check 12 uses its entry headings as the document writes them. The 2026 list for language-model applications links one of its entries to three of them: "Within the context of agentic systems, Excessive Agency can manifest as ASI02: Tool Misuse & Exploitation, ASI03: Identity & Privilege Abuse and ASI08: Cascading Failures." (LLM03:2026 Excessive Agency, the file `LLM03_ExcessiveAgency.md` cited in the paragraph above, read 2026-10-01).``

**Change 10**

old: `(https://genai.owasp.org/llmrisk/llm01-prompt-injection/, read 2026-09-30). So separation alone never closes a finding here:`

new: `(https://genai.owasp.org/llmrisk/llm01-prompt-injection/, read 2026-09-30). The 2026 edition's entry of the same name, LLM01:2026 Prompt Injection, says "no reliable prevention mechanism exists today" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md, read 2026-10-01), and NIST AI 100-2 E2025 says "Because current mitigations do not offer full protection against all attacker techniques, application designers may design systems with the assumption that prompt injection attacks are possible if a model is exposed to untrusted input sources …" (pages 53–54, the publication cited under "Taxonomies, identifiers and where they come from"). These two are not independent: the 2026 entry calls its position "consistent with NIST (2025)". So separation alone never closes a finding here:`

### f-s5-agent-r2-5 · high · completeness and calibration · new (from the round-1 re-read's observation)
**What is wrong.** `coverage` divides by twelve checks, while "Checks" orders the agent to apply the skill's full list. The skill has classes that map to no check, so a run can report 1.0 and never look at them.

**The fix, in this file's own reasoning:**
- **Media inputs move into check 2** (change 11, f-s5-agent-r2-8), sourced by the LLM01:2026 definition.
- **A new check 13** holds the rest: misinformation that acts, poisoning of training and retrieval ingestion including the fine-tuning canary set, sensitive data in a prompt, multi-turn attacks, and error-path disclosure. Check 13 counts as assessed only when every class under it was assessed.
- **The denominator becomes thirteen.** The example becomes 12 of 13 = 0.923, written 0.92 because the file forbids rounding up.

Two triage rows are left for the skill round (item 28): "missing watermark" and "documentation gaps".

**Change 23**

old: `The other five map onto checks above by heading: "ASI01: Agent Goal Hijack" (1, 2), "ASI02: Tool Misuse and Exploitation" (4), "ASI04: Agentic Supply Chain Vulnerabilities" (5, 11), "ASI05: Unexpected Code Execution (RCE)", that is remote code execution (3), and "ASI06: Memory & Context Poisoning" (8).`

new:
~~~text
The other five map onto checks above by heading: "ASI01: Agent Goal Hijack" (1, 2), "ASI02: Tool Misuse and Exploitation" (4), "ASI04: Agentic Supply Chain Vulnerabilities" (5, 11), "ASI05: Unexpected Code Execution (RCE)", that is remote code execution (3), and "ASI06: Memory & Context Poisoning" (8).
13. **The skill's classes that checks 1 to 12 do not name** — apply the skill's own section to each class below. This check counts as assessed only when every class below was assessed, a class with nothing in the change to apply to counting as assessed; name any class you did not assess in `self_assessment.limitations`. The list is this file's reading of the skill against checks 1 to 12:
    - **Misinformation that acts** — the skill's section on LLM09:2025 Misinformation, only where a model's answer drives an action or advice with a security or safety consequence and nothing checks it first; whether the answer is correct belongs to hallucination-detector.
    - **Poisoning before retrieval or training** — the skill's section on LLM04:2025 Data and Model Poisoning: content is checked for injection before it is indexed, and a fine-tuned model is checked against a held-out canary set before it is used.
    - **Sensitive data in a prompt** — the skill's section on LLM02:2025 Sensitive Information Disclosure: a prompt carries only the fields the answer needs, never a whole customer record.
    - **Multi-turn attacks** — the skill's multi-turn jailbreak case under LLM01:2025: does anything judge the conversation as a whole, not only its latest turn?
    - **Error paths** — an error path discloses the model's name or version.
~~~

**Change 27**

old: `coverage: 0.91`
new: `coverage: 0.92`

**Change 28**

old: `the twelve checks in this file, never rounded up; a check with nothing in the change to apply to counts as assessed`
new: `the thirteen checks in this file, never rounded up; a check with nothing in the change to apply to counts as assessed, and check 13 only when all its classes were`

**Change 29**

old: `11 of 12 checks assessed`
new: `12 of 13 checks assessed`

**Change 33**

old: `| Error paths disclose the model's name or version | — |`

new:
~~~text
| Sensitive data put into a prompt beyond what the answer needs | 13 |
| Content indexed, or a model fine-tuned, with no check for poisoning | 13 |
| A model's answer drives an action or advice with a security or safety consequence, with no check first | 13 |
| A conversation judged only by its latest turn | 13 |
| Error paths disclose the model's name or version | 13 |
~~~

### f-s5-agent-r2-6 · medium · completeness · new
**What is wrong.** The description advertises "MCP tool poisoning", but no check or order row names a poisoned tool description.

**Sources.** LLM01:2026's mitigation heading, summarised ×1, 2026-10-01. The skill's tool-poisoning case is attributed to the skill.

**Change 14**

old: `implement proper consent mechanisms prior to executing commands."`

new:
~~~text
implement proper consent mechanisms prior to executing commands."
   - **Tool descriptions** — the descriptions a server registers for its tools are text the model reads, so a poisoned description is an injection route (the skill's tool-poisoning case). OWASP's LLM01:2026 Prompt Injection asks to "audit tool descriptions for hidden instructions" (the 2026 entry cited under check 1, read 2026-10-01). Does the project review each description a server registers, and see a changed description before the model reads it? A description in the change that gives the model an instruction is also judged under checks 1 and 2.
~~~

**Change 32**

old: `| A Model Context Protocol server unaudited or unpinned, with automatic approval enabled, accepting a token not issued for it, or granted a wildcard scope | 5 |`
new: `| A Model Context Protocol server unaudited or unpinned, with automatic approval enabled, accepting a token not issued for it, granted a wildcard scope, or registering tool descriptions that nothing reviews | 5 |`

### f-s5-agent-r2-7 · medium · research grounding · extends f-s5-agent-r1-2
**What is wrong.**
- **No NIST vocabulary.** The file cites NIST AI 100-2 for its vocabulary, but gives none of its terms.
- **Unsourced boundary.** The governance boundary rests on "this file's own reasoning", yet NIST's own text sources it.

**Sources.** Direct reads of https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf, 2026-10-01, at pages 108, 110, 111, 54, 59, 60 and 88. The research did not say whether NIST's page numbers are the printed numbers or the file's page positions; the validator must settle that.

**Change 8**

old: `NIST's risk management framework and its generative artificial intelligence profile, NIST AI 600-1, are governance documents and belong to the ai-governance-checker skill (this file's own reasoning).`

new:
~~~text
The page numbers below are those of the publication as read in full on 2026-10-01 (https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf). When you name a class in a finding's `message`, use its glossary term (which check each serves is this file's reading):

- **prompt injection** — "An attack which exploits the concatenation of untrusted input with a prompt constructed by a higher-trust party such as the application designer" (page 111); checks 1 and 2.
- **direct prompt injection** — "A direct prompting attack in which the attacker exploits prompt injection" (page 108), a direct prompting attack being one "conducted by the primary user of the system through query access" (page 108); check 1.
- **indirect prompt injection** — "A type of prompt injection executed through resource control rather than through user-provided input as in a direct prompt injection" (page 110); check 2.
- **prompt extraction** — "An attack that tries to divulge the system prompt or other information …" (page 111); check 7.

Its section 3.5, "Security of Agents", says that because agents act through tools, these attacks "can create additional risks in this context, such as enabling actors to hijack agents to execute arbitrary code or exfiltrate data from the environment in which they are operating" (page 54); checks 3, 4 and 12. It leaves governance out of scope — "A key question that this taxonomy deliberately leaves aside is how organizations can make decisions about the development and use of AI systems" (page 59) — and cites, as its reference 273, work that "developed risk profiles for generative AI systems that map to the NIST AI RMF" (page 60; its reference list, page 88, gives 273 as NIST AI 600-1 and 274 as the risk management framework). Those two are governance documents and belong to the ai-governance-checker skill (the routing is this file's own reasoning).
~~~

### f-s5-agent-r2-8 · medium · research grounding · correction of the round-1 own-reading labels
**What is wrong.** Several passages labelled "this file's own reading" can now be sourced (research table B):
- checks 2, 3, 4, 8 and 9;
- the question list at the end of check 5, taken from the OWASP Top 10 for the Model Context Protocol;
- the four agentic questions ASI07 to ASI10 under check 12.

Check 2 also gains media inputs, which serves f-s5-agent-r2-5, and the Greshake preprint.

**Sources, all read 2026-10-01.**
- The agentic document (https://genai.owasp.org/download/52117/?tmstv=1765059207): direct. Its page numbers are the printed ones, as the research recorded.
- The Model Context Protocol index rows: summarised ×2.
- LLM01:2026: its definition, indirect-source list and mitigation 7 were summarised ×1; its memory heading was summarised ×1.
- LLM06:2026: summarised ×2, and the "Agentic Circuit Breakers" sentence ×1.
- LLM10:2026: its scenario, summarised ×1.
- LLM10:2025, the text in OWASP's repository: "word for word" per the research; the validator must confirm.
- The arXiv abstract: summarised ×1. NIST pages 53 and 75: direct.

The row-121 sourcing through LLM03:2026 is rejected; see "Rejected".

**Change 11**

old: `2. **Second-order and indirect injection** — is content from a database, a retrieved document, or a memory treated as trusted because it is "ours"?`

new: `2. **Second-order and indirect injection** — is content from a database, a retrieved document, a memory, or an image, audio or video the model reads treated as trusted because it is "ours", or because it is not text? This is indirect prompt injection in NIST's glossary sense (see "Taxonomies, identifiers and where they come from"). OWASP's LLM01:2026 Prompt Injection counts "image, audio, or video content" among the inputs that can carry an injection, and lists among indirect sources "a tool response, a retrieved RAG passage, an image, an MCP server's output, a database row, or an issue title" (the 2026 entry cited under check 1). Greshake and others, "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection", arXiv:2302.12173, 2023 — a preprint, which NIST AI 100-2 E2025 cites as its reference 146 (page 75) — describe adversaries exploiting such applications "by strategically injecting prompts into data likely to be retrieved" (https://arxiv.org/abs/2302.12173, read 2026-10-01).`

**Change 12**

old: `and a Content Security Policy (https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/, read 2026-09-30).`

new: `and a Content Security Policy (https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/, read 2026-09-30). The image route is documented beyond the skill: NIST AI 100-2 E2025 says "Attackers may also be able to exploit features like markdown image rendering to exfiltrate data" (page 53), and LLM10:2026 Improper Output Handling describes an interface that "auto-renders Markdown images or link previews referenced in model output" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM10_ImproperOutputHandling.md, read 2026-10-01).`

**Change 13**

old: `this file applies the same rule to every confirmation (this file's own rule).`

new: `this file applies the same rule to every confirmation. OWASP's LLM01:2026 Prompt Injection asks for it before "any privileged, irreversible, or externally visible action", "surfacing the exact rendered action rather than a summary to the reviewer" (the 2026 entry cited under check 1, read 2026-10-01), and the agentic entry "ASI09: Human-Agent Trust Exploitation" asks for a "plain-language risk summary (not model-generated rationales)" (page 35 of the document cited under check 12, read 2026-10-01).`

**Change 15**

old: `From the OWASP Top 10 for the Model Context Protocol, still in beta (https://owasp.org/www-project-mcp-top-10/, read 2026-09-30): "MCP09:2025 - Shadow MCP Servers" — a configured server that no inventory the project keeps names; "MCP01:2025 - Token Mismanagement & Secret Exposure"; and "MCP08:2025 - Lack of Audit and Telemetry" — no record of which tool a server ran, with which arguments (the questions are this file's reading of the entries' titles).`

new: `From the OWASP Top 10 for the Model Context Protocol, still in beta (https://owasp.org/www-project-mcp-top-10/, read 2026-09-30; each entry's description from its index, https://raw.githubusercontent.com/OWASP/www-project-mcp-top-10/main/index.md, read 2026-10-01): "MCP09:2025 - Shadow MCP Servers", "unapproved or unsupervised deployments of Model Context Protocol instances that operate outside the organization's formal security governance" — a configured server that no inventory the project keeps names; "MCP01:2025 - Token Mismanagement & Secret Exposure", "Hard-coded credentials, long-lived tokens, and secrets stored in model memory or protocol logs …" — a credential written into a server's configuration or code, a long-lived token, or a secret kept in the model's memory or the protocol's logs (give its file and line, never its value); and "MCP08:2025 - Lack of Audit and Telemetry", whose index asks to "Maintain detailed logs of tool invocations, context changes, and user-agent interactions with immutable audit trails" — no record of which tool a server ran. Each question after a quotation is this file's reading of it, and that the record should also hold the tool's arguments is this file's own rule.`

**Change 16**

old: `8. **Memory has provenance and expiry**, and is re-scanned on read.`

new: `8. **Memory has provenance and expiry**, and is re-scanned on read. The agentic entry "ASI06: Memory & Context Poisoning" asks to "Expire unverified memory to limit poison persistence" and to "Require two factors to surface high-impact memory (e.g., provenance score plus human-verified tag)" (page 26 of the document cited under check 12, read 2026-10-01), and LLM01:2026 Prompt Injection says "Treat agent memory writes as privileged operations." (the 2026 entry cited under check 1). Can the model's output, or content it read, write to memory with no check between?`

**Change 17**

old: `and lists "Limit Exposure of Logits and Logprobs" among its mitigations (https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/, read 2026-09-30): does the interface return log-probabilities or logits to callers? This file reads that mitigation as a defence against copying the model through its interface; the entry's own words on that were read only as a summary.`

new: ``and lists "Limit Exposure of Logits and Logprobs" among its mitigations (https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/, read 2026-09-30); the entry's text in OWASP's repository says "Restrict or obfuscate the exposure of `logit_bias` and `logprobs` in API responses" and describes attackers collecting "sufficient outputs to replicate a partial model or create a shadow model" (https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/LLM10_UnboundedConsumption.md, read 2026-10-01): does the interface return log-probabilities or logits to callers? That the mitigation guards against copying the model is this file's reading; LLM06:2026 Unbounded Consumption, which does not list the mitigation, says "Exposure of logits and log-probabilities significantly accelerates extraction", and under "Agentic Circuit Breakers" asks to "Enforce step limits, recursion depth limits, time limits, and per-run cost ceilings on all agent executions" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM06_UnboundedConsumption.md, read 2026-10-01).``

**Change 18**

old: `the question under each heading is this file's reading of the heading.`
new: `the question under each heading is this file's reading of the heading. Page numbers are the document's printed ones.`

**Change 19**

old: `"ASI07: Insecure Inter-Agent Communication" — is a message from another agent validated like any untrusted input, and never obeyed as an instruction?`
new: `"ASI07: Insecure Inter-Agent Communication" — is a message from another agent validated like any untrusted input, and never obeyed as an instruction? The document describes exchanges that "lack proper authentication, integrity, or semantic validation" (page 27) and asks to "validate for hidden or modified natural-language instructions" (page 28).`

**Change 20**

old: `"ASI08: Cascading Failures" — can one agent's wrong or poisoned output drive further agents or tools with no cap or check between them?`
new: `"ASI08: Cascading Failures" — can one agent's wrong or poisoned output drive further agents or tools with no cap or check between them? The document asks for "blast-radius guardrails such as quotas, progress caps, circuit breakers between planner and executor" (page 32). A first defect that is a direct compromise under ASI04, ASI06 or ASI07 is tagged there, and ASI08 is used only when it spreads: the document says to "apply ASI08 only when that defect spreads across agents, sessions, or workflows" (page 30).`

**Change 21**

old: `"ASI09: Human-Agent Trust Exploitation" — check 4's confirmation rule.`
new: `"ASI09: Human-Agent Trust Exploitation" — check 4's confirmation rule. The document names humans "approving actions without independent validation" (page 33), and separates this entry from the next: "This entry is about human misperception or over-reliance whereas ASI10 is agent intent deviation." (page 33).`

**Change 22**

old: `"ASI10: Rogue Agents" — can an agent act outside the task it was given without that action being recorded?`
new: `"ASI10: Rogue Agents" — can an agent act outside the task it was given without that action being recorded? The document describes agents that "deviate from their intended function or authorized scope" (page 36) and asks for "comprehensive, immutable and signed audit logs of all agent actions, tool calls, and inter-agent communication" (page 37).`

### f-s5-agent-r2-9 · low · specificity · correction of the round-1 wording of the sast-scanner row (f-s5-agent-r1-4)
**What is wrong.** "dispatches sast-scanner always" states that a dispatch runs. The source is a presence check of instruction text. CTO Chief's line 464 reads "`security/sast-scanner` ALWAYS" under "### Step 13 — SECURE" (read 2026-10-01).

**Change 24**

old: ``At the secure step CTO Chief's text dispatches sast-scanner always (`agents/coordinator/cto-chief.md`, read 2026-10-01).``
new: ``At the secure step CTO Chief's text lists sast-scanner as ALWAYS (`agents/coordinator/cto-chief.md`, read 2026-10-01; a presence check of its text, not a record that a dispatch ran).``

### f-s5-agent-r2-10 · low · boundaries · new
**What is wrong.** "Trigger" names `ivv-chief.md` as a text that calls on this agent, but "Related Agents" has no row for it. This is this file's own reasoning, from reading its own table.

**Change 31**

old: ``| `cto-chief` | Coordinator — dispatches you and receives your verdict |``
new:
~~~text
| `cto-chief` | Coordinator — dispatches you and receives your verdict |
| `ivv-chief` | Its text names you for its independent re-run at Step 13 SECURE (see "Trigger") |
~~~

---

## Rejected

- **ATLAS mitigation identifiers: not added.** No output field and no check would use them. The session read the names of the nine mitigations. It read `mitigates` links only as an example: AML.M0019 to M0022 against AML.T0051. So mapping the rest to checks would be a reading of names only. The file keeps its OWASP-sourced fixes.
- **ISO/IEC 27090 and ISO/IEC 42001: not added.** Both pages returned HTTP 403.
- **Sourcing check 12's mapping of ASI02, ASI03 and ASI08 through LLM03:2026: rejected.** It would present a 2026 entry as the ground of checks written against 2025 entries, which breaks the brief's edition rule. The link sentence is recorded instead as a fact about LLM03:2026 (change 4).
- **The research's `dist/ATLAS-latest.yaml` correction: rejected.** It is a symbolic link, served as 20 bytes of link text, so the download would succeed with no data.
- **Adding AML.T0129 Triggers in Multimodal Inputs to the table: rejected.** Its tactics were not read.
- **Modifying the tested recipe: rejected.** The recipe takes the release from the first `- release:` line and the path from the first `path: v6/` line, independently. The two belong to the same entry as long as the newest entry lists a format-6 file, which every release since 2026.05 does. A tighter version that also checks the path equals `v6/ATLAS-$rel.yaml` would be untested code, so it is not proposed.

## Seven-language check
**Does not apply to this file.** The agent file carries no code example before or after these changes. The recipe and the grep commands are instructions the agent runs with Bash, and they were run once as written. The skill's examples in Python, C#, Java, TypeScript and SQL belong to the skill's rounds.

## Scores for the file as it stands
Security-agent weights: specificity 1.5, completeness 1.5, boundaries 1.0, actionability 1.25, integration 1.0, robustness 1.5, calibration 0.5, research grounding 1.5. They sum to 9.75, which is the divisor.

| Dimension | Score | Why |
|---|---|---|
| Specificity | 7 | Concrete checks and a precise recipe, but the recipe is precisely wrong |
| Completeness | 6 | Skill classes with no check; tool-description poisoning absent; media inputs unnamed |
| Boundaries | 8 | Strong; one missing row for ivv-chief |
| Actionability | 8 | Fixes are concrete and localised |
| Integration | 7 | False currency in `taxonomy_resolved_at`; dishonest `coverage` denominator |
| Robustness | 6 | Frozen data under a fresh time stamp: the false-green shape |
| Calibration | 7 | Good confidence table; the progress measure miscounts |
| Research grounding | 6 | Misattributed table, wrong version claim, stale caveat, readings that could be sourced |
| **Overall** | **6.8** | Verdict: refine |

```yaml
critique:
  agent: "llm-security-tester"
  agent_type: "security"
  round: 2
  evaluation_method: "multi-pass"
  scores: {specificity: 7, completeness: 6, boundaries: 8, actionability: 8, integration: 7, robustness: 6, calibration: 7, research_grounding: 6, overall: 6.8}
  issues: "f-s5-agent-r2-1 to f-s5-agent-r2-10 above; each carries its location, evidence, severity and exact old/new"
  bias_check: {position_bias: not-applicable, verbosity_bias: checked, self_preference_bias: checked, notes: "check 13 lengthens the file; the length is sourced coverage, not padding"}
  self_assessment:
    confidence: MEDIUM
    coverage: "100% of the agent file; the skill read in full for cross-reference only"
    blind_spots:
      - "Fingerprint not recomputed (no hashing tool)"
      - "Summarised quotes (the OWASP 2026 entries, the Model Context Protocol index, the change log, the LLM10:2025 repository text) are taken from the research dispatch and need the validator's word-for-word check"
      - "Whether NIST's page numbers are the printed numbers or the file's page positions is unknown"
      - "The grep commands for achieves targets were run for AML.T0051 only"
    variance_estimate: "+/- 0.5"
  verdict: "REFINE"
```

**Risk.** The weakest point is how exactly the recipe is transcribed in change 2. It must match session-note lines 22–23 byte for byte, including the four spaces in `'^    path: v6/'`. The executor should diff them before applying. Next come the summarised 2026 quotes in changes 3, 10, 11, 13, 14, 16 and 17. If the validator refutes one, the fix is to remove that clause; the surrounding structure still holds. One thing was not checked: whether sub-techniques carry `achieves` links of their own. Step 2 handles either answer.

## Change count
**33 changes (numbered 1–33), in 10 findings, all pairwise disjoint.** Changes 27 and 28 are separate parts of the same line. Frontmatter is untouched. No `approved_by`, `human_gate` or `review_gate` appears, and there is no gate number. No line of 25 characters or more from the skill appears in the new text. The new text names none of the compliance-control tokens in `src/lib/regulatory-regime.js`. No new line starts with `#`, so the heading fences are unaffected.

## Additions to the skill-reconcile list
25. **Lines 494, 496 and 519: format version, not content release.** "release 5.6.0" is a data-format version, which the manifest last pairs with content release 2026.04; the content release is 2026.09. The instruction to re-resolve against the live repository must name the manifest route. It must not name `dist/ATLAS.yaml` (deprecated) or `ATLAS-latest.yaml` (symbolic links served as link text). Session note, read in full 2026-10-01.
26. **Line 513: a renamed tactic.** The current data names AML.TA0001 "AI Attack Adaptation", not "AI Attack Staging".
27. **Lines 500–517: Lateral Movement.** AML.T0053 now also achieves AML.TA0015 Lateral Movement, and the skill's table has no Lateral Movement row.
28. **Line 566: two triage rows that are not vulnerabilities.** "missing watermark on system prompt" and "documentation gaps" cannot stand as findings under the agent's rule that every finding is critical. The skill should also state which of its classes map to which of the agent's thirteen checks.
29. **Line 68: a source for the separation claim.** LLM01:2026 mitigation 6 says structural separation "reduces attack success in non-adaptive tests only" (summarised ×1, 2026-10-01).
30. **Lines 75 and 327: memory expiry can now be sourced.** ASI06 on printed page 26: "Expire unverified memory to limit poison persistence."
31. **Lines 261 and 488: caps on each tool step can now be sourced.** The sources are ASI08 on printed page 32 ("blast-radius guardrails …") and the "Agentic Circuit Breakers" sentence of LLM06:2026. The name "promptware kill chain" stays unsourced.
32. **Lines 371 and 487: tool-description audit can now be sourced.** LLM01:2026 says "audit tool descriptions for hidden instructions". The name "MCPTox" is still unverified.
33. **Lines 263 and 638: media inputs can now be sourced.** The LLM01:2026 definition includes "image, audio, or video content". AML.T0129 Triggers in Multimodal Inputs is present in the current data; its tactics were not read.
34. **Lines 296, 362 and 485: markdown-image exfiltration can now be sourced.** NIST AI 100-2 E2025 page 53: "Attackers may also be able to exploit features like markdown image rendering to exfiltrate data".

Files: `/Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md` (target), `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-agent-round2-session-runs.md` (the authoritative raw reads and the tested recipe), `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-agent-round2-research-d-s5-agent-r2-research.md`.
