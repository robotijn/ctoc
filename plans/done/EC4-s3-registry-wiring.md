---
approved_by: human
approved_at: 2026-07-08T20:25:27.835Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.759Z
gate_crossed: implementation → todo
---

---
iron_loop: true
---

---
title: "EC4-s3 — register eu-solution-recommender in operations-registry.yaml (LIVE dispatch/discovery surface) + registry-resolution + gate-integrity test"
type: implementation
parent_plan: EC4-eu-solution-recommender
depends_on: EC4-s2-recommender-agent
program: ctoc-eu-compliance
priority: HIGH
risk_level: HIGH
iron_loop: true
files:
  - .ctoc/operations-registry.yaml
  - tests/eu-solution-recommender-registry.test.js
status: refined
---

# EC4-s3 — register eu-solution-recommender (LIVE wiring) + registry test

> Slice 3 of the EC4 decomposition — the **one integration point**: register the
> `eu-solution-recommender` agent (built in s2) in `.ctoc/operations-registry.yaml` so CTO Chief
> (and the calling EC2/EC3 agents) can DISCOVER and dispatch it. A registry entry is a **LIVE,
> human-facing dispatch surface** — so per the **PI4 rule** this slice wires it live AND a real
> test asserts the entry resolves (name, path-to-an-existing-file, tier, category) and that the
> additive edit weakened NO human gate. This is the exact precedent set by EC3-s3
> (`tests/eu-ai-act-agent-registry.test.js`).
>
> Depends on **s2** — the entry's `path` must point at the agent file s2 creates. This is the
> tail of the chain s1 → s2 → s3 (**depth 3, at the SIP1 max — no deeper**). No cycle.

**Read before acting (CF1 / ancestry-read):** read the parent index
`plans/implementation/EC4-eu-solution-recommender.md`; slice s2 for the exact agent
`name`/`path`/`tier`; the real registry `.ctoc/operations-registry.yaml` fresh — specifically the
`COMPLIANCE AGENTS` grouping (lines ~258–282 on disk) where `gdpr-agent` and `eu-ai-act-agent`
are keyed maps with `path`/`model`/`category`/`tier`/`gated_by`/`description`/`parallel_safe`; and
the precedent test `tests/eu-ai-act-agent-registry.test.js` (the exact resolution + gate-integrity
assertion shape). Trust the file on disk over this brief; surface any drift.

## Implementation Details

### Architecture Decision (ADR)

The registry (`.ctoc/operations-registry.yaml`) is CTOC's single source of truth for the agent
roster. Adding the `eu-solution-recommender` entry is what makes the agent **actually
discoverable/dispatchable** — without it, s1+s2 are inert code that nothing can look up (the
"orphaned from birth" anti-pattern). This is a human-facing surface (CTO Chief and the EC2/EC3
agents read the registry), so the wiring is done LIVE and asserted by a real resolution test, not
in prose.

**Targeted edit, not re-serialization.** Following the `writeActiveProfiles` /`EC3-s3` discipline,
the edit ADDS one `eu-solution-recommender` entry to the `agents:` block (in the `COMPLIANCE
AGENTS` grouping, immediately after `eu-ai-act-agent`) and leaves every other block byte-identical.
No YAML round-trip that could reorder or drop keys.

**No gate weakened.** This registry has **no `enforcement:` block** (that lives in
`.ctoc/settings.yaml`); its human-gate surface is the `1. NEVER block humans` Core-Principles
banner, the three iron-loop `human_gate: true` markers, and the three review-agent
`review_gate: true` markers. The additive entry touches none of them, and the entry itself carries
**NO `review_gate: true`** (it is a specialist advisory agent — it stays advisory).

**No `gated_by` marker** (differs from `gdpr-agent`/`eu-ai-act-agent`). The recommender does not
gate on a single `shouldRun*` profile — it is invoked BY the gated EC2/EC3 agents when a finding
needs remediation options, so its activation is scoped by the CALLER's gate, not its own. The entry
records this via an `invoked_by` note rather than a `gated_by` marker (documented below).

### Dependency Graph

```
.ctoc/operations-registry.yaml (eu-solution-recommender entry)
  --path-points-at--> agents/compliance/eu-solution-recommender.md   (s2 — must exist first)
  --invoked-by------> gdpr-agent / eu-ai-act-agent (EC2/EC3 remediation calls; note only)
  --tested-by-------> tests/eu-solution-recommender-registry.test.js  (this slice)
depends_on: s2. Chain: s1 → s2 → s3 (depth 3 — SIP1 max, no deeper). No cycle.
```

### File Specifications

#### File: `.ctoc/operations-registry.yaml`
**Action:** MODIFY
**Purpose:** Register `eu-solution-recommender` so it is discoverable/dispatchable; record that it
is invoked by the EC2/EC3 compliance agents (not self-gated).
**Change Type:** modify-existing (additive entry)

