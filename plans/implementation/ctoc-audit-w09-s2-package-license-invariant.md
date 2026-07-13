---
title: "W09-s2 — fix package.json version+license on disk; version/license single-source invariant test"
type: feature
parent_plan: "ctoc-audit-w09-release-metadata"
depends_on: none
files:
  - package.json
  - tests/helpers/metadata-invariant.js
  - tests/version-license-invariant.test.js
priority: MEDIUM
---

# W09-s2 — package.json truth + version/license invariant test

**Scope (one line):** Correct `package.json` on disk to its true values
(`version` 6.9.49 → the current `VERSION`; `license` `Apache-2.0` →
`PolyForm-Shield-1.0.0`) and add the version/license single-source invariant test,
built on a shared read+compare helper that W06 imports rather than reimplements.
Covers findings **H9** (wrong version + wrong license) and delivers vision Success
Criterion 8's invariant. **W09 owns the value fix; W06 owns the general
cross-file-invariant infrastructure** (W06's own Out-of-Scope says so).

## Implementation Details

### Architecture Decision (ADR)

**Context.** `package.json` reports `"version": "6.9.49"` (stale vs `VERSION` =
`6.10.3`) and `"license": "Apache-2.0"` (wrong vs `LICENSE` = "PolyForm Shield License
1.0.0", and vs `.claude-plugin/marketplace.json.plugins[0].license` =
`"PolyForm-Shield-1.0.0"`). The invariant test that locks these needs
`package.json.version` correct **on disk now** to pass at Step 14 — so the on-disk
value fix and the invariant test ship together in this one slice. Both this slice and
W06 need the SAME field-by-field comparison; two independently-authored copies would
recreate the exact drift class being fixed, at the test level.

**Decision.**
1. Edit `package.json`'s two fields to their true values (plain data edit; every other
   key byte-preserved).
2. Create ONE shared, importable read+compare helper at the canonical path
   `tests/helpers/metadata-invariant.js` (NOT a `*.test.js` file → the
   `node --test tests/*.test.js` glob ignores it; it lives in a subdir and lacks the
   `.test.js` suffix). It only READS sources and RETURNS raw values + mismatch lists —
   no assertions inside — so W09's acceptance test and W06's infrastructure test each
   layer their own assertions on it.
3. Version assertions are **relational** (`every field === VERSION`), never a
   hard-coded `6.10.3`, so the test does not rot on the next release. The license
   assertion is against the pinned project constant `"PolyForm-Shield-1.0.0"` (matching
   `marketplace.json`), plus a trace check that `LICENSE`'s text is the PolyForm Shield
   1.0.0 license.

**Consequences.** `npm view`/SBOM/scanners read the truth. The invariant goes RED on
any future version drift or a reverted license, GREEN now. W06 imports the same helper
(single source of the comparison logic).

### Dependency Graph

```
tests/version-license-invariant.test.js --imports--> tests/helpers/metadata-invariant.js
tests/helpers/metadata-invariant.js --reads--> VERSION, package.json,
    .claude-plugin/plugin.json, .claude-plugin/marketplace.json, LICENSE
(W06's version/license + registry-integrity tests will ALSO import the same helper)
(no dependency on sibling slices s1/s3 — independent)
```

No cycles.

### File Specifications

#### File: `package.json`
**Action:** MODIFY · **Change type:** data-value fix (two lines)
- Line 3: `"version": "6.9.49"` → `"version": "6.10.3"` (match the current `VERSION`
  file value at implementation time — read `VERSION` and use its exact contents;
  `6.10.3` is the confirmed current value).
- Line 5: `"license": "Apache-2.0"` → `"license": "PolyForm-Shield-1.0.0"`.
- Every other key (`name`, `description`, `private`, `engines`, `scripts`,
  `devDependencies`) and the 2-space formatting: **byte-preserved**. No structural
  change.

