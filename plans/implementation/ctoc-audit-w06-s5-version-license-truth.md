---
title: "W06-s5 — Version and license single-source-of-truth; release.test guards the real artifact"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/helpers/source-of-truth.js
  - tests/release.test.js
priority: HIGH
---

# W06-s5 — Version/license single-source-of-truth; release.test guards the real artifact

**Stories:** S6, S9 — findings **B1–B6**.
**Pairing:** SIBLING-PAIRED with **W09 (Release and metadata truth)**. This slice adds
the invariant that goes RED on today's real drift; W09's production fix (correct
`package.json`'s version + license; make `release.js` sync `package.json`) turns it GREEN.
W06 corrects **no** metadata value — it only witnesses. The shared reader is placed so
W09 can import the same logic (the "one shared helper, don't duplicate assertion logic"
coordination the functional plan calls for).

## Implementation Details

### Architecture Decision

`tests/release.test.js` today asserts the release **script's sync logic** against synthetic
temp fixtures it creates itself (`createVersionFile`, `getVersion(TEST_VERSION_FILE)`, …).
It **never reads the real `package.json`/`plugin.json`/`marketplace.json`/`LICENSE`** and
so cannot see that the shipped artifact drifted. That is exactly how `package.json` came to
self-report version `6.9.49` (VERSION says `6.10.3`) and license `Apache-2.0` (the real
`LICENSE` is PolyForm Shield 1.0.0) under a fully green suite.

Fix: a shared reader `tests/helpers/source-of-truth.js` that reads the **real** on-disk
sources, and real-artifact assertions added to `tests/release.test.js` that use it. The
synthetic sync-logic tests stay (they test the script and are legitimate); the new
assertions read the actual files so a real drift fails the test.

### RED-now evidence (verified 2026-07-13)
| Source | Value today |
|---|---|
| `VERSION` | `6.10.3` |
| `package.json.version` | `6.9.49`  ← **drift** |
| `.claude-plugin/plugin.json.version` | `6.10.3` |
| `.claude-plugin/marketplace.json` ctoc entry | `6.10.3` |
| `package.json.license` | `Apache-2.0` ← **drift** |
| `LICENSE` (first line) | `PolyForm Shield License 1.0.0` |

So the version-agreement assertion FAILS (`6.9.49 ≠ 6.10.3`) and the license-agreement
assertion FAILS (`Apache-2.0 ≠ PolyForm Shield 1.0.0`) on today's tree.

### Dependency Graph

```
tests/helpers/source-of-truth.js  --reads--> VERSION, package.json,
   .claude-plugin/{plugin,marketplace}.json, LICENSE   (real files, project root)
tests/release.test.js  --require--> tests/helpers/source-of-truth.js
W09 (sibling) --MAY import--> tests/helpers/source-of-truth.js  (coordination point)
```

Self-contained within W06 (2 files, one importing the other). No other slice touches
either file. Independent of s1–s4, s6, s7.

### File Specifications

#### `tests/helpers/source-of-truth.js` (CREATE — shared reader, W09 coordination)
- `readVersionSources(root = projectRoot) -> { VERSION, packageJson, pluginJson, marketplace }`
  — reads each real file, returns the version string found in each (marketplace: the ctoc
  plugin entry's version). Missing/unparseable file → the field is `null` (so the
  assertion fails loudly rather than throwing opaquely).
- `readLicenseSources(root) -> { declared, actual }` — `declared` = `package.json.license`;
  `actual` = a normalized identifier derived from `LICENSE`'s first non-empty line
  (e.g. maps `"PolyForm Shield License 1.0.0"` → a stable token; the assertion compares
  the declared SPDX-ish string against what `LICENSE` actually is).
- `allVersionsAgree(sources) -> { ok, values }` — `ok` iff all non-null version values are
  equal; `values` is the per-file map for the failure message.
- Pure reads; no writes. `projectRoot = path.join(__dirname, '..', '..')`.

#### `tests/release.test.js` (MODIFY — add real-artifact assertions)
Add a `describe('release artifact is the single source of truth', …)` block using the
helper (keep all existing synthetic sync-logic tests):
- `it('VERSION, package.json, plugin.json, marketplace.json versions all agree')` — assert
  `allVersionsAgree(readVersionSources()).ok`; failure lists each file next to its value.
- `it('package.json license equals the actual LICENSE file')` — assert
  `declared === actual`; failure prints both the declared and the actual license strings.
- These read via `fs.readFileSync` + `JSON.parse` on the **real** files (satisfying the
  parent's "reads that value from the actual `package.json` … not a hand-copied literal"
  acceptance criterion).

### Test Plan
RED-now: `node --test tests/release.test.js` on today's tree → the two new assertions
FAIL (version `6.9.49 ≠ 6.10.3`; license `Apache-2.0 ≠ PolyForm Shield 1.0.0`), each
printing every file next to its value. GREEN-after: once **W09** corrects `package.json`,
the same run passes; the pre-existing synthetic sync-logic tests remain green throughout.

### Security Review
- [x] Path traversal: fixed project-root-relative reads; no user input.
- [x] Read-only; the helper never writes; no network; no `execSync`.
- [x] License parse reads only the first non-empty line of `LICENSE` — no eval of file
  contents.
- [x] Failure messages contain version strings / license identifiers only (public data).

## Execution Plan

### Step 8: TEST
Create `tests/helpers/source-of-truth.js` and add the two real-artifact assertions to
`tests/release.test.js`. Run `node --test tests/release.test.js` on today's tree and
**capture the RED output** showing the version and license drift with every file's value
listed. This RED is the acceptance evidence for S6/S9. Log: "GREEN pairing is W09."

### Step 9: PREPARE
Confirm the five real sources exist and are shaped as read (verified 2026-07-13). Confirm
`tests/helpers/` is an acceptable location (create the dir if absent — it is inside the
whitelisted `tests/` tree).

### Step 10: IMPLEMENT
One step, file sub-items — the witness (no metadata value corrected here; that is W09):
- [ ] `tests/helpers/source-of-truth.js` — `readVersionSources`, `readLicenseSources`,
  `allVersionsAgree`
- [ ] `tests/release.test.js` — add the real-artifact `describe` block using the helper;
  keep existing synthetic tests

### Step 11: REVIEW
Verify the new assertions read the **real** files (not the temp fixtures the existing
tests build). Verify `null` fields (missing/unparseable source) fail loudly rather than
passing. Confirm the license normalization does not accidentally equate Apache with
PolyForm.

### Step 12: OPTIMIZE
Read each source once; share the parsed objects within an assertion. No duplication of the
read logic between the two new `it`s — both go through the helper.

### Step 13: SECURE
Confirm no source file is `require`d as code (JSON is parsed with `JSON.parse`, LICENSE is
read as text). No path escapes the repo root.

### Step 14: VERIFY
Today's tree: `node --test tests/release.test.js` → the two new assertions RED (expected;
paired fix pending W09), existing synthetic tests still GREEN. Failure output lists each
file next to its version and prints both license strings. Record as the paired-fix witness.

### Step 15: DOCUMENT
Header comment in `tests/helpers/source-of-truth.js` naming findings B1–B6, the W09
pairing, and that W09 may import this helper (the shared-reader coordination point).

### Step 16: FINAL-REVIEW
Confirm: shared reader created; real-artifact assertions added and reading real files;
RED captured (version + license drift, all files listed); existing tests preserved; W09
coordination documented. Ready for the batched Gate 2.

## Decisions Taken Under Ambiguity
- **Helper under `tests/helpers/`, not `src/lib/`.** The functional plan scopes W06 to
  "tests and test infrastructure," so the shared reader lives in the test tree. If W09
  prefers it in `src/lib/` for the release script to import at runtime, that relocation is
  W09's call at its own gate; W06 provides importable logic and names the coordination
  point rather than pre-deciding W09's file layout.
- **Version + license folded into one slice.** Both are the same concern (the real
  artifact must equal its sources) and both pair with W09; splitting them would duplicate
  the reader and the RED witness.
- **License normalized to a stable token** rather than a byte-equal `LICENSE` compare, so
  the assertion is about *which license* (PolyForm vs Apache), not incidental formatting.
