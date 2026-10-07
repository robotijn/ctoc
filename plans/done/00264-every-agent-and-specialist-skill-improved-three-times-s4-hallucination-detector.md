---
iron_loop_verdict: true
iron_loop: true
title: "The detector of invented packages and interfaces, agent and skill, improved three times from fresh web research"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00263-every-agent-and-specialist-skill-improved-three-times-s3-ai-code-quality-reviewer
priority: medium
files:
  - agents/ai-quality/hallucination-detector.md
  - skills/ai-quality/hallucination-detector/SKILL.md
  - .ctoc/audit/agent-and-skill-improvement/agents/ai-quality/hallucination-detector.md.json
  - .ctoc/audit/agent-and-skill-improvement/skills/ai-quality/hallucination-detector/SKILL.md.json
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
approved_by: human
approved_at: 2026-10-07T07:38:34.226Z
gate_crossed: review → done
---

# The detector of invented packages and interfaces, agent and skill, improved three times from fresh web research

**Scope (one line):** three rounds — fresh web research, a deepest-reasoning adversarial critique, a validated update — on each file below, one file at a time: all three rounds on the agent, then all three on its skill.

## Implementation Details

### The files, in the order they are worked

| Order | File | What it is |
|---|---|---|
| 1 | `agents/ai-quality/hallucination-detector.md` | wrapper agent — `target_skill: ai-quality/hallucination-detector` |
| 2 | `skills/ai-quality/hallucination-detector/SKILL.md` | the specialist skill body the agent loads |

Slice s4 of 121 in the sequence of files (parent index). Previous: the reviewer of code written by artificial-intelligence assistants (s3). Next: the security tester for applications that call large language models (s5).

### What the rounds research

Code that references packages, application programming interfaces or methods that do not exist, and the attack that registers such invented names on public package registries (the trigger phrase "slopsquatting"). Authoritative sources first: the package registries' own documentation and security policies (the npm registry, the Python Package Index, crates.io, Maven Central, NuGet, and any other the files name), the original research papers that measured package invention by language models (the papers themselves), and registry or security-body advisories on name squatting. Check every detection recipe against how each registry's lookup actually answers for a missing name today, and whether the files' statistics match the papers they cite. Sibling boundary: `ai-code-quality-reviewer` (general defects of assistant-written code) and `dependency-auditor` (known-vulnerable real packages).

**Checked in every round of every file** (parent, "One round, precisely"): facts and their currency; missing failure classes or standards; orders the file gives that its `tools:` cannot carry out; the boundary with sibling agents; any claim that a mechanism runs when it does not (for example that the refinement loop runs — `docs/REFINEMENT_LOOP.md` records it as not running); code examples; trigger phrases (skill) and `description` (agent); treatment of untrusted content as data; literal, explicit wording. Rounds two and three use different source classes or angles than the round before and say which.

Seven-language check: the planner's reading is that it applies — every one of the seven languages has a package ecosystem. The round's record decides and states why.

### Contracts and fences that must stay green

- **Agent-layer fences** (run for every agent file): `tests/agent-contract-load.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-modernization.test.js`, `tests/no-tier-3.test.js`, `tests/no-model-optimized-for.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/watcher-shape.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/refinement-loop-claims-match-code.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`, and the agent-layer tests whose contracts the parent did not read: `tests/agent-slots.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-resolver.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/registry-integrity.test.js`, `tests/tier1-no-peer-dispatch.test.js`.
- **Skill fences** (run for every skill body): `tests/skill-loading.test.js` (its trigger-phrase corpus must still match — phrases may be added, never removed or narrowed without proof), `tests/plugin-skill-discovery.test.js`, `tests/architecture-invariants.test.js` (every skill body declares `type: skill` and never `allowed-tools:`), `tests/no-model-optimized-for.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/claim-census.test.js`, `tests/claim-ledger-gate.test.js`, `tests/readme-numbers.test.js`, `tests/corpus-audit-ledger.test.js`.
- **Specific to these files:** the wrapper keeps `name`, `type: wrapper` and `target_skill`, and still resolves to its skill. The skill body carries code that calls module-loading functions; the dead-code fence (`tests/reachability.test.js`) credits a shipped instruction that runs a repository path as a root, so a changed recipe is checked against it.
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

- `.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/hallucination-detector.md.json` — three round entries for the agent.
- `.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/hallucination-detector/SKILL.md.json` — three round entries for the skill.
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
- A detection recipe that queries a registry for a name must never install the package it checks; any recipe that would is a finding.

## Decisions Taken Under Ambiguity

