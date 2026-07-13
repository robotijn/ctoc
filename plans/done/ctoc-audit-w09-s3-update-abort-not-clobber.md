---
approved_by: human
approved_at: 2026-07-13T18:37:06.178Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.650Z
gate_crossed: implementation → todo
---

---
title: "W09-s3 — update.js: abort (non-zero, leave file untouched) on corrupt installed_plugins.json"
type: feature
parent_plan: "ctoc-audit-w09-release-metadata"
depends_on: none
files:
  - src/commands/update.js
  - tests/update-registry-abort.test.js
priority: MEDIUM
---

# W09-s3 — update.js: abort, never clobber the plugin registry

**Scope (one line):** Change `/ctoc:update`'s handling of an unparseable
`installed_plugins.json` from "silently default to empty and overwrite" to "abort with
a non-zero exit and leave the corrupt bytes completely untouched" — preserving every
other plugin's registration. Covers finding **M9**.

## Implementation Details

### Architecture Decision (ADR)

**Context.** `src/commands/update.js:190-215` reads `installed_plugins.json`, parses it
in a `try` whose `catch` is **empty** (comment: `// Use default if file is
corrupted`), leaving `installed` at its line-191 default `{ version: 2, plugins: {} }`,
then **unconditionally** writes that back at line 215. When the parse failed, this
overwrites the file with an empty registry — **deregistering every other installed
plugin**, not just `ctoc@robotijn`. The parent plan PINS the fix: **abort (exit
non-zero) and leave the file untouched** on a parse failure (no `.bak`, no partial
write) — zero new write logic, matching this workstream's "fail loudly rather than
partially write" philosophy.

**Decision.** Extract the registry read-merge-write into an exported, testable pure
function `updateInstalledPlugins(installedFile, ctocEntry)` and change the
parse-failure branch from "swallow + default" to "**throw**, without writing." `update()`
calls it and, on the corrupt-registry throw, prints a clear stderr message and
`process.exit(1)` (matching its existing failure style at lines 142/149). A **missing**
file (fresh install) is NOT corruption — it starts from the default and writes normally.

**Consequences.** A transient corruption can never silently erase other plugins'
entries; the corrupt file is preserved for manual inspection/repair; a normal update
still preserves unrelated entries byte-for-byte.

### Dependency Graph

```
tests/update-registry-abort.test.js --imports/spawns--> src/commands/update.js (updateInstalledPlugins export)
src/commands/update.js --uses--> src/lib/safe-fs (existsSync, readFileSync, writeFileSync)
(no dependency on sibling slices s1/s2 — independent)
```

No cycles.

### File Specifications

#### File: `src/commands/update.js`
**Action:** MODIFY · **Change type:** extract-function + fix parse-failure branch