##### Changes
- **Add** one entry under the `agents:` block, in the `COMPLIANCE AGENTS` grouping, immediately
  AFTER the existing `eu-ai-act-agent` entry (before the `IRON LOOP` block):
  ```yaml
  eu-solution-recommender:
    path: agents/compliance/eu-solution-recommender.md
    model: opus
    category: compliance
    tier: 2
    role: specialist
    reports_to: cto-chief
    tools: [WebSearch, WebFetch]      # the ONE web-enabled compliance agent
    invoked_by: [gdpr-agent, eu-ai-act-agent]   # called by EC2/EC3 when a finding needs remediation options; not self-gated
    description: Web-sourced EU-compliance solution recommender; turns an EC2/EC3 finding into ranked hosted / self-hosted / library options with verified prices and sources. Advisory only.
    parallel_safe: true
  ```
  (The block above is the INTENT; the implementer reads the on-disk `gdpr-agent`/`eu-ai-act-agent`
  entries fresh and ALIGNS keys/indentation to the real neighbours — keyed-map convention,
  two-space indent under `agents:`.)
- **Do NOT** add a `review_gate: true` to this entry (it stays advisory).
- **Do NOT** touch the `iron_loop` block, the `human_gate`/`review_gate` markers, the
  `NEVER block humans` banner, or any non-`agents` block.

##### Dependencies
- The `path` value must reference the file s2 creates (`agents/compliance/eu-solution-recommender.md`).

##### Called By
- `agents/coordinator/cto-chief.md` — CTO Chief reads the registry to discover/dispatch specialists.
- `agents/compliance/gdpr-agent.md` / `eu-ai-act-agent.md` — look up the recommender to hand a
  finding to it for remediation options (the dispatch TRIGGER wiring is EC5's concern; this entry is
  the discoverability surface).

##### Error Handling
- N/A (static config). The wiring test guards against a dangling `path` (entry pointing at a
  nonexistent file).

##### Cross-Platform Notes
- Repo-relative forward-slash path (`agents/compliance/eu-solution-recommender.md`), as all other
  entries use.

### Test Plan

#### Tests: `tests/eu-solution-recommender-registry.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert/strict`) — a real registry-resolution +
gate-integrity test, mirroring `tests/eu-ai-act-agent-registry.test.js`.

**Test Cases:**
1. **Entry exists.** Read `.ctoc/operations-registry.yaml`; assert a key `eu-solution-recommender:`
   is present under the `agents:` block (CTO Chief can discover it).
2. **Path resolves to a real file (LIVE-wire assertion, PI4).** Assert the entry's `path`
   (`agents/compliance/eu-solution-recommender.md`) exists on disk — guards against a dangling
   registry pointer.
3. **Tier + category correct.** Isolate the entry block; assert `tier: 2`, `category: compliance`.
4. **Web-enabled + advisory.** Assert the entry records `tools:` including `WebSearch` and
   `WebFetch` (the one web-enabled compliance agent) and that it carries NO `review_gate: true`
   (stays advisory).
5. **Invoked-by recorded, not self-gated.** Assert the entry records `invoked_by:` naming
   `gdpr-agent` and `eu-ai-act-agent` (it is called by EC2/EC3; activation scoped by the caller).
6. **GATE INTEGRITY — no human gate weakened.** Assert the registry still contains exactly three
   `human_gate: true` markers, exactly three `review_gate: true` markers, and the
   `1. NEVER block humans` banner — all UNCHANGED (proving the additive edit weakened no gate; the
   exact 3/3/banner invariant asserted by the EC3-s3 precedent).
7. **Additive-only.** The entry block itself contains no `human_gate`/`review_gate: true`
   (per-entry no-gate check).

**Coverage Targets:** The registry is config — coverage is of the resolution assertions. Every
load-bearing entry field asserted; the dangling-path guard (case 2) and the 3/3/banner gate-
integrity invariant (case 6) are the key real-flow / safety checks.

### Security Review
- [x] **Path traversal:** the entry path and the test read a fixed repo-relative path; no untrusted
      path construction.
- [x] **Input validation:** the test validates the parsed/isolated entry block before asserting
      fields.
- [x] **No secrets:** none in the registry entry.
- [x] **Safe file operations:** implement edits only `.ctoc/operations-registry.yaml` (whitelisted);
      the test reads only.
- [x] **Error messages:** N/A (config).
- [x] **Prototype pollution / command injection:** N/A — additive YAML entry; test parses via the
      existing loader / a YAML read, no `exec`.
- [x] **Gate integrity:** additive-only edit; banner + 3 `human_gate` + 3 `review_gate` markers
      untouched; the new entry carries no `review_gate` — asserted by cases 6 + 7.

## Execution Plan (Steps 8–16)

### Step 8: TEST
- [x] Write `tests/eu-solution-recommender-registry.test.js` — the 7 resolution + gate-integrity
      assertions above (RED first: entry-present + path-resolves fail until this edit + the s2 file
      both land). Parse via the existing registry loader if one exists, else a YAML/text read;
      resolve paths against the project root.

