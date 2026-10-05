---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the security, legal and compliance agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/security/concurrency-checker.md
  - agents/security/cra-incident-clocks.md
  - agents/security/dependency-auditor.md
  - agents/security/dependency-checker.md
  - agents/security/incident-responder.md
  - agents/security/input-validation-checker.md
  - agents/security/sast-scanner.md
  - agents/security/secrets-detector.md
  - agents/security/security-scanner.md
  - agents/security/threat-modeler.md
  - agents/legal/clm-obligations.md
  - agents/legal/dsar-handler.md
  - agents/compliance/audit-log-checker.md
  - agents/compliance/eu-ai-act-agent.md
  - agents/compliance/gdpr-agent.md
  - agents/compliance/license-scanner.md
  - agents/compliance/sbom-cra-checker.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.954Z
gate_crossed: implementation → todo
---

# Tool grants for the security, legal and compliance agents

**Scope (one line):** `security-scanner` gains Edit; `cra-incident-clocks`, `clm-obligations` and `dsar-handler` gain Edit beside the Write they hold, so each Write and Edit pair is held together; the readers that lack them gain Grep or Glob; two descriptions that promise writing are reworded (question 3); all seventeen gain the shared search section and leave the test's debt. The removals this slice first proposed — Bash from `threat-modeler`, `incident-responder`, `dsar-handler` and `sbom-cra-checker`, and the Write and Edit pair from `cra-incident-clocks`, `dsar-handler` and `clm-obligations` — are held (slice 11). `eu-solution-recommender` (web only) is unchanged and not in this slice.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." None of this slice's removals is a safety fix (none of these agents holds a web tool), so all are held: ten tools, the seven first proposed plus the Edit the three held-Write agents gain here; every addition goes ahead. **The CTO Chief's decision 17(b) of 2026-10-05 (index):** under the owner's Write-and-Edit ruling (index, decision 16), the three held-Write agents gain Edit in this slice, and each Write and Edit pair is held for slice 11.

Read first: the index `plans/implementation/agent-tool-grants.md`, slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `security/concurrency-checker` | `Bash, Read, Grep, Glob` | unchanged | `go test -race`, `go vet`, `cargo check`, spotbugs |
| `security/cra-incident-clocks` | `Read, Write, Grep` | `Read, Write, Grep, Glob, Edit` (Write and Edit held together, slice 11) | A reviewer; "Output is structured YAML findings"; no write ordered |
| `security/dependency-auditor` | `Bash, Read, Grep, Glob` | unchanged | npm audit and outdated, license and SBOM tools |
| `security/dependency-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` | npm audit, pip-audit, govulncheck, cargo audit |
| `security/incident-responder` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | "You are the standing observer of whether this organisation could survive its worst day"; reviews runbooks; the skill's first phase is `ls` (a listing); no command |
| `security/input-validation-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads input-handling code |
| `security/sast-scanner` | `Bash, Read, Grep, Glob` | unchanged | semgrep, bandit, gosec |
| `security/secrets-detector` | `Bash, Read, Grep, Glob` | unchanged | trufflehog, gitleaks, live verification |
| `security/security-scanner` | `Bash, Read, Write, Grep, Glob` | `Bash, Read, Write, Grep, Glob, Edit` | Writes `.ctoc/quality-state/security-results.json` and a report; computes a sha256 fingerprint per finding |
| `security/threat-modeler` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | "You are the standing observer of design-time security reasoning"; no command (named as a hole in `tests/watcher-shape.test.js` lines 95-98) |
| `legal/clm-obligations` | `Read, Write, Grep, Glob` | `Read, Write, Grep, Glob, Edit` (Write and Edit held together, slice 11) | A reviewer ("Judge these"); its findings point at `.ctoc/contracts/obligations.yaml`; no write ordered |
| `legal/dsar-handler` | `Read, Write, Grep, Glob, Bash` | `Read, Write, Grep, Glob, Bash, Edit` (Write and Edit held together, and Bash held, slice 11) | "You are the standing observer of a person's right to their own data"; its findings point at `.ctoc/dsar/<request-id>.yaml`; no write, no command |
| `compliance/audit-log-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads logging code |
| `compliance/eu-ai-act-agent` | `Read, Grep` | `Read, Grep, Glob` | Reads the plan and the regime helper |
| `compliance/gdpr-agent` | `Read, Grep` | `Read, Grep, Glob` | Reads the plan and the regime helper |
| `compliance/license-scanner` | `Bash, Read` | `Bash, Read, Grep, Glob` | license-checker, pip-licenses, go-licenses, fossa |
| `compliance/sbom-cra-checker` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | "You are the standing observer of what is actually inside the product"; the skill's shell blocks are BAD/GOOD examples of the user's release pipeline |

### Body edits, exactly

