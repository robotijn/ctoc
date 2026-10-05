---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the infrastructure, documentation and cost agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: small
files:
  - agents/infrastructure/ci-pipeline-checker.md
  - agents/infrastructure/ci-runner-setup.md
  - agents/infrastructure/deployment-setup.md
  - agents/infrastructure/docker-security-checker.md
  - agents/infrastructure/kubernetes-checker.md
  - agents/infrastructure/terraform-validator.md
  - agents/documentation/changelog-generator.md
  - agents/documentation/documentation-updater.md
  - agents/cost/cloud-cost-analyzer.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.851Z
gate_crossed: implementation → todo
---

# Tool grants for the infrastructure, documentation and cost agents

**Scope (one line):** the four infrastructure checkers and the documentation updater gain search; the two set-up agents gain Edit and search and drop the WebFetch their bodies never use (which takes both off the safety-floor list); `changelog-generator` gains the Write and Edit its "rewrite it for humans" order needs; `deployment-setup` stops ordering a whole-file write of `.ctoc/settings.json`; all nine gain the shared search section and leave the test's debt.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." Every change in this slice goes ahead: the two set-up agents' loss of WebFetch is a safety fix (a web tool beside Write and Bash), and every other change is an addition. No removal in this slice is held.

Read first: the index `plans/implementation/agent-tool-grants.md` and slice 1.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `infrastructure/ci-pipeline-checker` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` | Runs `actionlint`, `glab ci lint` |
| `infrastructure/ci-runner-setup` | `Bash, Read, Write, WebFetch` | `Bash, Read, Write, Edit, Grep, Glob` | Downloads and installs the runner with Bash; "update workflow files" (Step 5); saves the preference; orders no fetch |
| `infrastructure/deployment-setup` | `Bash, Read, Write, WebFetch` | `Bash, Read, Write, Edit, Grep, Glob` | "Write the deployment config to `.ctoc/settings.json` under the `deployment` key" (line 488); dry run and branch checks; orders no fetch |
| `infrastructure/docker-security-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` | hadolint, trivy, syft |
| `infrastructure/kubernetes-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` | `kubectl --dry-run`, kubeconform, kube-linter, kubesec, kyverno |
| `infrastructure/terraform-validator` | `Bash, Read` | `Bash, Read, Grep, Glob` | terraform validate, tflint, checkov, infracost |
| `documentation/changelog-generator` | `Bash, Read` | `Bash, Read, Write, Edit, Grep, Glob` | `git log`; "parse the commits to draft the entry, then rewrite it for humans" (line 18) — an order no tool it holds can carry out today |
| `documentation/documentation-updater` | `Read, Write, Edit` | `Read, Write, Edit, Grep, Glob` | Updates API docs, README, comments |
| `cost/cloud-cost-analyzer` | `Bash, Read, Grep, Glob` | unchanged | infracost, `aws ce`, `kubectl cost` |

`ci-runner-setup` and `deployment-setup` break the safety floor today (WebFetch with Write and Bash); dropping the unused WebFetch takes both off the list. A limit stays, stated in the index: `ci-runner-setup`'s Bash downloads and installs the runner from GitHub.

### Body edits, exactly

**`deployment-setup`, line 488.** Replace the sentence "Write the deployment config to `.ctoc/settings.json` under the `deployment` key — this is the file `src/lib/deployment.js` actually reads (the documented, executed config home)." with:

```markdown
Put the deployment config into `.ctoc/settings.json` under the `deployment` key with `Edit`, after a fresh `Read` — this is the file `src/lib/deployment.js` actually reads (the documented, executed config home). The file holds other settings (`general`, `workflow` and more); change only the `deployment` key — replace its value when it exists, add it when it does not — and never rewrite the whole file with `Write`, which can drop a setting another part of CTOC depends on. Create the file with `Write` only when it does not exist.
```

**`ci-runner-setup`, "### Step 5: Update Workflows (Hybrid)".** Replace the line "For hybrid setup, update workflow files:" with:

```markdown
For hybrid setup, change each workflow file with `Edit`, after a fresh `Read`, one `runs-on:` line at a time; never rewrite a workflow file with `Write`:
```

**`changelog-generator`, after the "## Role" paragraph (line 18).** Insert:

```markdown
Put the curated entry into `CHANGELOG.md` with `Edit`, after a fresh `Read`: the `old_string` is the first existing version heading and the `new_string` is the new entry followed by that same heading. Create `CHANGELOG.md` with `Write` only when it does not exist; never rewrite an existing changelog whole.
```

**The shared search section**, in all nine, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The test edits — `tests/agent-tool-grants.test.js`

- Remove the nine keys from `DEBT`; lower `MAX_DEBT` by 9.
- Remove `infrastructure/ci-runner-setup` and `infrastructure/deployment-setup` from `RULE6_EXCEPTIONS`; lower `MAX_RULE6_EXCEPTIONS` by 2.
- Remove `infrastructure/ci-runner-setup` and `infrastructure/deployment-setup` from `WRITE_EDIT_DEBT` (each now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 2. (`changelog-generator` gains Write and Edit together, so it never enters that list.)
- `HELD_REMOVALS` names none of these nine and is unchanged.
- Lower `MAX_DEBT` by 9, `MAX_WRITE_EDIT_DEBT` by 2 and `MAX_RULE6_EXCEPTIONS` by 2 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling. Also lower `CEILINGS.EXCUSED_TOOLS` by 2 in `tests/agent-tool-grants-maxima.test.js`: the safety-floor exceptions this slice removes excuse 2 tools (slice 1 decision 24).

### Wiring — the live call sites

No module is added. `deployment-setup` is a first-level agent CTO Chief dispatches for deployment configuration; the others are dispatched at the steps their trigger tables name. This slice changes what they may do, not whether they are reached.

### Security review

- Two set-up agents stop holding a web tool beside Write and Bash (rule 6).
- `deployment-setup` no longer orders a whole rewrite of `.ctoc/settings.json`, which holds settings other parts of CTOC read (the enforcement mode among them).
- `ci-runner-setup` still installs a service with Bash; its body already orders that every choice is the human's ("ALWAYS let user make informed decision"). Whether a dispatched agent can ask the human mid-run is unverified (index, decision 9).

### Acceptance criteria

1. The nine tools lines read as in the table.
2. `deployment-setup` line 488, `ci-runner-setup` Step 5 and `changelog-generator`'s new paragraph read as above.
3. All nine carry the shared search section and are out of `DEBT`; the two set-up agents are out of `RULE6_EXCEPTIONS` and `WRITE_EDIT_DEBT`; `MAX_DEBT`, `MAX_WRITE_EDIT_DEBT` and `MAX_RULE6_EXCEPTIONS` are lowered by 9, 2 and 2 in both test files.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **WebFetch is dropped, not kept as an exception**: neither set-up body orders a fetch; their network access is Bash and is listed in the index's stated limit.
2. **`changelog-generator` becomes a writer**: its role sentence orders it to rewrite the drafted entry, which is a file change.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." Dropping WebFetch from `ci-runner-setup` and `deployment-setup` is the separation each needs to meet the safety floor, so it is approved work and is not held; `changelog-generator`'s Write and Edit are additions and are kept.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each agent and each wrong tool
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the nine files; confirm each `old_string` occurs exactly once
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the eight changed tools lines, the three body edits, the nine search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` passes
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent, the safety floor and the settings-file order
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: the `deployment` key only

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies themselves
- [ ] Add JSDoc comments to new functions: none
- [ ] Update CHANGELOG if needed: no changelog file exists

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly: through CTOC's final review agent
- [ ] All quality checks passed: `npm test`
- [ ] Manual verification if needed: none
- [ ] Ready for human review: through the menu's task completion


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
