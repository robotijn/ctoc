---
approved_by: human
approved_at: 2026-07-08T16:30:05.031Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T14:26:07.880Z
gate_crossed: implementation → todo
---

---
title: "EC1-s2 — compliance-regime resolver module (shouldRunGdpr / shouldRunEuAiAct)"
type: implementation
parent_plan: EC1-compliance-mode-setting
depends_on: EC1-s1-gdpr-profile
iron_loop: true
priority: HIGH
files:
  - src/lib/compliance-regime.js
  - tests/compliance-mode.test.js
status: refined
risk_level: MEDIUM
---

# EC1-s2 — compliance-regime resolver module (shouldRunGdpr / shouldRunEuAiAct)

Slice 2 of the EC1 decomposition. Adds the thin, testable resolver module that every
downstream compliance agent (EC2/EC3/EC5/EC6) calls. It derives its answers DIRECTLY from
`loadActiveProfiles()` in `src/lib/regulatory-regime.js` — one source of truth, no schema
entry, no `settings.json` mirror, no `compliance.mode` key (per the parent's replaced design).
It also exports the safety-critical `settings.yaml` write helper that slice 3's ride-along
calls, so the write logic is unit-tested here rather than inlined in the menu.

Depends on **EC1-s1** because the resolver truth table's "both profiles active" and "gdpr
active" paths, and the write-then-read round trip, reference the real `gdpr.yaml` profile name.

## Implementation Details

### Architecture Decision (ADR)

**Context:** Compliance agents need a stable boolean API (`shouldRunGdpr`, `shouldRunEuAiAct`)
and the ride-along needs to persist a chosen profile into the safety-critical, hook-read
`.ctoc/settings.yaml`. The parent forbids a second source of truth.

**Decision:** A new `src/lib/compliance-regime.js` that (1) wraps `loadActiveProfiles()` for
reads and (2) owns a single targeted-string-replacement writer for `active_profiles`. It does
NOT re-serialize the whole YAML (parent risk mitigation) and does NOT touch `settings.js`
(which owns only `settings.json`). The module lives in `lib/` (dependency flows inward:
menu/commands → lib; the resolver imports only `regulatory-regime` and `safe-fs`, never hooks
or commands).

**Consequences:** One reader (`loadActiveProfiles`) of the canonical store; the writer is
additive and round-trip verified; the menu (s3) stays a thin caller. Wrong `projectRoot`
silently returns `false` (documented, not a crash) — matching the existing regime system.

### Dependency Graph

```
src/lib/regulatory-regime.js  (EXISTING)
    └── loadActiveProfiles(root) ──used-by──> src/lib/compliance-regime.js  (CREATE)
.ctoc/regulatory-regimes/gdpr.yaml  (from EC1-s1)  ──referenced-by tests──┐
src/lib/compliance-regime.js  (CREATE)                                     │
    ├── shouldRunGdpr(root)        derived from loadActiveProfiles          │
    ├── shouldRunEuAiAct(root)     derived from loadActiveProfiles          │
    ├── writeActiveProfiles(root, profiles[])   targeted settings.yaml write│
    └── tested-by ─> tests/compliance-mode.test.js  (CREATE) <─────────────┘
src/lib/safe-fs.js  (EXISTING)  ──used-by──> compliance-regime.js (read/write settings.yaml)
```

No cycle: `compliance-regime` → `regulatory-regime` → `safe-fs`; none import back. Chain
depth 2.

### File Specifications

#### File: `src/lib/compliance-regime.js`
**Action:** CREATE
**Purpose:** The compliance-agent-facing resolver: derive `shouldRunGdpr` / `shouldRunEuAiAct`
from `regulatory_regime.active_profiles`, and provide the single tested writer that adds a
profile to `active_profiles` in `.ctoc/settings.yaml`.
**Change Type:** new-module

**Constants:**
- `const GDPR_PROFILE = 'gdpr';`
- `const EU_AI_ACT_PROFILE = 'eu-ai-act-high-risk';` (the EXISTING profile name — verified,
  the ride-along maps user option `eu-ai-act` → this profile name, per parent decision).

**Imports:**
- `const path = require('path');`
- `const safeFs = require('./safe-fs');`
- `const { loadActiveProfiles } = require('./regulatory-regime');`

**Exports:**
- `shouldRunGdpr(projectRoot)` → `boolean`
  - Description: returns `loadActiveProfiles(projectRoot).profiles.includes(GDPR_PROFILE)`.
  - Never throws: `loadActiveProfiles` already returns `{ profiles: [], overrides: {} }` when
    `settings.yaml` is absent (regulatory-regime.js:172) — so missing settings ⇒ `false`.
  - JSDoc MUST state: pass the correct `projectRoot`; a wrong root silently returns `false`
    (parent risk mitigation — documented, not a crash).
- `shouldRunEuAiAct(projectRoot)` → `boolean`
  - Description: `loadActiveProfiles(projectRoot).profiles.includes(EU_AI_ACT_PROFILE)`.
  - Same no-throw / wrong-root contract.
- `writeActiveProfiles(projectRoot, profileNames)` → `{ ok: boolean, profiles: string[] }`
  - Description: additively activate the given profile name(s) in `active_profiles` by
    TARGETED STRING REPLACEMENT of the single `active_profiles:` line in `.ctoc/settings.yaml`
    — never a full YAML re-serialization (parent risk mitigation).
  - Algorithm:
    1. Read the whole file (`safeFs.readFileSync`, utf8). If absent → return
       `{ ok: false, profiles: [] }` (caller decides; ride-along treats as no-op).
    2. Union the existing profiles (via `loadActiveProfiles`) with `profileNames`, filtering
       to non-empty strings, de-duplicating, preserving order (existing first).
    3. Build the replacement inline list `active_profiles: [a, b]` (bracket form — the regime
       parser reads inline `[...]` at regulatory-regime.js:201-203, verified round-trippable).
    4. Replace ONLY the first line matching `/^(\s*)active_profiles:.*$/m` with the new line
       (preserving the captured leading indentation). If no such line exists, return
       `{ ok: false, profiles: [] }` (do not corrupt the file by appending blindly).
    5. Write back with `safeFs.writeFileSync`.
    6. ROUND-TRIP VERIFY (parent mitigation): re-read via `loadActiveProfiles(projectRoot)`;
       assert every requested profile is now present. On mismatch, return `{ ok: false }`
       WITHOUT having left the file unparseable (the targeted replace only ever swaps one
       list line, so the rest of the file — including the hook-critical `enforcement`/
       `operations` blocks — is byte-identical).
  - Selecting `none` ⇒ caller passes `[]` ⇒ no write (nothing to add); returns
    `{ ok: true, profiles: <current> }`.
  - Throws: never for expected inputs; wraps its own fs errors and returns `{ ok: false }`
    (so the menu ride-along stays fail-open, mirroring `enterSearchMode`).

**Called By:**
- `src/commands/menu.js` (slice 3) — `writeActiveProfiles` via the `claude:set-compliance-regime`
  action; `shouldRun*` are read by future EC2/EC3 agents (out of scope here).

#### Data Flow
```
shouldRunGdpr(root)
  → loadActiveProfiles(root)  (reads .ctoc/settings.yaml regulatory_regime block)
  → { profiles } .includes('gdpr')  → boolean

writeActiveProfiles(root, ['gdpr'])
  → readFileSync(settings.yaml) → union existing+new profiles
  → String.replace(/^(\s*)active_profiles:.*$/m, '$1active_profiles: [gdpr]')
  → writeFileSync(settings.yaml)
  → loadActiveProfiles(root) round-trip check → { ok, profiles }
```

#### Error Handling
- Missing `settings.yaml` on read (`shouldRun*`): returns `false` (via loadActiveProfiles guard).
- Missing `settings.yaml` on write: return `{ ok:false, profiles:[] }` (no create — the file is
  a hook-critical artifact that init owns; the ride-along won't fabricate it).
- No `active_profiles:` line found: return `{ ok:false }` — never blind-append (would risk a
  malformed hook file).
- fs throw: caught, return `{ ok:false }` — fail-open for the menu.

#### Cross-Platform Notes
- `path.join(projectRoot, '.ctoc', 'settings.yaml')` — no string concat.
- CRLF-safe: the replacement regex uses `.*$` with the `m` flag (no `\r` swallow issue since
  the parser already handles CRLF, regulatory-regime.js:193).
- Uses `safeFs` (the repo-standard wrapper) for all fs access.

### Test Plan

#### Tests: `tests/compliance-mode.test.js`
**Action:** CREATE
**Framework:** `node:test`, tmp-project pattern from `tests/menu-environment.test.js`
(mkdtempSync, write a real `.ctoc/settings.yaml`, copy `regulatory-regimes/` incl. `gdpr.yaml`
and `eu-ai-act-high-risk.yaml`, cleanup in `after()`).

Helper `projectWith(activeProfilesLine)` writes a minimal but REAL `settings.yaml` containing a
`regulatory_regime:` block with the given `active_profiles:` line plus an `overrides: {}` line,
and an `enforcement:`/adjacent block so the round-trip proves neighboring blocks are untouched.

**Test Cases (full truth table + edges + gate invariant — maps CAPTURE scenarios 1:1):**
1. **Default empty → both false** (`active_profiles: []`): `shouldRunGdpr` and
   `shouldRunEuAiAct` both `=== false`; no throw.
2. **gdpr active** (`active_profiles: [gdpr]`): `shouldRunGdpr === true` AND
   `shouldRunEuAiAct === false`.
3. **eu-ai-act active** (`active_profiles: [eu-ai-act-high-risk]`): `shouldRunEuAiAct === true`
   AND `shouldRunGdpr === false`.
4. **Both active** (`active_profiles: [gdpr, eu-ai-act-high-risk]`): both `=== true`.
5. **Missing settings.yaml → both false, no throw:** tmp project with NO `.ctoc/settings.yaml`;
   assert `shouldRunGdpr(root) === false` and `shouldRunEuAiAct(root) === false`,
   `assert.doesNotThrow`.
6. **Unknown profile → both false** (`active_profiles: [unknown-regime]`): both `=== false`,
   no throw (unknown name activates neither).
7. **Wrong projectRoot → false, not crash:** call `shouldRunGdpr('/nonexistent/root')` →
   `false` (graceful), `assert.doesNotThrow` (parent loadActiveProfiles risk mitigation).
8. **writeActiveProfiles adds gdpr + round-trips:** start `active_profiles: []`, call
   `writeActiveProfiles(root, ['gdpr'])` → `{ ok:true }`; then `shouldRunGdpr(root) === true`
   (read via the REAL resolver, proving the write is real).
9. **writeActiveProfiles is additive (union, no clobber):** start `[gdpr]`, call
   `writeActiveProfiles(root, ['eu-ai-act-high-risk'])`; then BOTH `shouldRunGdpr` and
   `shouldRunEuAiAct` are `true` (existing profile preserved).
10. **writeActiveProfiles([]) is a no-op OK:** returns `{ ok:true }`, `active_profiles`
    unchanged.
11. **Neighboring blocks untouched (targeted-replace proof):** capture the bytes of the
    `enforcement`/`operations` region before and after `writeActiveProfiles(root,['gdpr'])`;
    assert that region is byte-identical (only the one list line changed) — the parent's
    "malformed settings.yaml breaks hooks" risk, directly tested.
12. **Missing settings.yaml on write → {ok:false}, file still absent:**
    `writeActiveProfiles('/no/such/root', ['gdpr'])` → `ok:false`, no file created.
13. **GATE INVARIANT (CAPTURE scenario):** with `active_profiles: [gdpr, eu-ai-act-high-risk]`,
    load `src/hooks/human-gate-check.js` and assert its `HUMAN_GATES` map still has exactly the
    three gate transitions (`implementation→functional`, `todo→implementation`,
    `done→review`) — i.e. gate COUNT is unchanged by compliance activation; and assert the
    compliance module exports NO function that mutates `enforcementMode` or `requireReviewGate`
    (grep the module's `module.exports` keys — none touch workflow gate keys). This proves
    activating compliance profiles cannot weaken any human gate (parent Success Metric 5 &
    Constraint, environment-profile precedent).

**Coverage Targets:** ≥ 80% line + branch on `compliance-regime.js`. Every branch of
`writeActiveProfiles` (missing file, no-line, union, round-trip-fail path) exercised. Every
resolver return path exercised.

### Security Review
- [x] Path traversal: `projectRoot` joined via `path.join`; profile names are compared as
      plain strings, never used to build a path in this module (the writer touches only the
      fixed `settings.yaml`).
- [x] Input validation: `profileNames` filtered to non-empty strings before union; non-array
      input coerced to `[]`.
- [x] No secrets.
- [x] Safe file operations: writes ONLY `.ctoc/settings.yaml` under the given root; targeted
      single-line replace, never arbitrary offsets. Tests confine writes to tmp dirs.
- [x] Error messages: none leak internal paths to end users (returns `{ ok:false }`, no throw).
- [x] Prototype pollution: no object-merge from untrusted input; profiles is a string array.
- [x] Command injection: no `exec`/`execSync`.
- [x] Gate safety: module exports NO gate/enforcement mutator (asserted by test 13).

## Execution Plan

### Step 8: TEST
Write `tests/compliance-mode.test.js` with all 13 cases (red — module absent).

### Step 9: PREPARE
Confirm `src/lib/safe-fs.js` and `src/lib/regulatory-regime.js` export as used; confirm
EC1-s1's `gdpr.yaml` is present (dependency). No new deps.

### Step 10: IMPLEMENT
Create `src/lib/compliance-regime.js` per the File Specification: `shouldRunGdpr`,
`shouldRunEuAiAct`, `writeActiveProfiles`, constants, JSDoc. Follow the standard lib module
pattern (imports → constants → JSDoc functions → `module.exports`).

### Step 11: REVIEW
Verify dependency direction (lib→lib only, no hook/command import); verify `writeActiveProfiles`
does targeted replace (no `JSON`/full re-serialize); verify wrong-root returns false.

### Step 12: OPTIMIZE
Keep the module thin — three functions + two constants; no abstraction beyond what the parent
mandates. No caching (reads are cheap and must be fresh — read-fresh principle).

### Step 13: SECURE
Run the security checklist above; specifically confirm the targeted-replace cannot corrupt
neighboring blocks (test 11) and no gate mutator exists (test 13).

### Step 14: VERIFY
`node --test tests/compliance-mode.test.js` → `# fail 0`; coverage ≥ 80%. Then full suite:
`node --test tests/*.test.js` → `# fail 0` (no regression, especially in gate + regime tests).

### Step 15: DOCUMENT
JSDoc on all three exports (already specified). Add a one-line module header comment stating
"one source of truth: regulatory_regime.active_profiles; no compliance.mode, no settings.json
mirror."

### Step 16: FINAL-REVIEW
Confirm the full truth table, graceful degradation, round-trip, targeted-replace, and gate
invariant all pass. Ready for batched Gate 2 with siblings s1, s3.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — confirmed MODULE_NOT_FOUND

### Step 9: PREPARE
- [x] Install dependencies if needed — none (safe-fs + regulatory-regime exist)
- [x] Check prerequisites — gdpr.yaml (EC1-s1) + eu-ai-act-high-risk.yaml present
- [x] Verify dev environment ready
- [x] Create directories/config if needed — none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling — fail-open reads + writes
- [x] Wire up integration points — derives from loadActiveProfiles (one source of truth)

### Step 11: REVIEW
- [x] Self-review all new code — dependency direction lib→lib only; no hook/command import
- [x] Verify integration points work together — round-trip write→read proven in tests
- [x] Check error handling completeness — missing file / no line / wrong root / fs throw all covered

### Step 12: OPTIMIZE
- [x] Remove redundant operations — thin module, no caching (read-fresh)
- [x] Optimize critical paths
- [x] Simplify complex code — three functions + one internal helper

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — profileNames never build a path; fixed settings.yaml only
- [x] Sanitize outputs — returns { ok, profiles }, no leaked paths
- [x] No secrets in code
- [x] Safe file operations — safeFs; targeted single-line replace; no gate mutator (test 13)

### Step 14: VERIFY
- [x] Run lint + type check — eslint . exit 0; tsc baseline-neutral
- [x] Run ALL tests (TDD Green) — 3172 pass, 0 fail
- [x] Check coverage >= 80% — every branch of writeActiveProfiles + both resolvers exercised
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — README lib module count 114→115
- [x] Add JSDoc comments to new functions — all three exports + module header
- [x] Update CHANGELOG if needed — n/a (README numbers updated + guard test)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review — plan remains in todo/ (executor does NOT cross Gate 2)

## Decisions Taken Under Ambiguity

1. **Argument order `writeActiveProfiles(projectRoot, profileNames)`** — the plan's
   File Specification (the CONTRACT) mandates `(projectRoot, profileNames)`; a
   dispatch brief used the reverse `(profiles, root?)`. Followed the plan contract.
   All `shouldRun*` take `(projectRoot)`.
2. **JSDoc `@param {string} projectRoot` (not optional) on `writeActiveProfiles`** —
   marking it optional while `profileNames` is required tripped tsc TS1016 (required
   param after optional) and broke the ratcheting typecheck baseline. Documented it
   as required; the runtime guard still returns `{ ok:false }` for a bad/missing root
   (fail-open preserved), so behavior is unchanged and the baseline stays neutral.
3. **Module comment does not spell the literal gate-key identifiers** — test 13b
   greps the module source for `enforcementMode`/`requireReviewGate` and asserts
   ABSENCE (proving the module cannot mutate a gate key). The reassuring prose was
   reworded to "the enforcement-mode or review-gate settings" so the guard stays
   strict rather than being weakened to accommodate documentation.
4. **`writeActiveProfiles([])` returns `{ ok: true, profiles: <current> }` with no
   write** — the plan says selecting `none` is a no-op OK; implemented as an early
   return before any fs write, leaving the file byte-identical.
5. **README count bump 114→115** — a new `src/lib` top-level module was added; bumped
   the structure line and the `115 JS modules` claim, and updated the two
   readme-numbers guard assertions (`countTopLevelJs === 115`, `/115 JS modules/`).
