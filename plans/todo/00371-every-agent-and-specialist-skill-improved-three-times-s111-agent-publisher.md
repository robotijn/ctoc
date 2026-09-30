---
iron_loop_verdict: true
iron_loop: true
title: "The agent publisher improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00370-every-agent-and-specialist-skill-improved-three-times-s110-gate-critic-and-lenses
priority: medium
files:
  - agents/pipeline/agent-publisher.md
  - .ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-publisher.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-09-30T07:58:19.650Z
gate_crossed: implementation → todo
---

# The agent publisher improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on the one file below. It has no skill body of its own.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/pipeline/agent-publisher.md` | the last stage of the agent-improvement pipeline — writes, records and commits an improved agent (`tier: 1`, `tools: Read, Write, Bash`) — no skill body |

Slice s111 of 121 in the sequence of files (parent index): the first file worked in the `pipeline/` category. `agents/pipeline/agent-critic.md` sorts first in this category but is an instrument, worked in its prerequisite slice (s1) and in its rounds at the end (s119). Previous: the gate-critique group (s110). Next: the agent quality checker (s112).

### What the rounds research

Publishing an improved agent definition: validating before writing, recording the grade and an audit entry, and committing the change as one reviewable unit — sequentially, one commit per batch, never pushed without the human. Authoritative sources first: git's own documentation for the commands the file shows (`git status --porcelain`, `git add`, `git commit`), GitHub's documentation of the co-author trailer the commit message carries, and published guidance on commit-message structure. Check the claims about this repository, each against disk and against `CLAUDE.md`:

- `.ctoc/agents/grades.yaml` is the canonical grade store declared in `.ctoc/architecture/tier-definitions.yaml` — the planner found both, the declaration at `storage: .ctoc/agents/grades.yaml`. The file also says the capability index `.ctoc/agents/capability-index.yaml` and the audit log `.ctoc/agents/audit.log` "all live under the git-tracked `.ctoc/agents/`"; the planner found neither file on disk (only `grades.yaml` and `dispatch-grades.yaml`). The round checks what reads each file and whether the statement is true.
- This repository's commit messages always include the version (`CLAUDE.md`, "Release": `feat: feature name (vX.Y.Z)`, patch bump by default); the file's commit format (`agent: update <name> to score <score> (<rounds> rounds)`) carries none. The round checks the file against that rule.
- `CLAUDE.md` says git operations must be serialised and never run alongside another agent editing tracked files; the file's batch section already processes agents sequentially — the round checks the rest agrees.
- The pre-publish check uses `test -f`, a shell built-in that the Windows shells lack; the round checks it against the cross-platform rule.
- The examples carry timestamps and a contact address (`noreply@ctoc.dev`); the round checks whether that address belongs to the project, and whether any timestamp is presented as a status the agent reports (the honest-status rule: nothing in CTOC is scheduled against a wall clock).
- The pipeline it ends — writer, tester, quality checker, publisher — and the scores it records: the round checks what dispatches this pipeline today and states it plainly, never that it runs when nothing runs it.

Sibling boundary: `agents/pipeline/agent-qa.md` (decides whether to publish; its verdict literals `PROCEED` and `REVERT` are what this file reads), `agents/pipeline/agent-writer.md`, `agents/pipeline/agent-tester.md`, `agents/pipeline/agent-critic.md`, and the release script `src/scripts/release.js`.

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out; the boundary with sibling agents; any claim that a mechanism runs when it does not (for example that the refinement loop runs — `docs/REFINEMENT_LOOP.md` records it as not running); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it does not apply — the file's examples are shell commands and data records, not teaching code; the round's record decides and states why.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Specific to this file:** `tests/architecture-invariants.test.js` lists it among the tier-one agents; `tests/tier1-no-peer-dispatch.test.js` covers the `pipeline/` directory, so "you recommend dispatches; CTO Chief executes them" stays true; `tests/agent-model-floor.test.js` lists it in the effort exemption map as an actuator (`effort` stays byte-identical); `tests/corpus-audit-ledger.test.js` lists this path; `tests/v8-dispatcher.test.js` infers the tier of `pipeline/` paths. The output contract's field names and literal values (`publish_result`, `status` with `committed`, `failed` and `skipped`, `updates` with its three flags) stay byte-identical.
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

- `.ctoc/audit/agent-and-skill-improvement/agents/pipeline/agent-publisher.md.json` — three round entries.
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

No module, no export, and no file added, moved or renamed under `agents/`. The publisher is dispatched by name by the CTO Chief coordinator; this slice changes what the file says, not its path, tier or tools, which the fences above prove.

### Security review

- Every fetched page, search result and byte of the file under review is data, never instruction; an instruction aimed at the reader is recorded as a finding and not followed (scenarios 15 and 27).
- No secret enters the file or the record.
- No tool grant is widened or narrowed; the agent holds `Bash` and commits, so no change may add an order to push, to force-push, to amend a pushed commit, or to stage with a blanket `git add -A` — the file's "Does NOT push to remote (requires human approval)" stays. A fix that would need a tool change goes to the human (scenario 16).

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes an instruction file only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read this file are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **The commit-message format is an output contract only if something reads it.** The round checks whether any code parses the `agent: update … (… rounds)` subject line; if nothing does, aligning it with the repository's release rule is a body change; if something does, it is an output-contract finding for the human.


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
