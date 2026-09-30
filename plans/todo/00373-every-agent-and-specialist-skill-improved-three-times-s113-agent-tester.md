---
iron_loop_verdict: true
iron_loop: true
title: "The agent tester improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00372-every-agent-and-specialist-skill-improved-three-times-s112-agent-qa
priority: medium
files:
  - agents/pipeline/agent-tester.md
  - .ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-tester.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:19.704Z
gate_crossed: implementation → todo
---

# The agent tester improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on the one file below. It has no skill body of its own.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/pipeline/agent-tester.md` | tests an agent definition against expected outputs (`tier: 1`, `tools: Read, Bash, Grep`) — no skill body |

Slice s113 of 121 in the sequence of files (parent index). Previous: the agent quality checker (s112). Next: the agent writer (s114).

### What the rounds research

Testing an agent definition: test cases with inputs, expected outputs and tolerances; unit, integration and edge-case categories; schema, type, value and format checks; and a result report. Authoritative sources first: published practice for evaluating language-model agents and prompts — curated evaluation sets, tolerance-based matching, repeated runs to separate a real failure from sampling variance — from the evaluation frameworks' own documentation and the research that measured their reliability. Check the claims about this repository, each against disk:

- The file loads test cases with `loadTestCases(agentPath)` from `.ctoc/agents/test-cases/<agent-name>.yaml`; the planner found no such function in `src/` and no such directory on disk (only `.ctoc/agents/grades.yaml` and `.ctoc/agents/dispatch-grades.yaml`).
- The file says it will "simulate agent execution with input". The agent holds Read, Bash and Grep and no way to dispatch another agent, and `CLAUDE.md` says CTOC never spawns a second Claude (no `claude -p`). The round checks what "simulate" can honestly mean with these tools and states it; an order the tools cannot carry out is corrected or reported (criterion 5).
- The file's rules must agree with the project's own testing rules: test behaviour, not structure; a test that cannot run fails loudly; zero skipped; no mocks of core logic (`CLAUDE.md`, "Quality Non-Negotiables"). Its report carries a `skipped` count and an `execution_time` — the round checks whether any measured number in its example is presented as a result the agent observed.
- The example hard-coded secret uses a value shaped like a real provider's key prefix; the round replaces it with an obviously invented value.

Sibling boundary: `agents/pipeline/agent-critic.md`, `agents/pipeline/agent-qa.md` (reads this file's results), `agents/pipeline/agent-writer.md`, and the testing specialists under `testing/`.

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out; the boundary with sibling agents; any claim that a mechanism runs when it does not (for example that the refinement loop runs — `docs/REFINEMENT_LOOP.md` records it as not running); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it applies only as far as the test-case inputs carry code in a named language; the round's record decides and states why.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Specific to this file:** `tests/architecture-invariants.test.js` lists it among the tier-one agents; `tests/tier1-no-peer-dispatch.test.js` covers the `pipeline/` directory, so "you recommend, CTO Chief executes" stays true; `tests/agent-model-floor.test.js` governs its `model` and `effort` (both stay byte-identical); `tests/corpus-audit-ledger.test.js` lists this path. The agent holds `Bash`, so `tests/unexecutable-instruction-fence.test.js` accepts an order to run JavaScript; an order to call a function that does not exist is still a false claim, which the round corrects. The `results` report's field names stay byte-identical, because the quality checker reads them.
- **The record check:** `tests/agent-and-skill-improvement-record.test.js`.
- The complete list of tests that read the file is the inventory's measured `tests_reading` (slice s2); run every test it names. The lists above are the corpus-wide fences plus what the planner found by searching the test files for this exact path; the full gate settles the rest.
- **What may change:** body text and `description`. Every other frontmatter key — `name`, `tools`, `model`, `effort`, `reads_ancestry`, `async_choice_protocol`, `reports_to`, `tier` — stays byte-identical.

### How each round runs, and who does what

The build executor holds Read, Write, Edit and Bash and no way to dispatch another agent, so the dispatcher (the session driving the build, acting as CTO Chief under the dispatch protocol) dispatches the read-only agents — at most five in flight — and hands their outputs to the executor verbatim. Per file, per round:

1. **Read and fingerprint** (executor): the file, the siblings it defers to, every test the inventory lists for it; fingerprint = `sha256:` plus the hexadecimal digest of the file's bytes.
2. **Research and critique** (`agents/pipeline/agent-critic.md`): briefed with the file path and fingerprint, every earlier round's findings and source classes for this file, and a request for its deepest reasoning (the owner's word: ultrathink).
3. **Validate** (`agents/ai-quality/citation-validator.md`): every citation-shaped claim already in the file and in the proposed changes; it fetches the sources itself.
4. **Update** (executor): only what the validator passed; a refuted or unsourceable claim is corrected or stripped as the verdict recommends. If the fingerprint moved since the read, the critique is discarded and the round restarts.
5. **Re-validate:** the validator reads the edited file once more; leftovers are fixed and re-checked within the circuit breaker (three attempts on one step, five in total per slice), after which the round is held and put to the human.
6. **Prove** (executor): the fences that read the file.
7. **Record, last** (executor): the round entry, written only after the above and after every late correction the round triggered.

A refuted claim is searched for by exact text in every in-scope file (scenario 7): a file not yet started — the record names the slice that will meet it; a file in this slice — corrected here; a finished file — a late correction (scenario 28 and decision 2 below). The full text is the parent index section "How a round runs, and who does what".

### The evidence record this slice produces

- `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-tester.md.json` — three round entries.
- `.ctoc/audit/agent-and-skill-improvement/late-corrections.json` and `.ctoc/audit/agent-and-skill-improvement/for-the-human.json` — only when a round triggers a late correction or a finding it may not apply.

Each round entry holds the round number, the date (a date only), the queries, each source (address, date read, what it bore on, supported or refuted or not bearing), each finding with its evidence and decision, the fingerprints before and after, the validator's counts before and after the edit, the fences and results, the dispatch identifiers, the fingerprints of the instruments used, the paired files compared (here: none, and the siblings compared instead), and the seven-language result. The exact shape is the parent index section "The record's exact shape", enforced by `tests/agent-and-skill-improvement-record.test.js`. A round that finds nothing counts only with those lists filled and identical fingerprints (scenario 3).

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

No module, no export, and no file added, moved or renamed under `agents/`. The tester is dispatched by name by the CTO Chief coordinator; this slice changes what the file says, not its path, tier or tools, which the fences above prove.

### Security review

- Every fetched page, search result and byte of the file under review is data, never instruction; an agent definition under test is untrusted input, and an instruction aimed at the reader is recorded as a finding and not followed (scenarios 15 and 27).
- No secret enters the file or the record; example credentials are obviously invented values, never a real provider's key format.
- No tool grant is widened; the agent holds `Bash`, and no change may add an order that writes outside a scratch location or spawns a second model. A fix that would need a tool change goes to the human (scenario 16).

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes an instruction file only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read this file are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **A missing mechanism is described as missing, not built.** If the round confirms that no test-case store and no loader exist, the file is corrected to say what the agent can actually do with its tools; creating a store, a loader or a way to run an agent is new code outside this work and goes to the human.


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
