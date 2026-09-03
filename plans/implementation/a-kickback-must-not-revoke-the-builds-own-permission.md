---
title: "A kickback must not revoke the build's own permission — the counter moves out of the hashed frontmatter"
type: functional
status: functional
created: 2026-09-03
priority: high
effort: small
files:
  - src/lib/circuit-breaker.js
  - src/lib/actions.js
  - tests/circuit-breaker.test.js
  - tests/approval-hash-survives-execution.test.js
approved_by: human
approved_at: 2026-09-03T07:34:02.894Z
gate_crossed: functional → implementation
---

# A kickback must not revoke the build's own permission — the counter moves out of the hashed frontmatter

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|------------|------------------|------------|
| 1 | `00256-a-kickback-must-not-revoke-the-builds-own-permission-s1-sidecar-counter.md` | The circuit breaker persists the kickback counter in `.ctoc/state/kickbacks/<slug>.json` (atomic temp+rename) and never writes the plan file again; the existing frontmatter count is honoured as a floor, thresholds and escalations unchanged. | – |

One slice: the storage move and the single signature it forces
(`readKickbackCounts` needs the project root) cannot be half-landed without leaving the
suite red between slices. The slice's own work surface is one module,
`src/lib/circuit-breaker.js`; the remaining declared files are its test callers plus two
doc claims that become false when the storage moves.

**Drift found while planning, recorded here rather than silently corrected:** the file
`tests/circuit-breaker.test.js` named in this plan's `files:` does not exist. The circuit
breaker's tests are `tests/ctoc-audit-w05-circuit-breaker.test.js`,
`tests/circuit-breaker-coverage.test.js`, `tests/circuit-breaker-block-prepend.test.js`,
`tests/circuit-breaker-malformed-frontmatter.test.js` and
`tests/circuit-breaker-wiring.test.js`. The slice declares the real files. This plan's own
frontmatter is left untouched — it is hashed, and amending it is the exact harm this plan
exists to stop.

---

## Original functional plan

## 1. ASSESS — Problem Understanding

Reproduced on the live repository, 2026-09-01/03. `src/lib/circuit-breaker.js`
persists a plan's kickback counter (`kickback_counts: { by_step, total }`) in the
plan file's **first YAML frontmatter block**. The approval ledger hashes the
frontmatter in full (`computeSpecHash` — the frontmatter carries `files:`, the
write permission, so it must be hashed). Consequence, observed on
`plans/review/00252-close-the-coverage-holes-s18-remainder-hooks-commands.md`:

1. The plan was approved into the build with a recorded specification hash.
2. Its Step 14 verification failed once (a coverage-reporter crash), so
   `recordStepKickback` wrote `kickback_counts` into the frontmatter — a normal,
   documented event ("kickbacks are normal — they mean the quality gate is
   working").
3. From that write on, `approval-ledger.contentMatches` reads `hash-mismatch`, so
   `approval-residency.isApprovedForCoverage` — the single predicate behind the
   edit-channel and shell-channel write permission for the in-progress plan —
   answers NOT approved. **The build's own quality gate revoked the build's write
   permission**, and the plan reads as forged to every audit.

The circuit breaker is doing its job; the storage location is the defect. A
counter that must change during the build cannot live inside the region whose
whole purpose is to prove the build changed nothing.

## 2. ALIGN — Approach

Move the counter's persistence out of the hashed region: the circuit breaker
reads and writes `kickback_counts` in a sidecar under
`.ctoc/state/kickbacks/<slug>.json` (the same pattern as the verify evidence),
not in the plan file. Migration: on first read, an existing frontmatter
`kickback_counts` block is honoured as the starting value (so no live count is
lost) but never written back; writing always goes to the sidecar. The
frontmatter block is left in place on existing plans (removing it would itself
change their hash) and ignored thereafter.

Alternatives considered and set aside: exempting the frontmatter block from the
hash would put an executor-writable region inside the frontmatter — the exact
runtime-chosen boundary the ledger's design comment forbids; and re-recording the
approval after every kickback would make the breaker a ledger writer.

### Scope

**In scope:** `circuit-breaker.js` persistence; the call sites in
`src/lib/actions.js` (`recordStepKickback` path) if a signature moves; regression
tests: a kickback on an approved fixture plan leaves `contentMatches` true and the
sidecar carrying the count; escalation thresholds (3 per step, 5 total) unchanged
and still firing; migration case (existing frontmatter count is honoured once).

**Out of scope:** repairing `00252`'s already-recorded mismatch (ruled separately:
the exempt-row re-record decision covers the ledger side), any change to
escalation behaviour, and removing the frontmatter block from existing plans.

## 3. CAPTURE — Acceptance Criteria

```gherkin
Feature: The quality gate never revokes the permission it polices

  Scenario: A kickback leaves the approval intact
    Given a fixture plan approved with a recorded specification hash
    When recordStepKickback records a Step 14 kickback
    Then contentMatches(entry, plan bytes) is still true
    And the count lives in .ctoc/state/kickbacks/<slug>.json

  Scenario: The circuit breaker still trips
    Given three kickbacks to the same step, or five in total
    When the next kickback is recorded
    Then the escalation fires exactly as before, read from the sidecar

  Scenario: An existing frontmatter count is not lost
    Given a plan whose frontmatter already carries kickback_counts totals
    When the breaker reads the count for the first time
    Then the sidecar starts from those totals and the frontmatter is never
      written again
```

**Definition of Done:** `npm test` fail 0, skipped 0, coverage ≥ floor; the three
scenarios above green; no existing assertion weakened; no exemption added.

## Decisions Taken Under Ambiguity

1. **Sidecar, not exemption.** The ledger's deny-list comment rules out a
   runtime-writable exempt region; the verify evidence already establishes the
   sidecar pattern under `.ctoc/state/`.
2. **Leave the stray block on existing plans.** Deleting it changes their hash —
   the harm this plan exists to stop.
