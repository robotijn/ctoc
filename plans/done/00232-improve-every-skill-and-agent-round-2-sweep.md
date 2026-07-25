---
approved_by: human
approved_at: 2026-07-25T12:40:50.742Z
gate_crossed: review → done
override: true
override_reason: Human signed off round-2 corpus sweep as done 2026-07-25 (chose "Finalize it"). Shipped v6.13.23 (4ff3912), pushed to origin/main; gate-green: npm test 0 failed, 0 skipped, coverage 99.04%. Continuation of approved program 00230.
---

---
approved_by: human
approved_at: 2026-07-24T15:44:03.653Z
gate_crossed: implementation → todo
override: true
override_reason: Human authorized round-2 corpus sweep via "continue" 2026-07-24; continuation of approved program 00230.
---

---
plan_id: "00232"
title: "Improve every skill and every agent — round 2 verification-completion sweep"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: corpus-quality
iron_loop: true
files:
  - "skills/**/*.md"
  - "agents/**/*.md"
created: "2026-07-24"
---

# Round 2 — corpus quality verification-completion sweep

## Why (continuation of the human-approved program)

Round 1 (plan 00230, done) read every skill and agent once and fixed real
fabrications. Partway through, the WebSearch budget was exhausted, so a number of
agents STOPPED rather than edit an unverified claim — leaving verifications
unfinished rather than wrong. Round 2 has fresh budget: finish those verifications
and catch anything the first pass missed. Authorized by the human's instruction to
"continue" on 2026-07-24.

## Scope

Every `skills/**/SKILL.md` and every `agents/**/*.md` (224 files after the
workos-sso agent removal). One subagent per file, up to 10 concurrent, each reading
the file fresh and verifying every concrete claim against a live source before
touching it. No fakes: an unverifiable claim is removed or flagged, never invented;
a no-op is a legitimate outcome when the file is already correct.

## Iron Loop steps

- **8 TEST** — n/a for documentation files; the verification IS the test (each claim
  checked against a live source).
- **9 PREPARE** — durable marker queue rebuilt over the current corpus.
- **10 IMPLEMENT** — per-file harsh critique + verified fixes, one file per subagent.
- **11 REVIEW** — each subagent's report names the source that verified each fix.
- **12 OPTIMIZE** — n/a.
- **13 SECURE** — no secret or path introduced into any file.
- **14 VERIFY** — `npm test` green after the sweep; the whole corpus still passes
  the shape/count/wrapper invariants.
- **15 DOCUMENT** — the sweep's aggregate findings reported to the human.
- **16 FINAL-REVIEW** — human reviews the batch at Gate 3.

## Decisions Taken Under Ambiguity

- A file already correct after a genuine read is a NO-OP, not a manufactured change.
- A claim that cannot be verified against a live source is removed or flagged, never
  replaced with an invented fact.
