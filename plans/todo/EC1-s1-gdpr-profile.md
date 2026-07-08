---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T14:26:07.827Z
gate_crossed: implementation → todo
---

---
title: "EC1-s1 — GDPR regulatory-regime profile (gdpr.yaml)"
type: implementation
parent_plan: EC1-compliance-mode-setting
depends_on: none
iron_loop: true
priority: HIGH
files:
  - .ctoc/regulatory-regimes/gdpr.yaml
  - tests/ec1-gdpr-profile.test.js
status: refined
risk_level: LOW
---

# EC1-s1 — GDPR regulatory-regime profile (gdpr.yaml)

Slice 1 of the EC1 decomposition. Adds a first-class `gdpr` regime profile alongside the
existing `eu-ai-act-high-risk.yaml`, so the regime system (`src/lib/regulatory-regime.js`)
can load it, `listAvailableProfiles()` surfaces it, and `effectiveControls()` union-merges
its controls when `gdpr` is in `active_profiles`. This is a DATA slice: one profile YAML plus
a loadability test that drives the REAL regime loader (`loadProfile`, `listAvailableProfiles`)
— no new module code.

Parent design (read in full): the single source of truth is
`regulatory_regime.active_profiles` in `.ctoc/settings.yaml`. This slice ships the profile
file that makes `gdpr` a valid, loadable profile name; the resolver (s2) and the ride-along
(s3) both reference it.

## Implementation Details

### Dependency Graph

```
.ctoc/regulatory-regimes/gdpr.yaml   (CREATE, data)
    └── loaded-by ──> src/lib/regulatory-regime.js:loadProfile(root,'gdpr')   (EXISTING, unchanged)
    └── listed-by ──> src/lib/regulatory-regime.js:listAvailableProfiles(root) (EXISTING, unchanged)
    └── tested-by ─> tests/ec1-gdpr-profile.test.js   (CREATE)
```

No `src/` code changes. The regime loader already exists and already parses block lists
correctly (the `parseYAMLShallow` list-item fix at regulatory-regime.js:117-127). This slice
only adds a data file the existing loader consumes and a test that proves it round-trips.

### File Specifications

#### File: `.ctoc/regulatory-regimes/gdpr.yaml`
**Action:** CREATE
**Purpose:** Declare the GDPR (Regulation (EU) 2016/679) regime profile — its required
controls and metadata — modeled exactly on the shape of `eu-ai-act-high-risk.yaml` and
`hipaa.yaml` so the existing `parseYAMLShallow` loader reads it without change.
**Change Type:** new-data-file

**Required shape** (keys the existing loader + parent acceptance criteria require):
- `name: gdpr` (MUST equal the filename stem — loader keys on `${profileName}.yaml`)
- `display_name: "General Data Protection Regulation (Regulation (EU) 2016/679)"`
- `description:` one line naming EU personal-data processing scope
- `authoritative_sources:` block list of `{ title, url }` maps (mirror eu-ai-act shape)
- `effective_date: "2018-05-25"`
- `applies_to:` one line (controllers/processors of EU personal data)
- `required_controls:` block list — `dsar_handler`, `retention_schedule`, `audit_hash_chain`
  (the three GDPR operational controls named in the parent's Decisions Taken Under Ambiguity;
  ALL THREE already exist in `KNOWN_CONTROLS` in regulatory-regime.js:22-76, verified:
  `dsar_handler` (line 71), `retention_schedule` (line 27), `audit_hash_chain` (line 24) —
  so `isControlEnabled` will not throw an "Unknown control" error).
- `retention:` map with `gdpr_dsar_log` (a valid RETENTION_CATEGORY, regulatory-regime.js:82)
  set to `1095` (3 years) to match the DEFAULT_RETENTION_DAYS convention.
- `notes: |` block — Art. 15 (DSAR), Art. 17 (erasure), Art. 30 (records), Art. 33 (breach
  notification 72h). No invented penalty figures beyond the statutory 20M EUR / 4% turnover.

