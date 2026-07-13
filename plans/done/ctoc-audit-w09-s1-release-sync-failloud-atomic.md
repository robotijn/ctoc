---
approved_by: human
approved_at: 2026-07-13T18:37:06.004Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.577Z
gate_crossed: implementation → todo
---

---
title: "W09-s1 — release.js: sync package.json, fail loud on partial sync, atomic writes"
type: feature
parent_plan: "ctoc-audit-w09-release-metadata"
depends_on: none
files:
  - src/scripts/release.js
  - tests/release-metadata-sync.test.js
priority: MEDIUM
---

# W09-s1 — release.js: sync package.json, fail loud, atomic writes

**Scope (one line):** Teach `release.js` to sync `package.json.version`, exit
non-zero (naming the file) on any partial sync failure, and write every JSON target
atomically (temp-file + rename) — with a NEW behavioral test file that drives the
REAL exported script against fixtures. Covers findings **M7** (silent partial sync,
non-atomic write, `package.json` omitted from sync). Does **not** touch the on-disk
`package.json` values (slice s2) nor `tests/release.test.js` (W06 territory).

## Implementation Details

### Architecture Decision (ADR)

**Context.** `src/scripts/release.js` today (1) omits `package.json` from
`JSON_VERSION_FILES` (lines 20-34), (2) swallows a per-file `JSON.parse` failure with
`console.error` + `continue` and never propagates it, so `main()` always resolves and
the process exits 0 even after a logged failure (lines 77-82, 142-160), and (3) writes
each target with a single `safeFs.writeFileSync(...)` (line 107) — a crash mid-write
can truncate the file. It also calls `main()` unconditionally at module load (line
162) and hard-codes `ROOT` from `__dirname`, so the real script is **not drivable in a
test** against a fixture repo.

**Decision.**
1. Add `package.json` to the sync-target list (`version` path only).
2. Make every sync function return `{ updated, failures }`; `main()` exits non-zero
   iff `failures.length > 0`, printing the failing file names to stderr.
3. Introduce `atomicWriteFileSync(filePath, data, { rename } = {})` — write to a
   sibling temp path, then `renameSync` over the target; on any error unlink the temp
   and rethrow. `rename` is an injectable seam (default `safeFs.renameSync`) so a test
   can simulate a crash *during the rename* deterministically and cross-platform.
4. Guard the entrypoint: `if (require.main === module) process.exit(main());`, make
   `ROOT` overridable via `process.env.CTOC_RELEASE_ROOT`, and thread an optional
   `root` param through `getVersion` / `updateJsonVersionFiles` /
   `updateVersionInFiles` / `main` so the REAL script runs against a fixture both
   in-process and as a subprocess.

**Consequences.** The real production functions become importable and behaviorally
testable. Requiring the module no longer mutates the live repo. `main` returns an exit
code (testable in-process) while the CLI path still `process.exit`s. No behavior change
for the two already-working targets (`plugin.json`, `marketplace.json`).

### Dependency Graph

```
tests/release-metadata-sync.test.js --imports--> src/scripts/release.js (exported fns + JSON_VERSION_FILES)
src/scripts/release.js --uses--> src/lib/safe-fs (writeFileSync, renameSync, unlinkSync, existsSync, readFileSync)
(no dependency on any sibling slice — independent)
```

No cycles. This slice does not import from s2 or s3.

### File Specifications

#### File: `src/scripts/release.js`
**Action:** MODIFY · **Change type:** modify-existing + new-function

- **Add** to `JSON_VERSION_FILES` (after the `plugin.json` entry, line ~33) a third
  entry — **`version` path only** (license is a static value fixed in s2, never
  derived from `VERSION`):
  ```js
  {
    file: 'package.json',
    updates: [ { path: ['version'] } ]
  }
  ```
- **Change** `ROOT` (line 16) to honor an env override for testability:
  ```js
  const ROOT = process.env.CTOC_RELEASE_ROOT
    ? path.resolve(process.env.CTOC_RELEASE_ROOT)
    : path.resolve(__dirname, '..', '..');
  ```
- **Add** `atomicWriteFileSync(filePath, data, { rename = safeFs.renameSync } = {})`:
  - `const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;`
  - `safeFs.writeFileSync(tmp, data);` then `rename(tmp, filePath);`
  - on any thrown error: best-effort `if (safeFs.existsSync(tmp)) safeFs.unlinkSync(tmp);` then `throw err;`
  - Cross-platform: temp is a sibling in the **same directory** as `filePath` so the
    rename is same-filesystem (POSIX-atomic / Windows `MoveFileEx`); uses
    `safeFs.renameSync` (no hand-rolled rename).
- **Change** `getVersion()` → `getVersion(root = ROOT)`; read
  `path.join(root, 'VERSION')`. Keep the existing format guard + thrown Error.