### Step 9: PREPARE
- [x] Confirm s2 shipped `agents/compliance/eu-solution-recommender.md` (the `path` target). Read
      the CURRENT `COMPLIANCE AGENTS` grouping fresh (keyed-map shape via the `gdpr-agent`/
      `eu-ai-act-agent` precedent) so the new entry matches exactly. No new deps.

### Step 10: IMPLEMENT
- [x] Add the `eu-solution-recommender` entry to the `agents:` block immediately after
      `eu-ai-act-agent`, matching the on-disk key shape; include `path`, `model: opus`,
      `category: compliance`, `tier: 2`, `role`, `reports_to`, `tools: [WebSearch, WebFetch]`,
      `invoked_by: [gdpr-agent, eu-ai-act-agent]`, `description`, `parallel_safe: true`. Add NO
      `gated_by` and NO `review_gate`. Touch NO other block. No stubs.

### Step 11: REVIEW
- [x] Self-review: `path` points at the real s2 file; entry shape matches neighbours; the banner +
      three `human_gate: true` + three `review_gate: true` markers are byte-identical (`git diff` =
      additive-only, 0 deletions); the new entry has no `review_gate`.

### Step 12: OPTIMIZE
- [x] Single additive entry; no reordering of the existing roster.

### Step 13: SECURE
- [x] Verify no human gate weakened (case 6 green, 3/3/banner unchanged); no non-`agents` block
      mutated; the new entry stays advisory (no `review_gate`).

### Step 14: VERIFY
- [x] `node --test tests/eu-solution-recommender-registry.test.js` → all 7 GREEN, 0 skipped. Then
      `node --test tests/*.test.js` → `# fail 0` (registry-shape / architecture-invariants tests
      still pass with the new entry). eslint `--max-warnings 0` exit 0.

### Step 15: DOCUMENT
- [x] Inline YAML comment on the entry noting it is the one web-enabled compliance agent, is invoked
      by EC2/EC3 (not self-gated), and stays advisory.

### Step 16: FINAL-REVIEW
- [x] implementation-reviewer verifies the entry resolves, the invoked-by note is recorded, and no
      human gate was weakened (3/3/banner intact). Plan stays in `implementation/` (executor does
      NOT cross Gate 2). Gate 3 approval batched at the EC4 parent level.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — tests 1-5 RED (entry absent), 6-8 green pre-edit

### Step 9: PREPARE
- [x] Install dependencies if needed — none
- [x] Check prerequisites — s2 agent file exists on disk (path target satisfied)
- [x] Verify dev environment ready
- [x] Create directories/config if needed — n/a

### Step 10: IMPLEMENT
- [x] Implement the feature — additive eu-solution-recommender entry after eu-ai-act-agent
- [x] Add error handling — n/a (static config); dangling-path guarded by test
- [x] Wire up integration points — path, tools, invoked_by recorded

### Step 11: REVIEW
- [x] Self-review all new code — entry shape mirrors neighbours; git diff additive-only (15+/0-)
- [x] Verify integration points work together — path resolves to real s2 file
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — single additive entry, no roster reorder

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — fixed repo-relative path
- [x] Sanitize outputs — n/a
- [x] No secrets in code
- [x] Safe file operations — only whitelisted registry edited; no gate weakened (3/3/banner intact)

### Step 14: VERIFY
- [x] Run lint + type check — eslint exit 0; tsc baseline-neutral (0 errors reference slice files)
- [x] Run ALL tests (TDD Green) — new test 8/8; full suite 3309/3309
- [x] Check coverage >= 80% — config wiring; every load-bearing field asserted
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — inline YAML comment on the entry
- [x] Add JSDoc comments to new functions — test-file header docblock
- [x] Update CHANGELOG if needed — n/a (batched at EC4 parent)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review — plan stays in place (executor does NOT cross Gate 2)

## Decisions Taken Under Ambiguity

- **s2 dependency satisfied via shipped artifact.** `depends_on: EC4-s2` and s2's plan
  file is still in `todo/`, but the s2 agent file `agents/compliance/eu-solution-recommender.md`
  already exists on disk. Since s3's only hard dependency is that path target existing (guarded
  by test case 2, the dangling-pointer check), the dependency is satisfied and s3 was implemented
  as directed. If s2's plan is later re-run, the entry's path already matches its output.
- **`tools:` as inline flow list `[WebSearch, WebFetch]`.** The plan INTENT block used an inline
  list; the s2 agent frontmatter uses `tools: WebSearch, WebFetch` (comma string). I used the
  YAML flow-sequence `[WebSearch, WebFetch]` in the registry to match the plan's stated shape and
  keep the test's substring assertions unambiguous. Semantically identical to the neighbours.
- **Entry placement + comment.** Placed immediately after `eu-ai-act-agent` inside the COMPLIANCE
  AGENTS grouping (before IRON LOOP), with a 3-line comment noting it is the one web-enabled agent,
  invoked by EC2/EC3, not self-gated, advisory only — satisfying Step 15 inline documentation.
