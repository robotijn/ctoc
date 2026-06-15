---
iron_loop: true
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "user-directed work order (round 2): 'build way more tests, e2e + security'"
title: "Test-Suite Hardening Round 2 — deployment injection, audit-chain, Bash hook, governance modules"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
program: ctoc-quality
order: 2
files:
  - "tests/**"
  - "src/hooks/**"
  - "src/lib/**"
  - "src/commands/**"
  - "src/areas/**"
  - "src/scripts/**"
  - "VERSION"
---

# Test-Suite Hardening Round 2

> Covering plan for the second user work order ("build way more tests, also e2e
> and security ... failing tests means updating the code not the tests").
> Declares file scope so the enforcement hook permits the work.

## Targets (highest-risk untested surface, per 2026-06-15 recon)
- `src/lib/deployment.js` — execSync string interpolation in all 6 strategy
  executors = command injection; webhook = SSRF; verify dry_run safety.
- `src/lib/audit-chain.js` — SHA-256 hash chain, untested; tamper-evidence must
  actually detect modification/insertion/deletion/reordering.
- `src/hooks/PreToolUse.Bash.js` — regex command classification; probe bypasses
  of the write-block and commit/push gate.
- `src/lib/regulatory-regime.js` — fix the parseYAMLShallow first-key list-drop
  data-loss bug; assert no regime/control can disable a human gate.
- `src/lib/actions.js` — approvePlan gate correctness + deployment trigger only
  when enabled; lock/queue/orphan-cleanup.
- Round 2b: governance modules (four-eyes, privilege-posture, spoliation-safe,
  legal-hold, hash-utils, config-baseline) + remaining hooks.

## Discipline (non-negotiable)
A failing test means the CODE is wrong. Fix source, never weaken/skip tests.
Security payloads use a harmless `touch <marker>` sentinel in hermetic temp dirs.