#### File: `tests/helpers/metadata-invariant.js`
**Action:** CREATE · **Change type:** new shared test helper (NOT run as a test)
Exports (CommonJS), all `root`-parameterized (default = repo root `path.resolve(__dirname, '..', '..')`):

- `readMetadata(root)` → returns raw values, no throwing on mismatch:
  ```
  {
    version: {
      VERSION:               <trim of root/VERSION>,
      'package.json':        <package.json .version>,
      'plugin.json':         <.claude-plugin/plugin.json .version>,
      'marketplace.metadata':<.claude-plugin/marketplace.json .metadata.version>,
      'marketplace.plugin':  <.claude-plugin/marketplace.json .plugins[0].version>
    },
    license: {
      'package.json':        <package.json .license>,
      'marketplace.plugin':  <.claude-plugin/marketplace.json .plugins[0].license>,
      licenseFileFirstLine:  <first non-empty line of root/LICENSE, trimmed>
    }
  }
  ```
- `collectVersionMismatches(meta)` → `Array<{ file, value }>`: every `version.*` entry
  whose value `!== meta.version.VERSION`. Empty array ⇒ all agree.
- `collectLicenseMismatches(meta, { expected })` → `Array<{ file, value }>`: entries in
  `{ 'package.json', 'marketplace.plugin' }` whose value `!== expected`. Empty ⇒ agree.
- Reads via `fs.readFileSync` + `JSON.parse` (plain `fs` is fine in a test helper).
  Pure functions; deterministic; no side effects.

#### File: `tests/version-license-invariant.test.js`
**Action:** CREATE · **Framework:** `node:test`
Imports `{ readMetadata, collectVersionMismatches, collectLicenseMismatches }` from
`./helpers/metadata-invariant`.

### Test Plan

Behavioral, relational — reads the REAL repo files; version assertions never hard-code
the number.

1. **All version fields agree with VERSION.** `const meta = readMetadata();`
   `assert.deepStrictEqual(collectVersionMismatches(meta), [])` — proves
   `VERSION === package.json.version === plugin.json.version ===
   marketplace.metadata.version === marketplace.plugins[0].version`. On failure the
   returned array names each mismatched file:value.
2. **License is the correct pinned identifier.** `assert.strictEqual(meta.license['package.json'], 'PolyForm-Shield-1.0.0')`
   and `assert.strictEqual(meta.license['package.json'], meta.license['marketplace.plugin'])`
   — and NOT `'Apache-2.0'`.
3. **License traces to the actual LICENSE file.** `assert.match(meta.license.licenseFileFirstLine, /PolyForm Shield License 1\.0\.0/)`
   — guards the manifest identifier from drifting away from the real license text.
4. **Mutating one version fails the invariant (RED-on-drift proof).** Build a fixture
   root (temp dir) mirroring the real files but with `plugin.json.version` mutated to a
   different value; `const bad = readMetadata(fixtureRoot);`
   `const m = collectVersionMismatches(bad);` `assert.ok(m.length >= 1)` and
   `assert.ok(m.some(x => x.file === 'plugin.json'))`. Proves the guard bites and names
   the offender.
5. **Reverting the license fails the invariant.** Fixture with
   `package.json.license = 'Apache-2.0'`; `collectLicenseMismatches(bad, { expected: 'PolyForm-Shield-1.0.0' })`
   is non-empty and names `package.json`.

**Coverage target:** the helper's read + both compare functions fully exercised
(agree path + mismatch path); ≥ 80% on the new helper.

### Security Review

- [x] Path traversal — helper paths are `path.join(root, ...)` over a test-controlled
  root; no user input.
- [x] Safe file ops — read-only helper; the only write is the two-field edit to the
  repo's own `package.json`.
- [x] No secrets. Error/mismatch output prints file names + version/license strings
  only (non-sensitive, already public metadata).
- [x] `JSON.parse` on trusted repo files; fixtures are test-authored. No prototype
  pollution (no untrusted merge).

