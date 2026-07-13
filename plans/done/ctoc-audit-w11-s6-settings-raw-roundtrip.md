---
approved_by: human
approved_at: 2026-07-13T18:37:06.051Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.674Z
gate_crossed: implementation → todo
---

---
title: "W11-s6 — settings.js setSetting: raw round-trip preserves non-schema blocks (deployment/sync)"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/lib/settings.js
  - tests/settings.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s6 — setSetting preserves non-schema config

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A. Finding: M16.
> Independent (no dependency).

## Implementation Details

### Architecture Decision (ADR)

`src/lib/settings.js` `setSetting()` (line 232) calls `loadSettings()` (line 233), which
merges ONLY the `SETTINGS_SCHEMA` categories (`general`, `agents`, `workflow`, `learning`,
`git`, `privacy`, `plan_index` — see `loadSettings` iterating `SETTINGS_SCHEMA` at lines
200-208), then `saveSettings()` writes that schema-only object back (line 236). Any
top-level key NOT in the schema — concretely `deployment` (read by `src/lib/deployment.js`)
and any future `sync` block — is silently dropped on the next `setSetting` (parent §M16).

**Fix:** `setSetting` must read/write the RAW sparse object. The primitive already exists:
`readRawSettings()` (line 161) reads the file without merging defaults. Rewrite `setSetting`
to `readRawSettings` → mutate the one category/key → `saveSettings(raw)`. Non-schema blocks
survive because they are never dropped from the raw object. Reads (`getSetting`,
`getCategorySettings`, `loadSettings`) are UNCHANGED — they still merge schema + environment
profile + default, which is correct for reading.

**Fresh-project edge (M16 edge):** `readRawSettings` returns `{}` when the file is absent →
`setSetting` writes only the one category/key → no crash, no fabricated `deployment`/`sync`.

**Behavior change to note:** after this fix, `setSetting` writes a SPARSE file (only what was
present + the change) rather than the fully-populated schema object it writes today. Reads
are unaffected (defaults still fill at load). Any test asserting the on-disk file contains
all schema categories after `setSetting` must be updated to the sparse expectation.

### Dependency Graph
```
src/lib/settings.js → setSetting now uses readRawSettings (line 161) + saveSettings (line 214);
                      no new imports. (toggleSetting → getSetting[merged read] + setSetting[raw write] — fine.)
tests/settings.test.js → add round-trip + fresh-project tests
```

### File Specifications

#### `src/lib/settings.js` — MODIFY (setSetting only)
```
function setSetting(category, key, value, projectPath = process.cwd()) {
  const raw = readRawSettings(projectPath);
  if (!raw[category] || typeof raw[category] !== 'object') raw[category] = {};
  raw[category][key] = value;
  saveSettings(raw, projectPath);
}
```
Do NOT change `loadSettings`, `getSetting`, `getCategorySettings`, `saveSettings`,
`toggleSetting`, the schema, or the environment-profile logic.

### Test Plan — `tests/settings.test.js` (MODIFY: add; keep existing green)
1. **Preserves non-schema blocks (M16 core, RED on main):** write a raw `settings.json`
   containing a `deployment` block AND a `sync` block alongside a normal `workflow` block.
   Call `setSetting('workflow','enforcementMode','soft', dir)`. Re-read the RAW file
   (`readRawSettings` or `JSON.parse(readFileSync)`) and assert `deployment` and `sync` are
   byte-for-byte intact AND `workflow.enforcementMode === 'soft'`. On current `main` the
   blocks are gone → RED.
2. **Fresh project, no phantom keys (M16 edge):** no `settings.json`; `setSetting` once;
   assert the file contains ONLY the written category/key — no fabricated `deployment`/`sync`,
   no crash.
3. **Existing settings tests still green** — verify any that assert on the written file shape;
   update to the sparse expectation if needed. Also check `tests/runner-settings.test.js` in
   Step 14 (not edited here) still passes.

### Security Review
- [ ] No new inputs; `category`/`key`/`value` are internal. No prototype-pollution vector
      introduced: assign to `raw[category][key]` where category/key come from CTOC's own schema
      call sites (not untrusted web input); still, guard `raw[category]` is a plain object.
- [ ] Preserving `deployment`/`sync` prevents silent loss of deploy config — a correctness/
      safety improvement.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Add tests 1-2 to `tests/settings.test.js`. Run — the non-schema-preservation test fails
      on current `main`.

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:` (settings.js, settings.test.js). Confirm
      `readRawSettings` (line 161) present.

### Step 10: IMPLEMENT
- [ ] `src/lib/settings.js`: rewrite `setSetting` to the raw round-trip above. No other change.

### Step 11: REVIEW
- [ ] Confirm reads (`getSetting`/`loadSettings`) still merge defaults; only the write path
      changed to sparse/raw.

### Step 12: OPTIMIZE
- [ ] N/A.

### Step 13: SECURE
- [ ] Security checklist above; confirm no prototype-pollution surface.

### Step 14: VERIFY
- [ ] `node --test tests/settings.test.js tests/runner-settings.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [ ] One-line comment on `setSetting` noting it round-trips the RAW file to preserve
      non-schema blocks.

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Reuse `readRawSettings`** (already exported) rather than add a primitive — the parent
  explicitly notes the raw round-trip primitive already exists.
- **Only `setSetting` changes** — reads intentionally keep merging schema/profile/defaults.
- **Sparse on-disk file after write** — accepted; reads fill defaults, so behavior is
  preserved and non-schema blocks survive.