- **Add** exported function
  `updateInstalledPlugins(installedFile, ctocEntry)` → returns the written `installed`
  object:
  - `let installed = { version: 2, plugins: {} };`
  - `if (safeFs.existsSync(installedFile))` → read raw bytes
    `const raw = safeFs.readFileSync(installedFile, 'utf8');` then:
    ```js
    try {
      installed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `installed_plugins.json is corrupt (unparseable JSON); aborting to avoid ` +
        `clobbering the plugin registry. Inspect/repair: ${installedFile}`
      );
    }
    ```
    (On the throw, **no write happens** — the file's bytes are left exactly as found.)
  - Ensure `installed.plugins` is an object (`installed.plugins = installed.plugins || {};`).
  - Preserve prior `installedAt`:
    `const installedAt = installed.plugins['ctoc@robotijn']?.[0]?.installedAt || ctocEntry.installedAt;`
    then set `installed.plugins['ctoc@robotijn'] = [{ ...ctocEntry, installedAt }];`
  - Write: `safeFs.writeFileSync(installedFile, JSON.stringify(installed, null, 2));`
    (2-space, no forced trailing newline — matches current output exactly.)
  - `return installed;`
- **Change** `update()` (lines 187-216) to build the entry and call the function:
  ```js
  const ctocEntry = {
    scope: 'user',
    installPath: cacheVersionDir,
    version: newVersion,
    installedAt: new Date().toISOString(),   // used only if no prior entry
    lastUpdated: new Date().toISOString(),
    gitCommitSha: commitSha
  };
  try {
    updateInstalledPlugins(INSTALLED_FILE, ctocEntry);
  } catch (err) {
    console.error(`   ${err.message}`);
    process.exit(1);
  }
  console.log('   Registry updated');
  ```
  Remove the old inline read/empty-catch/default/write block (191-215).
- **Change** `module.exports` (line 250) to add `updateInstalledPlugins`.
- **Do not** alter the git/cache/clean-old-versions steps or the fail-open
  lessons/manual refreshers.

**Error handling:** corrupt existing file → throw before any write (abort). Missing
file → default + write (fresh install, unchanged behavior). **Called by:** `update()`
and `tests/update-registry-abort.test.js`.

#### File: `tests/update-registry-abort.test.js`
**Action:** CREATE · **Framework:** `node:test` + `os.mkdtemp` fixtures;
`child_process.spawnSync` for the literal exit-code check.
Imports `const { updateInstalledPlugins } = require('../src/commands/update');`
(requiring is side-effect-free: `update()` only runs under `require.main === module`).

### Test Plan

Behavioral — asserts thrown abort, on-disk bytes, other-entry survival, and a literal
non-zero process exit; never internal structure.

1. **Corrupt registry → abort, no write (bytes untouched).** Write a fixture
   `installed_plugins.json` = `'{ this is not: valid json '`. Capture `const before =
   fs.readFileSync(file)`. `assert.throws(() => updateInstalledPlugins(file, entry),
   /corrupt|unparseable/)`. Then `assert.strictEqual(fs.readFileSync(file, 'utf8'),
   before.toString())` — bytes completely unchanged (no clobber, no default written).
2. **Valid registry with another plugin → other survives byte-identical.** Fixture with
   `{ version:2, plugins: { 'some-other-plugin@some-org': [{ scope:'user', version:'1.2.3', installPath:'/x' }] } }`.
   Call `updateInstalledPlugins(file, ctocEntry)`. Re-read + parse; assert
   `some-other-plugin@some-org` entry `deepStrictEqual` to the original (byte-identical
   values) AND `ctoc@robotijn` present with the new `version`/`installPath`.
3. **Prior ctoc installedAt preserved.** Fixture with an existing
   `ctoc@robotijn` entry carrying `installedAt:'2020-01-01T00:00:00.000Z'`; after
   update, assert `installedAt` is preserved (only `lastUpdated`/`version`/`installPath`
   change).
4. **Missing file (fresh install) → writes default + ctoc (not an abort).** No fixture
   file. Call with a path that doesn't exist yet; assert it does NOT throw, the file is
   created, parses, and contains the `ctoc@robotijn` entry.
5. **Literal non-zero exit on corrupt (subprocess).** `spawnSync(process.execPath,
   ['-e', `const {updateInstalledPlugins}=require(${JSON.stringify(updateJsAbsPath)});
   updateInstalledPlugins(${JSON.stringify(corruptFixture)}, {scope:'user',version:'9.9.9',
   installPath:'/x',installedAt:new Date().toISOString(),lastUpdated:new Date().toISOString(),
   gitCommitSha:'abc'});`], { encoding:'utf8' })` → assert `result.status !== 0` (the
   uncaught throw exits non-zero) AND the corrupt fixture bytes are unchanged after the
   run. Proves "corrupt registry makes update abort not clobber" at the exact code
   boundary `update()` uses, without the git/network prefix.

**Coverage target:** all branches of `updateInstalledPlugins` (missing / valid /
corrupt / prior-installedAt) exercised; ≥ 80% on the new function.

### Security Review

- [x] Path traversal — `installedFile` is the CTOC-computed `INSTALLED_FILE`
  (`~/.claude/plugins/installed_plugins.json`) or a test fixture path; not user input.
- [x] Safe file ops — read + a single write to the same computed path, via `safeFs`
  (NUL/empty-path guard). On the corrupt path there is **no write at all**.
- [x] No secrets. The abort message includes the registry file path (a local,
  non-sensitive plugin-manager path) to aid manual repair — acceptable and intended.
- [x] `JSON.parse` on a possibly-corrupt file is wrapped; a parse throw is the intended
  control-flow, not an error leak. No prototype-pollution risk beyond existing behavior
  (the merge only sets the `ctoc@robotijn` key; other keys pass through unchanged, as
  today).
- [x] Subprocess test uses an argv array via `spawnSync` (no shell string
  interpolation).

## Execution Plan

### Step 8: TEST
Write `tests/update-registry-abort.test.js` FIRST. Confirm RED against the current
tree: case 1 fails (today the empty catch swallows the parse error and the default is
written — the corrupt bytes ARE clobbered, so "bytes unchanged" fails); case 5 fails
(today no throw/non-zero exit on corrupt input). Capture the failing output (showing
the file WAS overwritten today) as acceptance evidence.

### Step 9: PREPARE
Confirm `updateInstalledPlugins` is not yet exported (require currently yields only
`{ update, refreshLocalLessons, refreshLocalManual, getCurrentVersion, getLatestVersion }`).
Confirm requiring `update.js` is side-effect-free (guarded by `require.main === module`
— verified: line 246).

### Step 10: IMPLEMENT
One step; edit `src/commands/update.js`:
- (10a) Add `updateInstalledPlugins(installedFile, ctocEntry)` with the
  missing/valid/corrupt branches per the File Spec — **throw (no write) on a parse
  failure**, preserve prior `installedAt`, preserve all other plugin entries.
- (10b) Replace the inline block at 187-216 with a `ctocEntry` build + a
  `try { updateInstalledPlugins(INSTALLED_FILE, ctocEntry); } catch { console.error;
  process.exit(1); }`.
- (10c) Add `updateInstalledPlugins` to `module.exports`.
No stubs; working code. Record judgment calls in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Verify: missing-file path still writes (fresh install unbroken); corrupt path writes
NOTHING; other plugins' entries are never touched by the merge; dependency direction
(command → lib/safe-fs) intact.

### Step 12: OPTIMIZE
Single read + single write per call; no redundant re-parse. The extracted function is
the only registry-write path in `update.js`.

### Step 13: SECURE
Walk the Security Review checklist; confirm the no-write-on-corrupt invariant and the
`spawnSync` argv-array subprocess.

### Step 14: VERIFY
`node --test tests/update-registry-abort.test.js` → all green. `node --test tests/*.test.js`
→ `# fail 0`, `# skipped 0` (the existing `tests/update.test.js` still passes — it does
not exercise the registry write). `npm run lint` / `npm run typecheck` clean.

### Step 15: DOCUMENT
JSDoc `updateInstalledPlugins` (missing vs corrupt vs valid semantics; "never writes on
a parse failure — aborts"). Update the step-3 comment in `update()` to state the
abort-not-clobber contract.

### Step 16: FINAL-REVIEW
Confirm acceptance criteria "update aborts on an unparseable plugin registry", "other
plugins survive an update after a registry parse failure", and "a valid, parseable
registry is updated normally" each map to a green test. Hand to Gate 2 batch approval
(do not self-cross).

## Decisions Taken Under Ambiguity

- **Abort-and-leave-untouched (not `.bak`-then-proceed).** Pinned by the parent plan:
  zero new write logic on the failure path (the safest fix touches the file exactly as
  much as before — never — on corruption), matching this workstream's fail-loud
  philosophy. The corrupt file stays in place for manual repair.
- **Extract `updateInstalledPlugins` rather than test `update()` end-to-end.** The
  registry step sits behind a git clone/fetch + cache copy keyed on `HOME` and the
  network; driving the full `update()` in a test is impractical and flaky. The
  extracted function IS the real production code path `update()` uses, so testing it
  (in-process for bytes/throws, subprocess for the literal non-zero exit) asserts the
  true behavior without mocking git.
- **Missing file ≠ corruption.** A non-existent `installed_plugins.json` (fresh
  install) legitimately starts from the `{ version:2, plugins:{} }` default and writes
  — only a file that EXISTS but fails `JSON.parse` triggers the abort. Preserves
  fresh-install behavior.
- **Registry write stays non-atomic (in scope boundary).** Atomic writes are slice
  s1's concern for `release.js`; this slice is strictly abort-not-clobber per the parent
  scope and introduces no shared write util (keeps s3 independent of s1). The current
  single-write behavior is preserved for the success path.


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