**Constraints (grounded in the real parser):**
- Block lists use `  - value` two-space-then-dash indentation (parseYAMLShallow list-item
  branch at regulatory-regime.js:117). Do NOT use inline `[a, b]` for `required_controls`
  (the shallow parser's list handling is block-oriented; every shipped profile uses block form).
- Every control string MUST be a member of `KNOWN_CONTROLS` — otherwise a downstream
  `isControlEnabled` call throws. Only the three named controls are used; all verified present.

#### Cross-Platform Notes
- Pure data file, no path handling. The loader (`loadProfile`) already uses `path.join`
  (regulatory-regime.js:235). Nothing OS-specific here.

### Test Plan

#### Tests: `tests/ec1-gdpr-profile.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), mirroring `tests/menu-environment.test.js`
tmp-project pattern (mkdtempSync + copy the real profile dir).

Because `loadProfile`/`listAvailableProfiles` take a `projectRoot` and read
`.ctoc/regulatory-regimes/`, the test copies the REAL repo `gdpr.yaml` (and at least one
sibling, e.g. `eu-ai-act-high-risk.yaml`) into a tmp project's `.ctoc/regulatory-regimes/`,
then calls the real exported functions from `src/lib/regulatory-regime.js`.

**Test Cases:**
1. **Loadable + correct shape (CAPTURE scenario "gdpr.yaml is valid and loadable"):**
   `loadProfile(tmpRoot, 'gdpr')` returns an object with `name === 'gdpr'`, a non-empty
   `display_name`, a non-empty `description`, a non-empty `applies_to`, and
   `Array.isArray(required_controls) && required_controls.length >= 3`.
2. **Controls are the three intended + all in KNOWN_CONTROLS:** the returned
   `required_controls` include `dsar_handler`, `retention_schedule`, `audit_hash_chain`; and
   every one satisfies `KNOWN_CONTROLS.has(c)` (import `KNOWN_CONTROLS` from the module).
3. **Discovery (CAPTURE scenario):** `listAvailableProfiles(tmpRoot)` returns an array that
   `.includes('gdpr')`.
4. **effectiveControls activates gdpr controls when active:** write a tmp `settings.yaml`
   with `regulatory_regime.active_profiles: [gdpr]`, then
   `effectiveControls(tmpRoot).has('dsar_handler') === true`. (Drives the REAL union-merge.)
5. **isControlEnabled does not throw for the gdpr controls:** `isControlEnabled(tmpRoot,
   'dsar_handler')` returns a boolean (no "Unknown control" throw) — proves every control
   string is in the vocabulary.

**Coverage Targets:** the profile is data, so "coverage" = every declared key is asserted and
every control is proven to be a known control. Error path: an unknown-profile call
(`loadProfile(tmpRoot,'nope')`) returns `null` (existing behavior) — asserted as a guard so a
future typo in the filename is caught.

### Security Review
- [x] Path traversal: N/A — profile name is a fixed literal `'gdpr'` in tests; the loader
      already constrains reads to `PROFILES_DIR` via `path.join`.
- [x] Input validation: control strings validated against `KNOWN_CONTROLS` by the existing
      `isControlEnabled`; the test asserts membership.
- [x] No secrets: pure regulatory metadata, public URLs only.
- [x] Safe file operations: test writes only under an `os.tmpdir()` mkdtemp dir; cleaned in
      `after()`.
- [x] Gate safety: a profile file cannot touch any human gate — it only declares controls.
      No gate key (`requireReviewGate`, `enforcementMode`) appears in the YAML.

## Execution Plan

### Step 8: TEST
Write `tests/ec1-gdpr-profile.test.js` with the five cases above (red — `gdpr.yaml` absent).

### Step 9: PREPARE
Confirm `.ctoc/regulatory-regimes/` exists and that `dsar_handler`, `retention_schedule`,
`audit_hash_chain` are in `KNOWN_CONTROLS` (verified at plan time). No deps to install.

### Step 10: IMPLEMENT
Create `.ctoc/regulatory-regimes/gdpr.yaml` per the File Specification. Model the exact YAML
shape on `eu-ai-act-high-risk.yaml` (block lists, `retention:` map, `notes: |`).

### Step 11: REVIEW
Verify the YAML round-trips through `parseYAMLShallow` (via `loadProfile`) — every list item
parses (no empty `required_controls`), `name` matches the filename stem.

### Step 12: OPTIMIZE
Keep the profile minimal — only the three mandated controls; no speculative extras (parent
decision: additional GDPR controls are the human's future scheduling choice, not this slice's).

### Step 13: SECURE
Confirm no control string outside `KNOWN_CONTROLS`; no gate/enforcement key present; test
writes stay under tmp.

### Step 14: VERIFY
`node --test tests/ec1-gdpr-profile.test.js` → `# fail 0`. Then run the full suite to confirm
no regression in `regulatory-regime`-touching tests.

### Step 15: DOCUMENT
Add the `gdpr` line to the `Available profiles` comment list in `.ctoc/settings.yaml`
(comment only — does NOT change `active_profiles`, so it is a safe additive doc edit and needs
no gate). One-line entry: `#   - gdpr  (EU General Data Protection Regulation, Regulation (EU) 2016/679)`.

### Step 16: FINAL-REVIEW
Confirm all five acceptance-mapped tests pass, the profile loads, and `listAvailableProfiles`
includes `gdpr`. Ready for batched Gate 2 with siblings s2, s3.


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
