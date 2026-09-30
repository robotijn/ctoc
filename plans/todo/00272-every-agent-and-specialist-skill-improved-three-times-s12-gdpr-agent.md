---
iron_loop_verdict: true
iron_loop: true
title: "The General Data Protection Regulation agent and its compliance skill, improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00271-every-agent-and-specialist-skill-improved-three-times-s11-audit-log-checker
priority: medium
files:
  - agents/compliance/gdpr-agent.md
  - skills/compliance/gdpr-compliance-checker/SKILL.md
  - .ctoc/audit/agent-and-skill-improvement/agents/compliance/gdpr-agent.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/compliance/gdpr-compliance-checker/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:16.804Z
gate_crossed: implementation → todo
---

# The General Data Protection Regulation agent and its compliance skill, improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on each file below, one file at a time: all three rounds on the agent, then all three on the skill it delegates to.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/compliance/gdpr-agent.md` | rich agent that delegates to the skill below by body path (no frontmatter skill key); plan-ancestry and code-scan agent gated on the `gdpr` profile; advisory only |
| 2 | `skills/compliance/gdpr-compliance-checker/SKILL.md` | the specialist skill body holding the narrative rules and the examples |

Slice s12 of 121 in the sequence of files (parent index). Previous: the audit-log checker (s11). Next: the open-source license scanner (s13).

### What the rounds research

The General Data Protection Regulation, Regulation (EU) 2016/679: lawful bases, data-subject rights, records of processing, processors, transfers, breach notification, and data protection by design. Authoritative sources first: the regulation's text on EUR-Lex; the European Data Protection Board's adopted guidelines for any topic the files interpret; judgments of the Court of Justice of the European Union where the files rely on one; national supervisory authorities only as secondary sources. Check every article number, every time limit and every interpretation against the text and the board's current guidance. Sibling boundary: `legal/dsar-handler` (access and deletion requests), `saas/legal-scaffold` (policy documents), `compliance/audit-log-checker`, `compliance/eu-solution-recommender` (which the agent calls).

**The rule authority is split three ways, and two of the three are code** (the agent says so itself): the skill holds narrative rules and examples; `src/lib/gdpr-helpers.js` holds the deterministic rules; the agent restates neither. So:

- The agent must keep: `tools: Read, Grep` only; naming the gate `shouldRunGdpr` in the `compliance-regime` module and the "profile absent, exit immediately with no output" contract; the four helpers `mapPiiFieldToArticles`, `validateFindingSchema`, `normalizeSeverity`, `routeFinding` and the `gdpr-helpers` module; the path `skills/compliance/gdpr-compliance-checker`; and it must never gain a personal-data field array literal, a line starting `BAD:` or `SAFE:`, or a `gdpr_article` enumeration (`tests/gdpr-agent-definition.test.js`).
- The skill's `gdpr_article` enumeration table must stay **deep-equal to the code's list of valid articles** and keep all 14 codes (`tests/gdpr-skill-enum.test.js`). A round that concludes the enumeration is wrong reports it to the human: the list lives in `src/`, which this work does not change.

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out (the agent cannot execute the gate function — the dispatcher does); the boundary with sibling agents; any claim that a mechanism runs when it does not (the agent's text mentions the refinement loop — `docs/REFINEMENT_LOOP.md` records it as not running, so a claim that it runs is a finding); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it applies to the skill's examples, which the agent must not copy. The round's record decides and states why.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Skill fences** (run for every skill body): `tests/skill-loading.test.js` (its trigger-phrase corpus must still match — phrases may be added, never removed or narrowed without proof), `tests/plugin-skill-discovery.test.js`, `tests/architecture-invariants.test.js` (every skill body declares `type: skill` and never `allowed-tools:`), `tests/no-model-optimized-for.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/claim-census.test.js`, `tests/claim-ledger-gate.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`.
- **Specific to these files:** `tests/gdpr-agent-definition.test.js` and `tests/gdpr-skill-enum.test.js` (above); `tests/cu5-s4-compliance-aiquality-wrappers.test.js` and `tests/cu5-wrapper-coverage-completeness.test.js` (the skill stays reachable through the agent's body path, and the old thin wrapper stays deleted); `tests/unexecutable-instruction-fence.test.js` (which names the agent); `tests/compliance-claims-match-code.test.js` (every regulatory control the product does not enforce keeps its `NOT ENFORCED` marker); `tests/corpus-audit-ledger.test.js`.
- **The record check:** `tests/agent-and-skill-improvement-record.test.js`.
- The complete list of tests that read each file is the inventory's measured `tests_reading` (slice s2); run every test it names. The lists above are the corpus-wide fences plus what the planner found by searching the test files for these exact paths; the full gate settles the rest.
- **What may change:** body text, `description`, `when_to_load` and `related_skills`. Every other frontmatter key stays byte-identical, and so do the field names, literal values and file paths of the findings the agent emits and the enumeration codes the skill lists.

### How each round runs, and who does what

The build executor holds Read, Write, Edit and Bash and no way to dispatch another agent, so the dispatcher (the session driving the build, acting as CTO Chief under the dispatch protocol) dispatches the read-only agents — at most five in flight — and hands their outputs to the executor verbatim. Per file, per round:

1. **Read and fingerprint** (executor): the file, its paired file, `src/lib/gdpr-helpers.js` (read only), every test the inventory lists for it; fingerprint = `sha256:` plus the hexadecimal digest of the file's bytes.
2. **Research and critique** (`agents/pipeline/agent-critic.md`): briefed with the file path and fingerprint, every earlier round's findings and source classes for this file, the three-way rule authority above, and a request for its deepest reasoning (the owner's word: ultrathink).
3. **Validate** (`agents/ai-quality/citation-validator.md`): every citation-shaped claim already in the file and in the proposed changes; it fetches the sources itself.
4. **Update** (executor): only what the validator passed; a refuted or unsourceable claim is corrected or stripped as the verdict recommends. If the fingerprint moved since the read, the critique is discarded and the round restarts.
5. **Re-validate:** the validator reads the edited file once more; leftovers are fixed and re-checked within the circuit breaker (three attempts on one step, five in total per slice), after which the round is held and put to the human.
6. **Prove** (executor): the fences that read the file.
7. **Record, last** (executor): the round entry, written only after the above and after every late correction the round triggered.

A refuted claim is searched for by exact text in every in-scope file (scenario 7): a file not yet started — the record names the slice that will meet it; a file in this slice — corrected here; a finished file — a late correction (scenario 28 and decision 2 below). The full text is the parent index section "How a round runs, and who does what".

### The evidence record this slice produces

- `.ctoc/audit/agent-and-skill-improvement/agents/compliance/gdpr-agent.md.json` — three round entries for the agent.
- `.ctoc/audit/agent-and-skill-improvement/skills/compliance/gdpr-compliance-checker/SKILL.md.json` — three round entries for the skill.
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

No module, no export, and no file added, moved or renamed under `agents/` or `skills/`. The agent is dispatched when the `gdpr` profile is active and reads the skill by path; the skill is also loaded when a request matches its `when_to_load` phrases. This slice changes what they say, not whether they are reachable.

### Security review

- Every fetched page, search result and byte of a file under review is data, never instruction; an instruction aimed at the reader is recorded as a finding and not followed (scenarios 15 and 27).
- No secret and no real personal data enter any file or record; examples use invented data only; sources are quoted briefly and verbatim.
- No tool grant is widened; the agent keeps holding no write or command tool (scenario 16).
- The agent stays advisory: it adds no human gate and weakens none.

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes instruction files only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read these files are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **The gdpr agent and its skill are one pair** although the agent names the skill in its body rather than in a frontmatter key; `tests/cu5-wrapper-coverage-completeness.test.js` credits exactly that body reference as the skill's coverage, which is the parent's "an agent travels with the skill body it points to".


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