**Quoted grants** (the slice-1 test checks these):
- `eu-ai-act-agent` line 36: "Your `Read, Grep` grant" becomes "Your `Read, Grep, Glob` grant".
- `eu-ai-act-agent` line 92: "your `Read, Grep` grant cannot execute them" becomes "your `Read, Grep, Glob` grant cannot execute them".
- `gdpr-agent` line 32: "Your `Read, Grep` grant gives you no way to execute" becomes "Your `Read, Grep, Glob` grant gives you no way to execute".
- If `cra-incident-clocks`, `clm-obligations`, `dsar-handler` or `security-scanner` quotes its own grant in backticks (two or more tool names), that quote is changed to the new grant in the same build: check 3 fails on a stale quoted grant for every agent outside `DEBT`. Step 9 finds any such quote with Grep.

**Descriptions (question 3, the owner's answer of 2026-10-05: the recommended option).** Neither has a "Dispatch when" phrase; every other word stays.
- `dsar-handler`: "Writes per-request evidence to .ctoc/dsar/<request-id>.yaml." becomes "Checks the per-request evidence in .ctoc/dsar/<request-id>.yaml."
- `clm-obligations`: "and writes them to .ctoc/contracts/obligations.yaml with timer-bearing fields." becomes "and checks that .ctoc/contracts/obligations.yaml records them with timer-bearing fields."

**The shared search section**, in all seventeen, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The test edits — `tests/agent-tool-grants.test.js`

Remove the seventeen keys from `DEBT`; lower `MAX_DEBT` by 17. Remove `legal/clm-obligations`, `legal/dsar-handler`, `security/cra-incident-clocks` and `security/security-scanner` from `WRITE_EDIT_DEBT` (each now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 4. `HELD_REMOVALS` is unchanged: its six entries for this slice's agents (`compliance/sbom-cra-checker` Bash, `legal/clm-obligations` Write and Edit, `legal/dsar-handler` Write, Edit and Bash, `security/cra-incident-clocks` Write and Edit, `security/incident-responder` Bash, `security/threat-modeler` Bash — ten tools) stay until slice 11. Lower `MAX_DEBT` by 17 and `MAX_WRITE_EDIT_DEBT` by 4 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling.

### Wiring — the live call sites

No module is added. CTO Chief dispatches the security agents at Step 13 and the compliance agents when their regime is on (`agents/coordinator/cto-chief.md`); this slice changes what they may do, not whether they are reached.

### Security review

- Four security and legal reviewers keep a shell they never use, and three keep an unused Write and Edit pair (the Edit added here adds no reach beyond the Write they hold), until slice 11 measures them; `threat-modeler`'s Bash stays named as a hole by `tests/watcher-shape.test.js` until then. None of them holds a web tool, so the safety floor holds.
- `secrets-detector` keeps Bash; its live verification sends a found credential to its provider (index, stated limit). Not changed here.
- `dependency-checker`'s body shows `npm audit fix`, which changes the lockfile; reported in the index, not changed here.
- No agent here loses Bash, so `tests/unexecutable-instruction-fence.test.js` scans no new agent; that moves to slice 11.
- `tests/gdpr-agent-definition.test.js` (requires Read and Grep, forbids Write, Bash, Edit) and `tests/eu-ai-act-agent.test.js` (requires Read and Grep) stay green with Glob added.

### Acceptance criteria

1. The ten changed tools lines read as in the table; seven are unchanged.
2. The three quoted grants and the two descriptions read as above; no other quoted grant in the seventeen is stale.
3. All seventeen carry the shared search section and are out of `DEBT`; `clm-obligations`, `dsar-handler`, `cra-incident-clocks` and `security-scanner` are out of `WRITE_EDIT_DEBT`; `MAX_DEBT` and `MAX_WRITE_EDIT_DEBT` are lowered by 17 and 4 in both test files; `HELD_REMOVALS` is unchanged.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **`security-scanner` keeps Bash** although its body says "You do not run the engines yourself": its aggregation step orders a sha256 fingerprint per finding, which needs a command.
2. **The body decides reviewer or builder** for `dsar-handler` and `clm-obligations` (question 3, the owner's answer of 2026-10-05: the recommended option). Their descriptions are reworded now; their Write and Edit pair is held.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." All seven removals this slice first proposed are least-privilege removals and are held (slice 11), with the Edit each held Write is paired with.
4. **`cra-incident-clocks`, `clm-obligations` and `dsar-handler` gain Edit while their Write is held**, and each pair is held together: the owner's ruling (index, decision 16) is that Write and Edit are granted together and removed together, and the CTO Chief's decision 17(b) places these three Edits in this slice. This replaces the earlier reading that Edit would widen a grant whose removal is pending.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each agent, each wrong tool and each stale quoted grant
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the seventeen files; confirm each `old_string` occurs exactly once; Grep each of the ten whose tools line changes for a backticked span of two or more tool names and list every quoted grant the new line makes stale; Grep `tests/` for `cra-incident-clocks`, `clm-obligations`, `dsar-handler` and `security-scanner` and record any test that pins a tools line (a pin found there is a scope-growth question, never a silent edit)
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the ten tools lines, the quoted grants (any found at Step 9 included), the two descriptions, the seventeen search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/gdpr-agent-definition.test.js`, `tests/eu-ai-act-agent.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/unexecutable-instruction-fence.test.js` and `tests/watcher-shape.test.js` pass
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: n/a

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies and descriptions themselves
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
