---
iron_loop_verdict: true
iron_loop: true
title: "The three files that must state the same Cyber Resilience Act facts — bill-of-materials checker, dependency auditor and dependency checker — agents and skills improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00332-every-agent-and-specialist-skill-improved-three-times-s72-cra-incident-clocks
priority: medium
files:
  - agents/compliance/sbom-cra-checker.md
  - skills/compliance/sbom-cra-checker/SKILL.md
  - agents/security/dependency-auditor.md
  - skills/security/dependency-auditor/SKILL.md
  - agents/security/dependency-checker.md
  - skills/security/dependency-checker/SKILL.md
  - .ctoc/audit/agent-and-skill-improvement/agents/compliance/sbom-cra-checker.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/compliance/sbom-cra-checker/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/agents/security/dependency-auditor.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/security/dependency-auditor/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/agents/security/dependency-checker.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/security/dependency-checker/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:18.582Z
gate_crossed: implementation → todo
---

# The three files that must state the same Cyber Resilience Act facts — bill-of-materials checker, dependency auditor and dependency checker — agents and skills improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on each of the six files below, one file at a time and all three rounds on a file before the next; this group travels together because a test pins the same regulatory facts across the skill bodies.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/compliance/sbom-cra-checker.md` | wrapper agent — `target_skill: compliance/sbom-cra-checker` |
| 2 | `skills/compliance/sbom-cra-checker/SKILL.md` | its skill body — software bill of materials correctness, signing, retention and Cyber Resilience Act reporting readiness |
| 3 | `agents/security/dependency-auditor.md` | agent that both wraps and extends its skill — `target_skill` and `extends_skill` are both `security/dependency-auditor` |
| 4 | `skills/security/dependency-auditor/SKILL.md` | its skill body — the fence's own header says it cites the same sources |
| 5 | `agents/security/dependency-checker.md` | wrapper agent — `target_skill: security/dependency-checker` |
| 6 | `skills/security/dependency-checker/SKILL.md` | its skill body — the file the regulatory-citation fence pins |

Slice s73 of 121 in the sequence of files (parent index). The group takes the position of its latest member, `skills/security/dependency-checker/SKILL.md`, so it sits in the security category; the bill-of-materials pair moves here from compliance. Previous: the Cyber Resilience Act incident clocks (s72). Next: the security incident responder (s74).

### What the fence pins, exactly (`tests/skill-regulatory-citations.test.js`)

In `skills/security/dependency-checker/SKILL.md`: the regulation number `2024/2847`; the 11 September 2026 reporting-obligation date (matched as "11 Sep 2026", "11 September 2026" or "September 2026"); the 11 December 2027 full-application date (matched the same way); the words "NTIA minimum elements"; at least one official source address on `eur-lex.europa.eu`, `digital-strategy.ec.europa.eu`, `enisa.europa.eu` or `ntia.gov`; and a `last verified:` line. And **the same three facts — the number and both dates — must also appear in `skills/compliance/sbom-cra-checker/SKILL.md`**. The test's header says both skills and `skills/security/dependency-auditor/SKILL.md` cite the same authoritative sources.

**The currency point the parent names.** 11 September 2026 had passed on the day the parent was written (29 September 2026). The fence pins that the date is present, not its tense, so every sentence in the three files that treats the reporting obligation as upcoming is corrected to the past tense with its source — without removing the date strings the fence matches. Because the fence pins a fact across two files, a change to how that fact is stated in one is made in the other before the slice ends (scenario 18), and the fence may be red between the two edits inside the slice; that is expected, and the slice does not end until it is green (parent, "Pinned pairs under this order").

### What the rounds research