- **Change** `updateJsonVersionFiles(version)` → `updateJsonVersionFiles(version, root = ROOT)`
  returning `{ updated, failures }`:
  - For a target that **exists**: a `JSON.parse` throw → push `config.file` to
    `failures` (was: `console.error` + `continue`). A required update path missing
    (`obj == null` after the walk) → push to `failures`. A write throw from
    `atomicWriteFileSync` → push to `failures`. Replace the raw `safeFs.writeFileSync`
    at line 107 with `atomicWriteFileSync(filePath, JSON.stringify(json, null, 2) + '\n')`.
  - A target that is **not found** → keep the current `Skip` log (NOT a failure) so
    optional targets stay optional.
- **Change** `updateVersionInFiles(version)` → `updateVersionInFiles(version, root = ROOT)`
  returning `{ updated, failures }`; a write throw → `failures`. Use
  `atomicWriteFileSync` for the doc write too. Not-found → `Skip`.
- **Change** `main()` → `main(root = ROOT)` **returning a number**:
  - `try { const version = getVersion(root); ... }` — on a thrown `getVersion` error,
    print `Release failed: <msg>` to stderr and `return 1`.
  - Collect `failures` from both sync calls; if `failures.length > 0`, print
    `Release failed: could not sync ${failures.length} file(s): ${failures.join(', ')}`
    to **stderr** and `return 1`; else print `Done.` and `return 0`.
- **Replace** the bottom `main();` (line 162) with
  `if (require.main === module) { process.exit(main()); }`.
- **Add** `module.exports = { getVersion, updateJsonVersionFiles, updateVersionInFiles, atomicWriteFileSync, main, JSON_VERSION_FILES, VERSION_UPDATES };`

**Error handling:** every I/O failure on an existing target is captured as a named
failure and surfaced on stderr; `main` never returns 0 when any target failed.
**Called by:** the CLI (`node src/scripts/release.js`, `require.main === module`) and,
new, `tests/release-metadata-sync.test.js`.

#### File: `tests/release-metadata-sync.test.js`
**Action:** CREATE · **Framework:** `node:test` (`describe`/`test`/`assert`),
`os.mkdtemp` fixtures (mirrors the fixture style already in `tests/release.test.js`,
but a SEPARATE file — do not edit `tests/release.test.js`, which W06/S9 rewrites).

Imports the REAL exports: `const { updateJsonVersionFiles, JSON_VERSION_FILES, atomicWriteFileSync, main } = require('../src/scripts/release');` and the script path for subprocess runs.

### Test Plan

Behavioral only — asserts field values, exit codes, and on-disk bytes; never internal
structure.

