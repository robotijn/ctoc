---
title: "W02-s6 — Enforcer Gate-Destination Exemption for Pre-Gate-2 Slices"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: none
files:
  - src/lib/iron-loop-enforcer.js
  - tests/iron-loop-enforcer.test.js
priority: HIGH
---

# W02-s6 — Enforcer Gate-Destination Exemption for Pre-Gate-2 Slices

**Parent:** `ctoc-audit-w02-gate-integrity` (functional/implementation index; see it for
the ASSESS/ALIGN/CAPTURE context and the H7 audit finding). This is a live-surfaced
defect slice folded into workstream W02 (gate-integrity).

## Context — H7's second home

The self-audit's finding **H7** — "`approved_by: human` is self-asserted text in an
agent-writable file, detected by a loose substring scan with no notion of who wrote it
or where it sits" — was recorded against `src/hooks/human-gate-check.js`. Slice
**W02-s3** fixes H7 *there* by moving the real gate decision behind a signed ledger.

`src/lib/iron-loop-enforcer.js` `checkGateDestinationsApproved` (~line 298) contains the
**identical bug** in a separate code path that W02-s3 does not touch:

```js
if (!content.includes('approved_by: human') && !content.includes('approved_by_human: true')) {
  offenders.push({ plan: ..., stage });
}
```

Two problems:

1. **No exemption for pre-Gate-2 SIP1 slices.** Under SIP1 a functional plan is
   decomposed into N cohesive-slice implementation plans, each carrying
   `parent_plan:` and awaiting *batch* approval at Gate 2 via `approveSubplans`.
   These slices live **legitimately unmarked** in `implementation/`. The loose check
   flags all 51 of them as `block`-severity, which makes
   `tests/iron-loop-enforcer.test.js:29` ("live repo has 0 block findings") RED — the
   suite is currently RED because of exactly this.
2. **Substring, not frontmatter.** `content.includes('approved_by: human')` matches the
   phrase anywhere — including prose body text that merely *discusses* the marker (see
   `plans/done/ctoc-self-audit-remediation.md:35`, which describes the H7 finding). A
   body mention is not an approval.

**This enforcer is ADVISORY.** It is a self-check surfaced at SessionStart / on-demand
`run-self-check`. The REAL gate is W02-s3's ledger in `human-gate-check.js` (which
auto-reverts un-ledgered gate crossings). Exempting `parent_plan` slices in this
advisory self-check therefore opens **no gate hole** — a genuine gate-jump is still
caught by the hook + ledger, and this check still flags parentless unmarked plans in
`implementation/` and any unmarked plan in `todo/` or `done/`.

## Decisions Taken Under Ambiguity

- **`type: vision` plans in gate destinations are exempt.** The brief enumerated only
  the `parent_plan`-in-`implementation/` exemption. But tightening the marker detection
  to the frontmatter region (required by test (d)) newly exposes
  `plans/done/ctoc-self-audit-remediation.md` — a `type: vision`, `status: decomposed`
  plan whose only `approved_by: human` string is prose in its body. That vision was
  decomposed into functional plans and archived to `done/`; it never crossed the
  review→done code gate and legitimately has no approval marker. The old substring
  check passed it *by accident* (the body phrase). To keep the live-repo self-check
  green AND keep the marker detection honest, decomposed visions are exempted by
  `type: vision`. This is safe: a genuine shipped code plan is never `type: vision`,
  and the enforcer is advisory regardless.

## Step 8: TEST

- [ ] Add focused tests to `tests/iron-loop-enforcer.test.js`, real temp dir + real
      plan files (zero doubles), driving `checkGateDestinationsApproved` via
      `checkAllInvariants({ scopes: ['iron-loop'] })`:
  - [ ] (a) unmarked plan in `implementation/` WITH `parent_plan:` → NOT flagged
  - [ ] (b) unmarked plan in `implementation/` with NO `parent_plan` → flagged
  - [ ] (c) unmarked plan in `todo/` (and `done/`) WITH `parent_plan:` → flagged
  - [ ] (d) plan whose only `approved_by: human` is in the prose body → flagged
- [ ] Confirm RED against current code.
- [ ] Do NOT modify or weaken the existing "live repo passes" tests.

## Step 9: PREPARE

- [ ] No new dependencies. Node built-in test runner only.

## Step 10: IMPLEMENT

- [ ] `src/lib/iron-loop-enforcer.js` — rewrite `checkGateDestinationsApproved`:
  - [ ] Extract the leading frontmatter region (handle the Gate-1 prepended
        marker-block form: two consecutive `---` blocks).
  - [ ] Exempt `stage === 'implementation'` AND `parent_plan:` present in frontmatter.
  - [ ] Exempt `type: vision` plans in any gate destination (decomposed archives).
  - [ ] Detect `approved_by: human` / `approved_by_human: true` in the frontmatter
        region ONLY, not a raw substring.
  - [ ] Keep flagging parentless unmarked `implementation/` plans and any unmarked
        `todo/` or `done/` plan.

## Step 11: REVIEW

- [ ] Self-review: exemptions are minimal, no gate hole introduced.

## Step 12: OPTIMIZE

- [ ] Single read per plan; regex compiled inline. No redundant IO.

## Step 13: SECURE

- [ ] No path traversal (paths come from `listPlans` over the repo's own `plans/`).
      No untrusted input. Frontmatter parse is anchored, ReDoS-safe (lazy, bounded).

## Step 14: VERIFY

- [ ] `node --test tests/*.test.js` → `# fail 0`, `# skipped 0`.
- [ ] Live-repo fast + thorough self-check tests pass (51 slices exempt, marked
      parents still pass).
- [ ] New tests pass.

## Step 15: DOCUMENT

- [ ] Inline comment on the exemption explaining H7's second home + advisory nature.

## Step 16: FINAL-REVIEW

- [ ] All steps complete; ready for review.