## Execution Plan

### Step 8: TEST
Write `tests/helpers/metadata-invariant.js` and `tests/version-license-invariant.test.js`
FIRST. Confirm RED against the current tree BEFORE the `package.json` edit: case 1
fails (package.json.version `6.9.49` ≠ VERSION `6.10.3`), case 2 fails
(license `Apache-2.0`). Capture the failing output naming `package.json` as acceptance
evidence (the RED-before proof W06's paired-fix contract expects).

### Step 9: PREPARE
Read the current `VERSION` value at implementation time (do not assume; use its exact
contents for the `package.json.version` edit). **W06 coordination check:** search
`tests/` for an already-existing metadata/version-license comparison helper (e.g. from
W06 landing first). If one exists, IMPORT and reuse it instead of creating a second
copy; if not, create `tests/helpers/metadata-invariant.js` at this canonical path and
W06 imports from here. Either way there is exactly ONE comparison implementation.

### Step 10: IMPLEMENT
One step:
- (10a) Edit `package.json`: `version` → current `VERSION` value; `license` →
  `PolyForm-Shield-1.0.0`. Preserve all other keys/formatting byte-for-byte.
- (10b) Create `tests/helpers/metadata-invariant.js` with `readMetadata`,
  `collectVersionMismatches`, `collectLicenseMismatches` per the File Spec.
No stubs; working code. Log the "reuse vs create helper" outcome from Step 9 in
`## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Confirm the helper has no assertions inside (pure read+compare), lives outside the
`*.test.js` glob, and that version assertions are relational (grep the test for any
literal `6.10.3` — there must be none in a version assertion).

### Step 12: OPTIMIZE
Ensure a single read of each source file per `readMetadata` call; no duplicated parse
logic between the two compare functions.

### Step 13: SECURE
Walk the Security Review checklist; confirm read-only helper and the only production
write is the two-field `package.json` edit.

### Step 14: VERIFY
After the `package.json` edit, `node --test tests/version-license-invariant.test.js`
→ all green (invariant now satisfied on disk). `node --test tests/*.test.js` →
`# fail 0`, `# skipped 0`. `npm run lint` / `npm run typecheck` clean. Confirm the
helper file is NOT picked up as a test (it is under `tests/helpers/` and not
`*.test.js`).

### Step 15: DOCUMENT
JSDoc the three helper exports (params, return shape, "no assertions — callers assert").
Add a one-line comment atop the test noting the shared helper is the single
comparison source imported by both W09 and W06.

### Step 16: FINAL-REVIEW
Confirm acceptance criteria "package.json license matches LICENSE",
"version/license single-source invariant test", and "mutating one version value fails
the invariant test" each map to a green test. Hand to Gate 2 batch approval (do not
self-cross).

## Decisions Taken Under Ambiguity

- **Value fix + invariant test in ONE slice.** The invariant test requires
  `package.json.version` correct on disk to pass at Step 14; separating the fix from
  the test would leave the test RED and violate the no-stub / green-Step-14 rule for a
  slice. They are one unit of work.
- **Shared helper canonical path pinned to `tests/helpers/metadata-invariant.js`.**
  Resolves the W06 duplication risk named in both plans: whichever workstream lands
  first creates it here; the other imports it. Chosen over `src/lib/` because this is
  test-only infrastructure (runtime code never needs to compare all metadata sources) —
  keeping it out of the runtime surface. If W06 already created an equivalent helper at
  another path, import that instead (Step 9 check) to preserve the single-source rule.
- **Version assertions relational, license assertion constant.** `=== VERSION` (not a
  literal) so the test survives the next release; `'PolyForm-Shield-1.0.0'` is a stable
  project convention already carried by `marketplace.json` (not an SPDX-registered id —
  flagged in the parent plan's Business Risks), so it is asserted as a constant plus a
  trace to the real `LICENSE` text.