1. **package.json is a sync target (happy path).** Fixture root with `VERSION`=`2.0.0`
   and `package.json` `{version:'1.0.0', license:'X', private:true, scripts:{test:'t'}}`.
   Call `updateJsonVersionFiles('2.0.0', fixtureRoot)` (real fn, real
   `JSON_VERSION_FILES`). Assert fixture `package.json.version === '2.0.0'` AND
   `license`, `private`, `scripts` are byte-preserved (mitigates the "collides with
   other keys" risk).
2. **All three JSON targets sync from VERSION.** Fixture with marketplace.json
   (`metadata.version` + `plugins[0].version`), plugin.json (`version`), package.json
   (`version`) all at `1.0.0`; run → all five version fields === `2.0.0`.
3. **Fail loud — in-process (portable).** Fixture where `package.json` contains
   **invalid JSON** (exists but unparseable). `assert.strictEqual(main(fixtureRoot), 1)`.
   (Deterministic, no chmod, cross-platform.)
4. **Fail loud — literal non-zero exit (subprocess).** `spawnSync(process.execPath,
   [releaseScriptPath], { env: { ...process.env, CTOC_RELEASE_ROOT: fixtureBadJson },
   encoding:'utf8' })` → assert `result.status !== 0` AND `result.stderr` names
   `package.json`. This is the literal "a sync failure makes it exit non-zero."
5. **Success exits 0 (subprocess + in-process).** All-good fixture →
   `spawnSync(...).status === 0`; `main(fixtureAllGood) === 0`.
6. **Atomic write — no truncation on rename crash (RECOMMENDED injectable seam).**
   Pre-write a target with OLD valid JSON. Call `atomicWriteFileSync(target, NEW, {
   rename: () => { throw new Error('simulated crash during rename'); } })` and
   `assert.throws`. Then assert: (a) the target still parses as the FULL OLD JSON
   (never truncated/partial), and (b) no `*.tmp-*` residue remains in the directory
   (temp was cleaned up). Cross-platform, deterministic — exercises the temp→rename
   window directly.
7. **Atomic write — no residue on success.** After a normal
   `updateJsonVersionFiles(...)`, assert the target is valid JSON and `readdirSync` of
   its directory shows no leftover `*.tmp-*` file.

**Coverage target:** all new/changed branches in `release.js` (success, parse-failure,
write-failure, not-found skip, atomic cleanup) exercised; ≥ 80% on changed lines.

### Security Review

- [x] Path traversal — all paths are `path.join(root, config.file)` over a
  test/CLI-controlled root; no user input. Temp path is a sibling of a computed target.
- [x] Safe file ops — writes only to the computed target and its sibling temp; routed
  through `safeFs` (NUL/empty-path guard). No arbitrary-location writes.
- [x] No secrets; no `execSync` of interpolated input (subprocess test uses an argv
  array via `spawnSync`, not a shell string).
- [x] Error messages name only the config-relative file (`package.json`), no absolute
  paths leaked beyond stderr diagnostics.
- [x] Temp-file cleanup on failure prevents `*.tmp-*` litter (prototype pollution N/A —
  no untrusted object merge).

## Execution Plan

### Step 8: TEST
Write `tests/release-metadata-sync.test.js` FIRST (TDD-red). Encode behaviors 1-7
above. Confirm RED against the current tree: cases 1-2 fail (package.json not in
sync set), 3-4 fail (main exits 0 / returns undefined on a parse failure today), 6-7
fail (`atomicWriteFileSync` and the exports do not exist yet; require throws because
`main()` runs on load). Capture the failing output as acceptance evidence.

### Step 9: PREPARE
Confirm `src/lib/safe-fs` exposes `writeFileSync`, `renameSync`, `unlinkSync`,
`existsSync`, `readFileSync` (verified: it does). No new dependency. Confirm
`tests/release.test.js` is NOT in this slice's `files:` (must stay untouched — W06/S9).

### Step 10: IMPLEMENT
One step; edit `src/scripts/release.js`:
- (10a) Add the `package.json` entry (`version` path only) to `JSON_VERSION_FILES`.
- (10b) Add `atomicWriteFileSync(filePath, data, { rename } = {})` with temp→rename +
  temp cleanup on error.
- (10c) Env-override `ROOT`; thread `root` through `getVersion` /
  `updateJsonVersionFiles` / `updateVersionInFiles` / `main`.
- (10d) Return `{ updated, failures }` from both sync fns; treat parse / missing-path /
  write errors on existing targets as failures; keep not-found as skip. Swap the raw
  write for `atomicWriteFileSync`.
- (10e) `main(root)` returns 1 on any failure (stderr names files) else 0; guard the
  entrypoint with `require.main === module` + `process.exit(main())`; add
  `module.exports`.
No stubs — all branches return working code. Record any judgment call in
`## Decisions Taken Under Ambiguity` below.

### Step 11: REVIEW
Verify dependency direction (script → lib/safe-fs only), single responsibility of
`atomicWriteFileSync`, and that the two already-working targets are unchanged in
behavior. Confirm no import of a sibling slice.

### Step 12: OPTIMIZE
Ensure `atomicWriteFileSync` is the single write path for all JSON targets (no
duplicated temp/rename logic). No redundant re-reads.

### Step 13: SECURE
Walk the Security Review checklist above; confirm `spawnSync` uses an argv array (no
shell), temp cleanup runs on the error path, and `safeFs` guards every path.

### Step 14: VERIFY
`node --test tests/release-metadata-sync.test.js` → all green. `node --test tests/*.test.js`
→ `# fail 0`, `# skipped 0` (the existing `tests/release.test.js` still passes: it
defines its own local functions and never required this module, and now requiring the
module no longer auto-runs `main()`). `npm run lint` and `npm run typecheck` clean.

### Step 15: DOCUMENT
Update the header comment block in `release.js` to list `package.json` among synced
files and to note the fail-loud + atomic-write contract. JSDoc `atomicWriteFileSync`
and the new `{ updated, failures }` return shape.

### Step 16: FINAL-REVIEW
Confirm acceptance criteria "package.json version syncs with release", "release fails
loudly on a partial sync failure", "release succeeds cleanly reports exit 0", and
"atomic write survives a simulated mid-write crash" each map to a green test. Hand to
Gate 2 batch approval (do not self-cross).

## Decisions Taken Under Ambiguity

- **`ROOT` env override name `CTOC_RELEASE_ROOT`.** Needed so the subprocess exit-code
  test can point the REAL script at a fixture. Chosen over argv parsing (smaller
  surface, no arg-order coupling). Documented; the CLI default path is unchanged.
- **Not-found target = skip, not failure.** Only a target that EXISTS but fails to
  parse / is missing an expected path / fails to write counts as a sync failure. This
  preserves the existing optional-doc (`README.md`) behavior and matches the acceptance
  criterion's example (a write failure), avoiding a false non-zero exit when an
  optional doc is simply absent.
- **`package.json` gets the `version` path only.** `license` is a static value
  corrected on disk in slice s2 and is NOT derived from `VERSION`; syncing it here
  would be wrong. Mirrors the existing `plugin.json` config exactly.
- **Injectable `rename` seam for the atomicity test.** Simulating "crash during
  rename" via filesystem permissions is not portable (POSIX rename ignores file mode;
  Windows differs). A default-valued `rename` parameter (default `safeFs.renameSync`)
  is a minimal dependency-injection seam consistent with the repo's existing safe-fs
  indirection, and makes the no-truncation guarantee deterministically testable.


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