1. **No new test at the test step.** The slice changes instruction files only, and the parent forbids adding or editing any test other than the record check. The specification is the per-file criteria and the record check; the tests that already read these files are the baseline that must stay green, and their being green before any change is expected and stated in the record, not counted as proof of anything.
2. **A late correction to a finished file is refused by the edit protection.** Enforcement is `strict` (`.ctoc/settings.yaml`) and a finished file's slice has left the build queue, so its file no longer has write coverage. The executor files the correction through the scope-growth door — `requestScopeGrowth` in `src/lib/scope-growth.js`, all seven fields — records the late correction with `applied: false` and `not_applied_because: "edit-protection-refused-scope-growth-filed"`, and holds the round that found the refutation until the human answers. This is a third route to the human beyond the two scenario 28 names, forced by the edit protection; widening every slice's `files:` to cover finished files is the human's call (parent index, "What the planner found on disk").
3. **`tokens_used: null` in the agent's response template stays, and the departure from the schema is stated in the file (agent round 1).** The machine schema `.ctoc/architecture/dispatch-schema.yaml` line 134 requires an integer, but no agent can measure its own token count, so any integer would be invented. The re-validation offered two options; the second was taken: keep the template and say openly, in the "Output Format" paragraph, that the schema rejects it and why. This matches the finished sibling `agents/ai-quality/ai-code-quality-reviewer.md`, which ships the same `null`. The schema file is not touched; whether it should allow `null` is an item for the human, already on the list as `h-s3-agent-r1-tokens-used-null-versus-dispatch-schema` in `.ctoc/audit/agent-and-skill-improvement/for-the-human.json`.
4. **Two record encodings forced by the record check (agent round 1).** The check accepts only `applied`, `rejected` or `reported-to-human` as a finding's decision and requires an identifier on every dispatch. So the skill's cross-file findings from the agent's round are recorded with decision `rejected` and a reason that begins "Cross-file:" and says they are applied in the skill's own rounds in this slice; and the session's live run of the recipes, which had no dispatch, is recorded as a source (the note `.ctoc/audit/improvement-run-notes/s4-agent-round1-recipes-run-live-by-the-session.md`) and as evidence, not as a dispatch. The validator's counts before the edit map "refuted" to `FABRICATED`; the one "stale" verdict counts in `examined` only, because the record has no stale field. One mapping for a validator's "mismatch" (a claim that disagrees with another repository file rather than with a web source) is used in every round: it counts in `examined` only, never as misattributed (the Step 11 review, item 10); the skill's round 3 `validator_final` was corrected to match.
5. **Language versions named in the agent file's changed example blocks (scenario 20).** The dispatcher's documented choice: name the versions the parent plan sets in its criterion 4 (JavaScript or TypeScript; Python 3.12 and later), and for Rust, which is outside the seven, the Rust Reference, each as one comment line opening the changed block and stating the check. Two words were adjusted so the lines stay true: the TypeScript line says "documentation or its registry answer" (two of its claims rest on registry answers), and the Python line does not name requests, which is not in that block. Recorded as finding f-s4-agent-r3-25; round 3's `fingerprint_after` holds the fingerprint after the version lines, the end of round 3 (`c23cd371…`); the late corrections after it are recorded separately.
6. **A renamed library stays LOW where the registry's recipe prints no maintainers (skill round 3, and the wrapper's `renamed_package` row).** The round-3 rule triages a renamed library as LOW only when the registry answer shows the well-known project's maintainers, because an abandoned name can be re-registered (the Cybersecurity and Infrastructure Security Agency's and MITRE ATT&CK's page for technique T1195.001). Only the wrapper's npm recipe prints maintainers, so applied strictly no renamed library on PyPI, crates.io or Maven Central could ever be LOW. The dispatcher's documented choice: where the recipe prints no maintainers, the LOW tier stays and the limitations say "maintainers not read"; where it does (npm), a maintainer mismatch makes the name a suspected look-alike. Put to the human as `h-s4-skill-r3-renamed-low-without-maintainers`, with the strict rule as the other option.
7. **Language versions named in the skill's changed example blocks (scenario 20).** The same choice as decision 5 for the wrapper: one version-and-check line opens each changed block that lacked one, naming the version the parent plan's criterion 4 sets (JavaScript or TypeScript; Python 3.12 and later; C# / .NET 9; Java 21 and later, beside Jackson 2.18), PostgreSQL 18 for SQL, and no version for Go and Rust, which are outside the seven. Each line names only checks the round notes record; the Python line names Django's documentation (its source was never read) and carries no parse claim, because the skill's Python block has no decorated example. Recorded as finding f-s4-skill-r3-24; the skill's round 3 `fingerprint_after` holds the skill's latest fingerprint and is updated with each later change recorded under round 3.
8. **The reviewer skill's `react-codeshift` wording is a lead, not a refutation (skill round 3).** The finished `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` line 184 calls `react-codeshift` "a defensive placeholder"; its own line 176 already says an Aikido researcher registered the name, which is what the raw registry answer shows. Beside this skill's round-3 wording it is imprecise, not false, so decision 2's hold does not apply: the round stays complete, with no `held` marker, and no late-correction entry is written. The filed scope-growth request, inbox question `1790801303564-1rhgy4`, stands as the human's route to widen scope if they want the wording aligned; `for-the-human.json` carries it as `h-s4-skill-r3-reviewer-react-codeshift-wording`, and the round records it as finding f-s4-skill-r3-25 (reported to the human).
9. **Where the Step 11 and Step 13 findings are recorded.** The record has no slot for a finding from a build step's review. Both reviews ran while the skill's round 3 was the open round, so every fix is recorded as a finding of the skill's round 3, naming the file it changes and the dispatch that found it (`d-s4-step13-secure`, `d-s4-step11-review`). The wrapper has finished its three rounds, so its changes are recorded as one late correction, `lc-s4-agent-5`, once the validator has re-read them and the end-of-slice `npm test` has run on the final bytes, the two things that entry's shape requires.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — no new test, by decision 1: the slice changes instruction files only and the parent forbids new tests here; the specification is the per-file criteria and the record check. Baseline, before any change: 40 test files, 959 passed, 0 failed, 0 skipped (Execution Record, "Baseline").
- [x] Test error conditions — covered by the existing record check, whose fixtures reject each named defect; no new test (decision 1).
- [x] Run tests - expect RED (failing) — not applicable: with no new test there is no red run; the baseline ran green, which by itself proves nothing (decision 1).

### Step 9: PREPARE
- [x] Install dependencies if needed — none needed.
- [x] Check prerequisites — both files fingerprinted and matched to the session's values; the inventory's `tests_reading` read; every named fence present on disk.
- [x] Verify dev environment ready — the baseline ran green.
- [x] Create directories/config if needed — the skill's record directory was created when its first round was written.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — three rounds on the wrapper and three on the skill, each applied from the validated change list, with five late corrections to the wrapper, lc-s4-agent-1 to lc-s4-agent-5 (Execution Record).
- [x] Add error handling — not program code; the recipes' own failure handling (COULD NOT LOOK, the character check) was run by the session in bash and zsh.
- [x] Wire up integration points — no module, export or file added; the wrapper still names its skill by path, and the dispatch-resolution, skill-loading and reachability fences pass.

### Step 11: REVIEW
- [x] Self-review all new code — Step 11 ran twice (`d-s4-step11-review`, `d-s4-step11-review-2`, `iron-loop-critic`), each a kickback to Step 10; every finding of the second review is applied (the second return and its leftovers).
- [x] Verify integration points work together — the contradictions the two reviews found between the files are fixed; the narrow re-read confirms the two files agree on the placeholder label, the exit-status rule, the `created` caveat and the renamed-package rule.
- [x] Check error handling completeness — every recipe prints COULD NOT LOOK on a failed or unreadable answer; the exit-status and DOWNLOADS rules are stated in both files.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — not applicable: no program code changed; redundant or unsourced passages (the old output templates, "Prevention Tips") were removed in the rounds.
- [x] Optimize critical paths — not applicable: no program code changed.
- [x] Simplify complex code — not applicable: no program code changed.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — Step 13 ran twice (`d-s4-step13-secure` returned the verdict "block", `d-s4-step13-secure-2` the verdict "WARN", `security-scanner`); the second scan reproduced the High and every Medium fix, and its new Low and Info findings are applied. Its WARN rests on a project-level gap it names: "The verdict is WARN rather than PASS because there is still no analyzer evidence for this run. No secrets detector, static analysis or dependency checker ran, and there is no `.security/baseline.sarif` or `.ctoc/security-policy.yaml`."
- [x] Sanitize outputs — values printed through `JSON.stringify`, the Unicode separator limit stated, an unparseable answer never echoed.
- [x] No secrets in code — no key shapes in the six files (the final review's exact-text search, d-s4-step16-final-review, for common token prefixes and private-key headers found none; no secrets detector ran, as the second security review states); the gate's step 3 runs with no secrets and no cache or artifact a later job restores.
- [x] Safe file operations — the temporary file is removed on exit and on hang-up, interrupt and termination signals.

### Step 14: VERIFY
- [x] Run lint + type check — `npm run lint` exit 0 (eslint, zero warnings allowed); `npm run typecheck` 1 passed, 0 failed.
- [x] Run ALL tests (TDD Green) — the end-of-slice `npm test` on the final bytes (agent `432f165a…`, skill `e259dc1a…`, hashed by the session immediately before; `.ctoc/audit/improvement-run-notes/s4-npm-test-final.md`): exit 0, 12,035 passed, 0 failed, 0 skipped, 0 todo; `[CTOC test-gate] PASS`; offline claims ledger PASS.
- [x] Check coverage >= 80% — `[CTOC test-gate] coverage 99.9% (threshold 99%)`, the floor read from `.ctoc/coverage-baseline.json`, on the same run.
- [x] 0 skipped, 0 flaky tests — 0 skipped on the same run; five full runs today, all passing with the same 12,035 tests, show no flakiness but cannot prove its absence.

### Step 15: DOCUMENT
- [x] Update relevant documentation — the two instruction files are the documentation this slice changes; their records are the evidence.
- [x] Add JSDoc comments to new functions — not applicable: no function added.
- [x] Update CHANGELOG if needed — not applicable: the repository has no changelog file; the commit message carries the version, as the previous slice's did.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — the final review (d-s4-step16-final-review, then -2) checked every ticked box against the trail; the return to Step 15 corrected the record only.
- [x] All quality checks passed — full test run on the final bytes: `s4-npm-test-4.out`, 12,035 passed, 0 failed, 0 skipped, coverage 99.9% against 99, test gate PASS.
- [x] Manual verification if needed — the session ran the three recipes live on wrapper beb08c7f… in bash and zsh, with the no-network and line-break cases (s4-agent-round3-session-runs.md, "Session runs after the Step 10 return"), and again on wrapper 542d05fe…, whose recipe code the final wrapper keeps (the narrow re-read's leftovers changed prose only), with the offline and termination-signal cases (same note, 23:26 CEST); the crafted-answer runs are the executor's (Step 10 return).
- [x] Ready for human review — Steps 8–16 complete; kickbacks: 2 to Step 10, 1 to Step 15, 1 refused completion (the validator read an unquoted mention of a past verdict as a blocked step; corrected by quoting it), 4 in total against the limit of 5.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### Baseline (before any change), 2026-09-30

Fingerprints read from the files' bytes before any change:

- `agents/ai-quality/hallucination-detector.md` — `sha256:cd62423dd93648eebe87823f22ac0614f8e6ae421e88360b42e53c5d42b9185c`
- `skills/ai-quality/hallucination-detector/SKILL.md` — `sha256:e1472d75e7ebcbcfb1f0a69340601ce698cc506b609392d454772ec7d6290f11`

Tests run: the union of the inventory's measured `tests_reading` for both files (25 for the agent, 18 for the skill), every fence this plan names under "Contracts and fences that must stay green" (all present on disk), and the record check — 40 distinct test files. Command, run from the repository root:

`node --test tests/agent-and-skill-improvement-record.test.js tests/agent-contract-load.test.js tests/agent-dispatch-resolution.test.js tests/agent-honest-status-fence.test.js tests/agent-layer-reachability.test.js tests/agent-model-floor.test.js tests/agent-modernization.test.js tests/agent-resolver.test.js tests/agent-shared-not-dispatchable.test.js tests/agent-slots.test.js tests/architecture-invariants.test.js tests/claim-census.test.js tests/claim-ledger-gate.test.js tests/compliance-claims-match-code.test.js tests/compliance-seam-is-executable.test.js tests/corpus-audit-ledger.test.js tests/critic-warnings-are-critical.test.js tests/cto-chief-toplevel.test.js tests/cu5-wrapper-coverage-completeness.test.js tests/export-reachability.test.js tests/gate-numbers-fence.test.js tests/instruction-surfaces-say-the-moment.test.js tests/iron-loop-enforcer.test.js tests/no-model-optimized-for.test.js tests/no-tier-3.test.js tests/plugin-skill-discovery.test.js tests/reachability-surface-scan-is-linear.test.js tests/reachability.test.js tests/readme-numbers.test.js tests/refinement-loop-claims-match-code.test.js tests/registry-integrity.test.js tests/session-start-hook.test.js tests/session-start-question-dispatch.test.js tests/skill-loading.test.js tests/streaming-render.test.js tests/test-gate-ledger-wiring.test.js tests/tier1-no-peer-dispatch.test.js tests/unexecutable-instruction-fence.test.js tests/w10-live-agent-reconcile.test.js tests/watcher-shape.test.js`

Result: exit 0; 959 tests, 127 suites, 959 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; no runtime warning printed. This is the suite only — `node --test` does not enforce the coverage floor or the zero-skipped gate; `npm test` at the end of the slice does.

Per decision 1, these tests being green before any change is expected and proves nothing about the rounds; it only establishes that the fences start green, so a later red is attributable to this slice's edits.

### Discrepancy with the approved text

The "Wiring" paragraph says the skill "is loaded when a request matches its `when_to_load` phrases, through the skill directories the plugin declares." That is out of date: since this plan was written the plugin manifest lists only `./skills/` and no specialist skill registers as a slash entry, and no agent holds the Skill tool — the wrapper agent reaches its skill by reading the file at its repository path. The approved text is left unedited; the claim is not written into either instruction file.

### Agent file, round 1, 2026-09-30

- Fingerprint before: `sha256:cd62423dd93648eebe87823f22ac0614f8e6ae421e88360b42e53c5d42b9185c`, confirmed before applying.
- Applied the final change list `.ctoc/audit/improvement-run-notes/s4-agent-round1-critic-final-d-s4-agent-r1-critic.md` exactly: 19 lettered changes, A to S (the list's own header says 22). Every `old` matched exactly once and none overlapped; only `description` changed in the frontmatter. Fingerprint after that: `sha256:c399cc8762a83fa1f9abd40364f0abc6252b11d5ace8b2cc91ddbc1b53a8a6b0`.
- Applied the three leftovers of the re-validation (`d-s4-agent-r1-revalidate`) with the validator's own wording: the unsourced "stricter than any registry's" sentence, the out-of-date scoped-name sentence, and the stated `tokens_used` departure (decision 3). Fingerprint after: `sha256:412d36530695efbf8ce48ff0f9161c5e21047fcfe0553e488bf087027e2aa3ea`. The validator has not re-read the file after these three.
- Fences: the 34 files that read the agent (inventory `tests_reading` plus the plan's agent-layer fences), run with `node --test`, after each of the two edits: 755 tests, 755 passed, 0 failed, 0 skipped, both times. The record check: 16 tests, 16 passed, 0 failed, 0 skipped.
- Exact-text check of the refuted claims across `agents/` and `skills/`: `email-validator-pro` is in this agent and the paired skill only (the skill is in this slice and not started; recorded as a cross-file finding). "needs a compiler", "flags as experimental", "Usually not a real option" and "ESM in every case" appear nowhere now.
- Record written last: `.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/hallucination-detector.md.json` (34 findings, 60 sources, 9 queries, 35 fences), and four entries added to `for-the-human.json`.

### Agent file, round 2, 2026-09-30

- Fingerprint before: `sha256:412d36530695efbf8ce48ff0f9161c5e21047fcfe0553e488bf087027e2aa3ea`, confirmed before applying.
- Applied all 21 changes of `.ctoc/audit/improvement-run-notes/s4-agent-round2-critic-d-s4-agent-r2-critic.md` (1, 2, 3a–3d, 4a–4c, 5, 6a–6c, 7a, 7b, 8a, 8b, 10, 11, 13, 14), each `old` matching exactly once with no overlap, with the validator's corrections written inside the new text: the Open Source Security Foundation sentence replaced with the guide's own words (curly quotation marks around slopsquatting, as the session confirmed at the source), the POSIX quotation completed, the Rust quotation given its condition, and the optional "citing earlier work". Fingerprint after: `sha256:b3cc2cba979b2f2f301656f29404333ac98399beed5196b7ecee1db380c4a479`.
- The three detection patterns in the file are character for character the ones the session ran (`s4-agent-round2-session-runs.md`); the session also parsed the Python example and ran the recipes with changes 3a–3d before applying.
- Applied the re-validation's one leftover (`d-s4-agent-r2-revalidate`): "The published version adds:" became "The paper also says:", and "(page 3688)." became "(USENIX version, page 3688; the preprint carries the same sentence).". Fingerprint after: `sha256:3cc6e9d7398cf1ddfb863d0364acea4c7146981791c7456c1305362b4588f27b`. The validator has not re-read the file after this one edit.
- Fences: the same 34 files, after each of the two edits: 755 tests, 755 passed, 0 failed, 0 skipped. Record check: 16 of 16 passed, 0 skipped.
- Record written last: round 2 appended to `.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/hallucination-detector.md.json` (26 findings, 34 sources, 10 queries, 35 fences); one entry added to `for-the-human.json` (a private-registry recipe and credentials). The provenance check is carried to round 3, recorded as not applied with that reason.

### Agent file, round 3, 2026-09-30

- Fingerprint before: `sha256:3cc6e9d7398cf1ddfb863d0364acea4c7146981791c7456c1305362b4588f27b`, confirmed before applying.
- Applied all 21 changes of `.ctoc/audit/improvement-run-notes/s4-agent-round3-critic-d-s4-agent-r3-critic.md` (1, 2a, 2b, 3, 4a–4c, 5, 6a–6d, 7a, 7b, 8a, 8b, 9, 10, 11, 12, 13), each `old` matching exactly once with no overlap, with the validator's corrections inside the new text: change 12 replaced by the validator's full Rust quotation; "AI-assisted development" spelled out in 2a, 8b and 9; "Tenable's initial analysis found that"; the Open Worldwide Application Security Project entry named "A03:2025 Software Supply Chain Failures"; and the optional change 11 wording (the handler's result is returned unless it is `undefined`; `vfsState` is defined in `lib/internal/fs/utils.js` and set by `setVfsHandlers(handlers)`). Fingerprint after: `sha256:f8f1b1247e78b23011f1f1805bb47f4d8941c12578e07668c49e16f6efdb013c`. The recipe code is the critique's blocks byte for byte, which the session ran before applying and again as they stand in the file.
- Applied the re-validation's two optional wording fixes (`d-s4-agent-r3-revalidate`, no correction required): "an AI reaches for" became "an artificial-intelligence model reaches for", and "the French Cybersecurity Agency" became "France's Cybersecurity Agency". The `description` line was not touched. Final fingerprint: `sha256:49d7bf2207dc30e174b33823bcfda01934e75cc81ee18fe77b56bb7f5cd857a4`.
- Fences: the same 34 files after each edit: 755 tests, 755 passed, 0 failed, 0 skipped. Record check: 16 of 16 passed, 0 skipped.
- Record written last: round 3 appended (24 findings, 35 sources, 9 queries, 35 fences); one entry added to `for-the-human.json` (provenance is read, never verified). Three source addresses I first wrote from memory (CISA's roadmap, the National Cyber Security Centre blog and its PDF) were corrected to the addresses the research note records before the record check ran; the PDF's full address is not in the note and the record says so. Every web address in the three round entries was then checked to appear verbatim in the round notes.

### Per-file acceptance criteria, agent file (after round 3)

- [x] 1. All three round entries exist and are complete; the record check passes (16 of 16).
- [x] 2. Every changed or added citation-shaped claim has a VALIDATED verdict and carries its source and read date: the Step 10 text was re-read twice (`d-s4-post-kickback-revalidate`, whose refuted and misattributed claims were all corrected, and `d-s4-post-kickback-revalidate-2`: for the wrapper, 19 claims, 18 validated, 1 not a citation, 0 refuted, 0 misattributed). The version lines and the `suspected_lookalike` route were in the first of those re-reads. The last two wrapper leftovers are the validator's own wording and were not re-read after they were applied.
- [x] 3. Every changed passage traces to a finding in the record (rounds 1–3, each change lettered or numbered to its finding).
- [x] 4. Frontmatter: 12 lines, counting both `---` markers; the file starts at its first byte with `---`, and only `description` differs from the committed file; its first sentence and all eight dispatch phrases are byte-identical. The agent has no `when_to_load`.
- [x] 5. No order exceeds `tools: Read, Grep, Bash`: the orders are reading, Grep searches, and Bash for `curl`, `node -e` over a downloaded answer, `mktemp`/`rm` of the recipe's own temporary file, and `date`; the unexecutable-instruction fence passes.
- [x] 6. The honest-status reference is present.
- [x] 7. No gate number in the body; the gate-number and say-the-moment fences pass; no new or changed passage adds an invented abbreviation. Noted, not changed: the headings "Wrong API Usage" and "3. API Signature Verification" keep "API" from the original file, and the recipes' printed markers (REGISTERED, HELD BY NPM, COULD NOT LOOK, NOT CHECKED) are command output the file explains in words.
- [x] 8. Each round states the seven-language result and how each changed example was checked; the run-checked examples name their versions in the record (node v24.14.1; Python 3.9.6; GNU bash 3.2.57 and zsh 5.9 with curl 8.7.1, on macOS 26.6.1); every changed example block in the seven required languages opens with a version and check line (decision 5; findings f-s4-agent-r3-25 and f-s4-agent-r3-26): the three TypeScript blocks name TypeScript / JavaScript (the "Wrong API Usage" line says "documentation or its source code", since its moment and fs claims were checked against source files) and the Python block names Python 3.12 and later. The Rust block carries a check line but no version: Rust is outside the seven languages the parent plan's criterion 4 requires, the example is a single `use` path checked against the Rust Reference and a live crates.io answer, and no one read which edition the Reference documents, so naming one would be a claim nobody checked. Fingerprint after the version lines, the end of round 3: `sha256:c23cd371b1c99f00ad927ef9ee7f24d97ea43fee799b502fc53dbf41987dafc9`; later changes are the late corrections and the Step 10 return; fences 755 of 755, record check 16 of 16.
- [x] 9. The paired skill now states the same facts: each of the wrapper's three rounds and the skill's three rounds records the paired file as compared, and the skill's round re-reads found the wrapper's changed passages consistent (rounds 1–3), with five late corrections keeping the wrapper in step. Each file defers to the sibling that owns a topic (dependency-checker, dependency-auditor, ai-code-quality-reviewer). One overlap stays with the human: dependency-auditor's description still claims typosquats (`h-s4-agent-r1-lookalike-overlap-with-dependency-auditor`). The Step 11 review found four contradictions (its items 3, 5, 8 and 17); all are fixed in the Step 10 return, and the second review (d-s4-step11-review-2) found each resolved.
- [x] 10. Rounds 2 and 3 findings are new or marked as corrections of earlier rounds (round 2: four; round 3: seven); no closed finding repeats.
- [x] 11. The fences that read the file pass (755 of 755, 0 skipped, after its last change), and the end-of-slice `npm test` on the final bytes (agent `432f165a…`, skill `e259dc1a…`, hashed by the session immediately before; `.ctoc/audit/improvement-run-notes/s4-npm-test-final.md`) passed.
- [x] 12. No finished file makes a statement these rounds refuted: an exact-text check across `agents/` and `skills/` finds the refuted texts only in the paired skill, which is in this slice and not started, so there is no late correction.

### Skill file, round 1, 2026-09-30 (applied; record not yet written)

- Fingerprint before: `sha256:e1472d75e7ebcbcfb1f0a69340601ce698cc506b609392d454772ec7d6290f11`, confirmed before applying (the dispatch message quoted it with one character missing; the file matched the baseline value).
- Applied all 37 changes of `.ctoc/audit/improvement-run-notes/s4-skill-round1-critic-final-d-s4-skill-r1-critic.md` (1a–1h, 2a–2d, 3a–3d, 4, 5a, 5b, 6a–6d, 7, 8, 9a, 9b, 10, 11, 12a–12d, 13, 15, 16, 17), each `old` matching exactly once with no overlap. Frontmatter: only `when_to_load` changed, gaining "package hallucination" and "library hallucination"; `type: skill` kept; no `allowed-tools:`. The five strings `tests/critic-warnings-are-critical.test.js` pins are present. Fingerprint after: `sha256:5c656e53cc24c0d3d7bce57dce5e1f10058c70a89ce2a6c52335e8f16f586344`.
- Skill fences: 23 files (the inventory's 18 `tests_reading` plus the plan's skill fences, `tests/critic-warnings-are-critical.test.js` and the record check), `node --test`: 791 tests, 791 passed, 0 failed, 0 skipped.
- Agent file, correction triggered by this round (the critique's cross-file item 1): "Read the method first" item 2 replaced exactly. Fingerprint before `sha256:c23cd371b1c99f00ad927ef9ee7f24d97ea43fee799b502fc53dbf41987dafc9`, after `sha256:cced22322c9b3b16b11295de9c920fb0a0dd72976f902aea09c3a5c908796018`. Agent fences (34 files): 755 passed, 0 failed, 0 skipped.
- Not yet recorded: the agent has finished its three rounds, so under the parent's scenario 28 this is a late correction entry in the agent's record (`late_corrections`) and in `late-corrections.json`, written before the skill's round 1 record. The entry's shape requires the full gate's result (`npm test`) and the citation validator's verdict on the corrected text; neither exists yet.

### Skill file, round 1, completed 2026-09-30

- Re-validation (`d-s4-skill-r1-revalidate`): 145 claims, 127 validated, 8 needing a wording correction, 10 not checked, 0 fabricated; the wrapper's new item 2 consistent. Applied its leftovers in its own wording: line 56 (Veracode, with its address; the stale "5–22%" rate removed), line 57 (the wrapper's MEDIUM cases), line 261 ("five layers"), lines 266 and 267 (the GitHub Advisory Database, slopcheck and DepScope rows), line 269, line 318 (`throwOnError`), line 374 and lines 271 and 294 (npm documentation version 12), line 52 (Rekor, now cited), and line 43 stripped (no primary source). Took the optional addition to the wrapper's item 2 ("and a database query for Postgres extensions").
- Final skill fingerprint: `sha256:7176fa669d40e784777d9d8054bbc8d33f1dc07cfd8ac84b2367c85551f181dd`. Final wrapper fingerprint: `sha256:64b625c40f6f3714682697be7d2bdfc1a887640fd1fc6dd5e6e2dc6132a6a898`.
- Fences after the leftovers: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped.
- Full gate for the late correction: `npm test` exit 0, 12,035 tests passed, 0 failed, 0 skipped; coverage 99.9% against the floor of 99; offline claims ledger PASS; output `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/s4-npm-test-1.out`. It ran on the wrapper as late-corrected (`cced22322c9b…`) and the skill before its leftovers (`5c656e53cc24…`); the leftovers and the optional addition since then have been checked by the fences only, and the end-of-slice `npm test` covers them.
- Written in order: (a) the wrapper's late correction `lc-s4-agent-1` in its record's `late_corrections` and in `late-corrections.json` with `path`; (b) the skill's round 1 record (31 findings, 50 sources, 14 queries, 23 fences), and one entry for the human, `h-s4-skill-r1-ci-gate-scope`. Record check: 16 of 16 passed, 0 skipped. Every web address in the record and in its findings' evidence appears verbatim in the round notes.
- Validator counts before the edit record the two research passes (82 verdicts: 54 validated, 11 refuted, 6 unsourceable, 5 misattributed, 6 stale counted in `examined` only); the pre-apply validation's 77 statements are in finding f-s4-skill-r1-18. Counts after record the re-read as reported (145 examined, 127 validated, 4 misattributed among the 8 corrected; the other 4 corrections are inconsistencies the record has no field for).

### Skill file, round 2, 2026-09-30 (applied; records not yet written)

- Fingerprints before: skill `sha256:7176fa669d40e784777d9d8054bbc8d33f1dc07cfd8ac84b2367c85551f181dd`, wrapper `sha256:64b625c40f6f3714682697be7d2bdfc1a887640fd1fc6dd5e6e2dc6132a6a898`. After: skill `sha256:29dd7aaeb7dff6a39941ca9125962b736fdcc2b869073b9c81bedcfe2b2339d2`, wrapper `sha256:acddbc765e22a817d6875237f149013ca3cf70386253a59e9a1b3c2409090c24`.
- Applied all 18 changes of `.ctoc/audit/improvement-run-notes/s4-skill-round2-critic-d-s4-skill-r2-critic.md` with the validator's corrections (`d-s4-skill-r2-validate`) inside the new text, and the critique's two cross-file late corrections to the wrapper (item 2 names ConanCenter and vcpkg; the partial-stub-package exception on the HIGH rule).
- Fences: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped.
- Full gate after the fences: `npm test` exit 0, 12,035 passed, 0 failed, 0 skipped; coverage 99.89% against the floor of 99; offline claims ledger PASS; no Node.js runtime, deprecation or experimental warning. Output: `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/s4-npm-test-2.out`.

### Skill file, round 2, completed 2026-09-30

- Re-validation (`d-s4-skill-r2-revalidate`): 172 claims, 169 validated, 1 mismatch, 2 not checked, 0 fabricated; the wrapper's two new passages consistent; protected items byte-identical. Applied in its wording: the health row now "Health signals" with the deps.dev and Dependency-Track descriptions; the bcrypt comment's unsourced model-behaviour clause stripped; in the wrapper, the confidence table's HIGH row carries the partial-stub exception and the Export Verification bullet says such a module "is not a finding: record it under `self_assessment.unknowns` (…)".
- Final fingerprints: skill `sha256:9d56e48e41da44b77c849bda44960f8ce326b549363adc030e7d66e378aad179`; wrapper `sha256:5c8aa8e7a79266441e2b2421a5864effa0680899dd6310a6f9342ed54605f3ac`.
- Fences after the leftovers: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped.
- Written in order: (a) the wrapper's late corrections `lc-s4-agent-2` (item 2 names ConanCenter and vcpkg) and `lc-s4-agent-3` (the partial-stub exception, bullet and table row) in its record's `late_corrections` and in `late-corrections.json`, each with the second full gate (`npm test`: 12,035 passed, 0 failed, 0 skipped, 99.89% against 99, ledger PASS; `scratchpad/s4-npm-test-2.out`) and the verdict "consistent"; their "before" texts were checked against the round-1 change documents and the first late correction. (b) The skill's round 2 record (21 findings, 41 sources, 1 query, 23 fences). Record check: 16 of 16 passed, 0 skipped. Every web address in the round appears verbatim in the notes.
- The second full gate ran before the re-validation's two follow-up edits to `lc-s4-agent-3` and the skill's two leftovers; those have passed the fences only. The end-of-slice `npm test` covers them.

### Skill file, round 3, 2026-09-30 (applied; records not yet written)

- Fingerprints before: skill `sha256:9d56e48e41da44b77c849bda44960f8ce326b549363adc030e7d66e378aad179`, wrapper `sha256:5c8aa8e7a79266441e2b2421a5864effa0680899dd6310a6f9342ed54605f3ac`. After: skill `sha256:640fc0fbc0fe35984966cd44f203fcb261eb163f76ccaccda8ee4183b147cee5`, wrapper `sha256:5ff6bdc6ae760540ead98452b9dc359b5427b7b90d2ee2029679e7bd5994d5a8`.
- Applied all 20 changes of `.ctoc/audit/improvement-run-notes/s4-skill-round3-critic-d-s4-skill-r3-critic.md` with the validator's corrections (`d-s4-skill-r3-validate`) inside the new text, and decision 6 in change 8b; the wrapper's `renamed_package` row late-corrected with the same scoping. Frontmatter unchanged this round; the five pinned strings present.
- Fences: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped. Record check 16 of 16 after adding `h-s4-skill-r3-renamed-low-without-maintainers`.

### Skill file, round 3, completed 2026-09-30, and the end of the slice

- Re-validation (`d-s4-skill-r3-revalidate`): 217 claims, 216 validated, 1 mismatch (the scope rule), 0 fabricated; the wrapper's changed row well-formed and consistent. Applied: the scope rule now reads "one the repository already uses" (the wrapper's scope); the wrapper's `suspected_lookalike` row lists the new route ("or a renamed name whose npm maintainers differ from the well-known project's").
- Final fingerprints: skill `sha256:c944d0ae3ee1ca10519323802bd013ca67e56c81698155b84b5776908b72fd7d`; wrapper `sha256:9a4a4f6d8ef26e133b1168895691d4bac56c6e92c8ffbbb3d774854d27f7e422`.
- Fences after the last edit: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped.
- Written: the skill's round 3 record (23 findings, 28 sources, 4 queries, 23 fences; every web address appears verbatim in the notes); then, after the end-of-slice gate, the wrapper's late correction `lc-s4-agent-4` (the `suspected_lookalike` and `renamed_package` rows) in its record and in `late-corrections.json`. Record check: 16 of 16.
- End-of-slice gate: the first end-of-slice `npm test` (exit 0, 12,035 passed, 0 failed, 0 skipped, coverage 99.89% against 99, ledger PASS; `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/s4-npm-test-3.out`) ran on skill `c944d0ae…` and wrapper `9a4a4f6d…`, before later edits. The covering run is the end-of-slice `npm test` on the final bytes (agent `432f165a…`, skill `e259dc1a…`, hashed by the session immediately before; `.ctoc/audit/improvement-run-notes/s4-npm-test-final.md`): exit 0, 12,035 passed, 0 failed, 0 skipped, coverage 99.9% against 99, offline claims ledger PASS, `[CTOC test-gate] PASS`. `npm run lint` exit 0 and `npm run typecheck` 1 passed were run earlier, on files this slice's later edits did not touch.

### Per-file acceptance criteria, skill file (after round 3)

- [x] 1. All three round entries exist and are complete; the record check passes (16 of 16).
- [x] 2. Every changed or added citation-shaped claim has a VALIDATED verdict and carries its source and read date: the Step 10 text was re-read twice (`d-s4-post-kickback-revalidate`: 20 skill claims, whose 3 refuted and 1 misattributed were corrected; `d-s4-post-kickback-revalidate-2`: 9 skill claims, 7 validated, 2 not citations, 0 refuted). The version lines were in the first re-read. The scope-rule wording and the last two leftovers are the validator's own wording and were not re-read after they were applied; `not_reverified` names the two claims the first re-read left unchecked.
- [x] 3. Every changed passage traces to a finding in the record (rounds 1–3).
- [x] 4. Frontmatter starts at the first byte with `---`; against the committed file, only `when_to_load` differs, gaining "package hallucination" and "library hallucination" and losing nothing; `type: skill` kept; no `allowed-tools:`. The trigger corpus still matches (`tests/skill-loading.test.js` passes).
- [x] 5. No order in the body exceeds the file's `tools:` line (Read, Grep, Bash): what it orders is reading, searching, and read-only queries; the install and run commands round 1 removed are gone, and the gate for continuous integration is a pipeline recommendation the wrapper never runs. The unexecutable-instruction fence scans agent files only, so this rests on reading the change lists.
- [x] 6. Not applicable to a skill body (the criterion is for agents); the wrapper still carries the honest-status reference.
- [x] 7. No gate number in text a person reads; no invented abbreviation. The abbreviations the Step 11 review found in passages this slice changed (CVE, API, PDF, AI, AST, GPG, sumdb) are spelled out; abbreviations remain only in unchanged prose and inside protected items that must stay byte-identical; "ATT&CK" is part of a proper name.
- [x] 8. The record states the seven-language result each round and how each changed example was checked (C++ compiled; C against manual pages and the export list; Java against source; the rest against registry answers, source files and official documentation), and every changed example block now names its language version in the file (decision 7; finding f-s4-skill-r3-24): TypeScript / JavaScript, Python 3.12 and later, C# / .NET 9, Java 21 and later with Jackson 2.18, SQL / PostgreSQL 18, C17 with OpenSSL 3.0 or later (its declarations compiled at -std=c17 against stand-in types, finding f-s4-skill-r3-49), and C++23. Go and Rust carry a check line and no version, being outside the seven. Fingerprint after the version lines: `sha256:b6742d867f5ff8759327596be6c4bd915d163737d052b6871097c501d805b1f9`; final skill fingerprint `sha256:e259dc1af2a4f9fb6e0e084646467f619abfbcaea7dd8071bc9ada339f9ca794`; fences 791 of 791.
- [x] 9. The paired wrapper states the same facts: every round records it as compared, and the re-reads found its changed passages consistent. Each file defers to the sibling that owns a topic. dependency-auditor's typosquat overlap stays with the human. The Step 11 review's items 3, 5, 8 and 17 are fixed in the Step 10 return, and the second review (d-s4-step11-review-2) found each resolved.
- [x] 10. Rounds 2 and 3 findings are new or marked as corrections (round 2: finding 4; round 3: finding 5); standing items for the human point to their open entries; no closed finding repeats.
- [x] 11. The fences that read the file pass (791 of 791, 0 skipped, after its last change), and the end-of-slice `npm test` on the final bytes (agent `432f165a…`, skill `e259dc1a…`, hashed by the session immediately before; `.ctoc/audit/improvement-run-notes/s4-npm-test-final.md`) passed.
- [x] 12. No finished file makes a statement these rounds refuted: an exact-text check of the refuted texts across `agents/` and `skills/` found none outside this slice's two files. One lead, not a refutation: the finished `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` line 184 says `react-codeshift` "resolves on npm only to a defensive placeholder"; round 3 found it is a third party's registration that describes itself that way. It is outside this slice's files, so it is reported, not edited.

### Closing items, 2026-09-30

- Criterion 8 for the skill: version-and-check lines added to the six changed blocks that lacked one, and "Java 21 and later" beside Jackson 2.18 (decision 7; finding f-s4-skill-r3-24). Final skill fingerprint `sha256:b6742d867f5ff8759327596be6c4bd915d163737d052b6871097c501d805b1f9`; skill fences 791 of 791, 0 skipped; record check 16 of 16; round 3's `fingerprint_after` updated. This edit came after the end-of-slice `npm test` (which ran on `c944d0ae…`); it adds comment lines inside code blocks only, and the skill's fences, the tests that read the file, passed after it.
- The criterion-12 lead (the finished reviewer skill, `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` line 184, calling `react-codeshift` "a defensive placeholder") filed through the scope-growth door (decision 8 records that no late correction is owed): inbox question `1790801303564-1rhgy4` (`.ctoc/inbox/questions/1790801303564-1rhgy4.md`), all seven fields, `forced_by_declared: true`; the continuation fork is registered. The reviewer skill was not edited.
- The lead is recorded as a lead, not a refutation (decision 8): finding f-s4-skill-r3-25, the entry for the human `h-s4-skill-r3-reviewer-react-codeshift-wording`, and inbox question `1790801303564-1rhgy4`, whose acceptance criterion is now criterion 9 alone. No late-correction entry is written for it.

### Step 10 return (kickback from Steps 13 and 11), 2026-09-30

- **Kickback.** Step 13 SECURE (`d-s4-step13-secure`, `security-scanner`, `.ctoc/audit/improvement-run-notes/s4-step13-secure-d-s4-step13-secure.md`) returned the verdict "block", and Step 11 REVIEW (`d-s4-step11-review`, `iron-loop-critic`, `.ctoc/audit/improvement-run-notes/s4-step11-review-d-s4-step11-review.md`) kicked back. One return to Step 10 covers both. Circuit breaker: 1 kickback to Step 10, 1 in total for this slice (limits 3 and 5).
- **Fingerprints before:** skill `sha256:b6742d867f5ff8759327596be6c4bd915d163737d052b6871097c501d805b1f9`, wrapper `sha256:9a4a4f6d8ef26e133b1168895691d4bac56c6e92c8ffbbb3d774854d27f7e422`. **After the Step 13 fixes:** skill `sha256:569df04f36001de1d969b0a4f291f2a00dd110358ee9a06917c0b7f098eec427`, wrapper `sha256:5318da566ac2e09708c272de9ee1fac9ae7f68b1063308be89b021961eb97b63`. **After the Step 11 fixes (current):** skill `sha256:52ecdd9020e4506d97ceb7aa94d0c61ec9062d0b7497341ddc610b138826385a`, wrapper `sha256:beb08c7faf2802ab43f7fa1b95421389b1c6f9367e6ef4aee2105554b96b5895`.
- **Step 13 fixes:** High 1 (a)–(e), Medium 1–4, Low 1–4 and 6–8, Info 1 and 2 applied; Low 5 put to the human (`h-s4-step13-names-sent-to-public-registries`); Info 3 already with the human; Info 4 handled by the session; Info 5 found nothing.
- **Step 11 fixes:** items 1–19 applied as the dispatcher directed, with the session's probes for items 3 and 19 and the executor's reads of moment's and date-fns's sources recorded in `s4-agent-round3-session-runs.md`, and the C17 compile for item 14 in `s4-skill-round3-session-runs.md`. Item 7 is added to `h-s4-skill-r3-renamed-low-without-maintainers` with three options.
- **Offline checks by the executor (no registry contacted):** the three recipes pass `bash -n` and `zsh -n`; with the name `x'; echo INJECTED; '$(echo INJECTED2)` every recipe printed "NOT CHECKED: refused by the character check" in bash 3.2.57 and zsh 5.9; with the network pointed at a closed port the npm and PyPI recipes printed COULD NOT LOOK and left no temporary file; the recipes' `node -e` programs on crafted answers printed REGISTERED for a publisher-written "security holding package" with maintainer "attacker", HELD BY NPM only with maintainers exactly `npm`, one escaped line for a version holding a line break, a fixed COULD NOT LOOK line for an HTML error page, and `REGISTERED … publisher_summary="Deprecated, use reqeusts-pro instead"` for PyPI.
- **Fences on the current bytes:** skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped.
- **Recorded:** 27 findings in the skill's round 3 (f-s4-skill-r3-26 to f-s4-skill-r3-52), each naming its dispatch; round 3's `fingerprint_after` and `validator_final` updated (decision 4); `full_gate.covered_by` added to `lc-s4-agent-1` and `lc-s4-agent-3` in the wrapper's record and in `late-corrections.json`; two entries for the human added or extended; the inbox question's acceptance criterion changed to criterion 9 alone. Record check: 16 of 16. Decision 9 says where the findings go.
- **Pending:** re-validation of the new text; the wrapper's late correction `lc-s4-agent-5`; the end-of-slice `npm test` on the final bytes; the re-dispatch of Steps 11 and 13; then Step 16.

### Second return to Step 10 (after the second review, the re-validation and the second security review), 2026-09-30

- **Kickback.** Step 11 REVIEW again (`d-s4-step11-review-2`, `iron-loop-critic`, `.ctoc/audit/improvement-run-notes/s4-step11-review-2-d-s4-step11-review-2.md`): kick back, 11 new findings, all text. The re-validation (`d-s4-post-kickback-revalidate`, `citation-validator`, `.ctoc/audit/improvement-run-notes/s4-post-kickback-revalidate-d-s4-post-kickback-revalidate.md`): 5 findings against the kickback's text, 11 leftovers. Step 13 SECURE again (`d-s4-step13-secure-2`, `security-scanner`, `.ctoc/audit/improvement-run-notes/s4-step13-secure-2-d-s4-step13-secure-2.md`): WARN, the High and every Medium finding fixed and reproduced, 6 new Low or Info findings.
- **Circuit breaker.** This is the second return to Step 10 in this slice: the first came after `d-s4-step11-review` and `d-s4-step13-secure` together, this one after `d-s4-step11-review-2`, `d-s4-post-kickback-revalidate` and `d-s4-step13-secure-2` together. Kickbacks to the same step: 2; in total: 2; the limits (3 and 5) are not reached. The session first counted this as the third return and has corrected its own miscount.
- **The security review's WARN, verbatim:** "The verdict is WARN rather than PASS because there is still no analyzer evidence for this run. No secrets detector, static analysis or dependency checker ran, and there is no `.security/baseline.sarif` or `.ctoc/security-policy.yaml`. The skill's policy says missing evidence warns before a commit and blocks before a release. I applied warn. If CTO Chief treats this as the release check, the same gap turns this into BLOCK." That is a project-level gap, not a finding in these two files. Steps 11 and 13 stay unticked.
- **Applied, once each where the three reports overlap (the dispatcher's picks):** skill line 56 in the security review's wording; the exit-status sentence in the validator's wording (verdict as the first line; DOWNLOADS lines are not verdicts, including after COULD NOT LOOK; DOWNLOADS NOT READ recorded under unknowns); `npm audit` and NODE_ENV; "the recipe's own character check"; the TypeScript version line; the offset wording and moment's native fallback; the `created` caveat in the skill, merged into one sentence, and the `fs` dates in the wrapper from the session's raw curl; the C17 note; the three internal "criterion 4" pointers removed; the held-label line rewritten with the Unicode separator limit; the symbolic-link limit; two source markers; `trap 'exit 1' HUP INT TERM`; no cache or artifact for a later job; "name or version"; the plan and inbox wording. Leads went to the human: PyPI owners and status (`h-s4-post-kickback-pypi-owners-and-status`), the C and C++ owner (`h-s4-post-kickback-c-cpp-owner`), and the read-only Bash sentence added to `h-s4-agent-r1-shell-name-check-is-instruction-only`.
- **Fingerprints:** before, skill `sha256:52ecdd9020e4506d97ceb7aa94d0c61ec9062d0b7497341ddc610b138826385a`, wrapper `sha256:beb08c7faf2802ab43f7fa1b95421389b1c6f9367e6ef4aee2105554b96b5895`; after, skill `sha256:3c13238fb7bd72c10a2eeae5338f90b31c5afb79c97ee2f56a2be02e498c278a`, wrapper `sha256:542d05fe8a342ae74dbe1c3727e82687aa5d36d6d58b097ca708f0e599253c39`.
- **Checks:** both changed recipes pass `bash -n` and `zsh -n`; with the network pointed at a closed port they print COULD NOT LOOK and leave no temporary file in either shell. Fences: skill 23 files, 791 passed, 0 failed, 0 skipped; wrapper 34 files, 755 passed, 0 failed, 0 skipped. Record check: 16 of 16.
- **Recorded:** 21 findings in the skill's round 3 (f-s4-skill-r3-53 to -73), findings 44 and 45 re-kinded as corrections of earlier rounds, `validator_final` from `d-s4-post-kickback-revalidate` (20 skill claims: 16 validated, 3 refuted in the fabricated slot, 1 misattributed, all corrected in this pass) and `not_reverified` naming the two changed claims that re-read did not check.
- **Not written yet:** `lc-s4-agent-5`. Its shape needs a validator verdict on the corrected wrapper text and a `full_gate` result of pass or fail; the wrapper text changed in this pass has not been re-read and the end-of-slice `npm test` has not run. It will name the dispatches `d-s4-step13-secure`, `d-s4-step11-review`, `d-s4-step11-review-2`, `d-s4-post-kickback-revalidate` and `d-s4-step13-secure-2`, and record `full_gate` from that run.
- **Leftovers of the same pass (not a new kickback):** the narrow re-read `d-s4-post-kickback-revalidate-2` (`.ctoc/audit/improvement-run-notes/s4-post-kickback-revalidate-2-d-s4-post-kickback-revalidate-2.md`) examined 28 claims: 25 validated, 3 not citations, 0 refuted, 0 misattributed. Its three wording leftovers are applied: moment's native `toISOString` "when it converts and the year is between 0 and 9999"; "the three declarations are valid C17"; and in both files, exit status 0 "whatever it found (only a signal that stops it gives another status)". Its record lead is settled: finding f-s4-skill-r3-68 names the executor's offline run after the trap change (now recorded in `s4-agent-round3-session-runs.md`) and the session's 23:26 run as corroboration. Fingerprints now: skill `sha256:e259dc1af2a4f9fb6e0e084646467f619abfbcaea7dd8071bc9ada339f9ca794`, wrapper `sha256:432f165a381e9ac2c46a5f8b43be76568317d5646905a6dcc26f1793b94dffae`. Fences: skill 791 of 791, wrapper 755 of 755, 0 skipped. Record check: 16 of 16.
- **Pending:** the end-of-slice `npm test` on these bytes (the session runs it); then `lc-s4-agent-5` with this re-read's counts for the wrapper claims and that run's `full_gate`, and the covering-run path in `lc-s4-agent-1` and `lc-s4-agent-3`; then Step 16.

### End-of-slice gate and the last late correction, 2026-09-30

- The session ran `npm test` on exactly the final bytes (agent `sha256:432f165a381e9ac2c46a5f8b43be76568317d5646905a6dcc26f1793b94dffae`, skill `sha256:e259dc1af2a4f9fb6e0e084646467f619abfbcaea7dd8071bc9ada339f9ca794`, hashed immediately before; the executor confirmed the same fingerprints before writing): exit 0, 12,035 passed, 0 failed, 0 skipped; coverage 99.9% against 99; offline claims ledger PASS. Summary with the verbatim gate lines: `.ctoc/audit/improvement-run-notes/s4-npm-test-final.md`.
- Written: `lc-s4-agent-5` in the wrapper's record and in `late-corrections.json` (found by the skill's round 3; source dispatches `d-s4-step13-secure`, `d-s4-step11-review`, `d-s4-step11-review-2`, `d-s4-post-kickback-revalidate`, `d-s4-step13-secure-2`, `d-s4-post-kickback-revalidate-2`; validator verdict from the last re-read's wrapper counts, 19 examined, 18 validated, 1 not a citation, 0 refuted; `full_gate` pass, covered by that note). `covered_by` for `lc-s4-agent-1` and `lc-s4-agent-3` now names the same run. Step 14's test boxes and criteria 2 and 11 for both files are ticked. Next: Step 16.

- 2026-09-30, return to Step 15 DOCUMENT (the final review, `d-s4-step16-final-review`, `.ctoc/audit/improvement-run-notes/s4-step16-final-review-d-s4-step16-final-review.md`): the record only. The skill's round 3 `validator_final` changed from 20 examined, 16 validated, 3 fabricated, 1 misattributed (the superseded re-read) to 9 examined, 7 validated, 0 fabricated, 0 unsourceable, 0 misattributed (`d-s4-post-kickback-revalidate-2`, the last re-read of the final text), finding f-s4-skill-r3-60 rewritten to match, and seven wording fixes applied to this plan and to one entry for the human. Neither instruction file changed: agent `sha256:432f165a381e9ac2c46a5f8b43be76568317d5646905a6dcc26f1793b94dffae`, skill `sha256:e259dc1af2a4f9fb6e0e084646467f619abfbcaea7dd8071bc9ada339f9ca794` before and after. Circuit breaker: the first return to Step 15, the third kickback in total (limit 5).
- 2026-09-30, completion refused by pre-review validation (`menu task complete t118`, recorded by the circuit breaker as a kickback): "Step 13 marked as BLOCKED without escalation approval." Step 13 is not blocked; two lines of this record mentioned the first security scan's verdict with the bare word "blocked" after "Step 13", which the validator reads as a declaration. Both now quote the verdict ("block"), the form the validator treats as a mention; no fact changed. The validator run directly afterwards: valid, 0 errors, 1 warning ("No explicit acceptance criteria section found"; the criteria are under the approved text's "Per-file acceptance criteria" headings, which this executor does not edit).