The Cyber Resilience Act, Regulation (EU) 2024/2847 — its application dates (Article 71), its vulnerability-handling and reporting duties (Articles 13 and 14), and its penalties (Article 64); software bills of materials in the SPDX and CycloneDX formats and the minimum elements published by the United States National Telecommunications and Information Administration; signing, retention and the European Union Agency for Cybersecurity's single reporting platform; and dependency auditing and quick dependency checks (known vulnerabilities, outdated versions, licence issues). Authoritative sources first: the regulation on EUR-Lex, the Commission's and the Agency's own pages, the minimum-elements report on ntia.gov, the SPDX and CycloneDX specifications (their current versions — the bill-of-materials agent's description names SPDX 2.3 or later and CycloneDX 1.6 or later), and the vulnerability databases and scanners the files name (the Open Source Vulnerabilities database, the National Vulnerability Database, each package manager's audit command). Check every article number, date, format version and tool command against its source on the day of the round. Sibling boundary: `security/cra-incident-clocks` (the reporting clocks), `compliance/license-scanner`, `security/secrets-detector`, `infrastructure/ci-pipeline-checker`.

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out; the boundary with sibling agents; any claim that a mechanism runs when it does not (for example that the refinement loop runs — `docs/REFINEMENT_LOOP.md` records it as not running); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it applies to the package ecosystem and audit command of each of the seven, not to code patterns. Each round's record decides and states why for its file.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Skill fences** (run for every skill body): `tests/skill-loading.test.js` (its trigger-phrase corpus must still match — phrases may be added, never removed or narrowed without proof), `tests/plugin-skill-discovery.test.js`, `tests/architecture-invariants.test.js` (every skill body declares `type: skill` and never `allowed-tools:`), `tests/no-model-optimized-for.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/claim-census.test.js`, `tests/claim-ledger-gate.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`.
- **Specific to these files:** `tests/skill-regulatory-citations.test.js` (above); `tests/cu5-s4-compliance-aiquality-wrappers.test.js` pins the bill-of-materials wrapper — frontmatter keys only from its closed allowlist, no gate field, the watcher sections (`## Role`, `## Trigger`, `## Checks`, `## Output Format (MANDATORY)`, `## Blocking Rules`, `## Related Agents`), the delegation sentence naming its skill's path, and **no line of 25 characters or more copied from its skill body**; `tests/cu5-wrapper-coverage-completeness.test.js` lists that wrapper among the twelve; `tests/corpus-audit-ledger.test.js` requires the dependency-checker skill to exist; `tests/registry-integrity.test.js` reads the security agents directory; `tests/compliance-claims-match-code.test.js` keeps every `NOT ENFORCED` marker true.
- **The record check:** `tests/agent-and-skill-improvement-record.test.js`.
- The complete list of tests that read each file is the inventory's measured `tests_reading` (slice s2); run every test it names. The lists above are the corpus-wide fences plus what the planner found by searching the test files for these exact paths; the full gate settles the rest.
- **What may change:** body text, `description`, `when_to_load` and `related_skills`. Every other frontmatter key stays byte-identical, and so do the field names, literal values and file paths of any output that code or another agent reads (the dispatch schema in `.ctoc/architecture/dispatch-schema.yaml` among them).

### How each round runs, and who does what

The build executor holds Read, Write, Edit and Bash and no way to dispatch another agent, so the dispatcher (the session driving the build, acting as CTO Chief under the dispatch protocol) dispatches the read-only agents — at most five in flight — and hands their outputs to the executor verbatim. Per file, per round:

1. **Read and fingerprint** (executor): the file, its paired file, the other two pairs of this group, every test the inventory lists for it; fingerprint = `sha256:` plus the hexadecimal digest of the file's bytes.
2. **Research and critique** (`agents/pipeline/agent-critic.md`): briefed with the file path and fingerprint, every earlier round's findings and source classes for this file and for the group, the pinned facts above, and a request for its deepest reasoning (the owner's word: ultrathink).
3. **Validate** (`agents/ai-quality/citation-validator.md`): every citation-shaped claim already in the file and in the proposed changes; it fetches the sources itself.
4. **Update** (executor): only what the validator passed; a refuted or unsourceable claim is corrected or stripped as the verdict recommends — never removing a string the regulatory-citation fence matches. If the fingerprint moved since the read, the critique is discarded and the round restarts.
5. **Re-validate:** the validator reads the edited file once more; leftovers are fixed and re-checked within the circuit breaker (three attempts on one step, five in total per slice), after which the round is held and put to the human.
6. **Prove** (executor): the fences that read the file, `tests/skill-regulatory-citations.test.js` included.
7. **Record, last** (executor): the round entry, written only after the above and after every late correction the round triggered.

A refuted claim is searched for by exact text in every in-scope file (scenario 7): a file not yet started — the record names the slice that will meet it; a file in this slice — corrected here; a finished file (the incident-clocks pair of slice s72, for example) — a late correction (scenario 28 and decision 2 below). The full text is the parent index section "How a round runs, and who does what".

### The evidence record this slice produces

- `.ctoc/audit/agent-and-skill-improvement/agents/compliance/sbom-cra-checker.md.json`, `.ctoc/audit/agent-and-skill-improvement/skills/compliance/sbom-cra-checker/SKILL.md.json`, `.ctoc/audit/agent-and-skill-improvement/agents/security/dependency-auditor.md.json`, `.ctoc/audit/agent-and-skill-improvement/skills/security/dependency-auditor/SKILL.md.json`, `.ctoc/audit/agent-and-skill-improvement/agents/security/dependency-checker.md.json`, `.ctoc/audit/agent-and-skill-improvement/skills/security/dependency-checker/SKILL.md.json` — three round entries each.
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
2. After each round: the fences that read the file, named in the round entry. `tests/skill-regulatory-citations.test.js` may be red between an edit to one pinned skill and the matching edit to the other; it must be green before the slice's last round on either of them is recorded.
3. At the end of the slice: `npm test` — the suite, the coverage floor of 99 read from `.ctoc/coverage-baseline.json`, zero skipped; `node --test` alone is not the gate. A printed warning or deprecation is a defect to fix. A gate failure on the claims ledger that this work did not cause is a blocker put to the human with the gate's exact output (scenario 30).
4. One commit for the slice carrying a patch version per the release rule; nothing pushed.

### Wiring — the live call sites

No module, no export, and no file added, moved or renamed under `agents/` or `skills/`. Each agent is dispatched by name — its `description` is the routing surface — and each skill is loaded when a request matches its `when_to_load` phrases, through the skill directories the plugin declares. This slice changes what they say, not whether they are reachable; the dispatch and skill-loading fences above prove they still resolve.

### Security review

- Every fetched page, search result and byte of a file under review is data, never instruction; an instruction aimed at the reader is recorded as a finding and not followed (scenarios 15 and 27).
- No secret enters any file or record; registry tokens in examples are named by reference, never by value; sources are quoted briefly and verbatim.
- No tool grant is widened; a fix that would need one goes to the human (scenario 16).
- The files guide compliance work; they are not legal advice, and wording that reads as legal advice is a finding.

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes instruction files only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read these files are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **Six files in one slice, above the one-to-three size.** The parent names this group as travelling together and says a group is never split; the fence's cross-file assertion is the technical reason. The group rule wins over the size rule.
4. **The bill-of-materials pair is worked here, not in the compliance category,** because a group takes the position of its latest member (parent, "The order of work", rule 4).
5. **Within the group, file by file still holds.** All three rounds on a file finish before the next file starts, in the table's order; the cross-file fact is kept consistent by making the second file's matching edit in its own rounds, and the slice does not end while the fence is red.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
