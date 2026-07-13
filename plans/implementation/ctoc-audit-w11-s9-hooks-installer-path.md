---
title: "W11-s9 — hooks-installer.js: post-commit hook points at the real src/hooks/post-commit.js"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/lib/hooks-installer.js
  - tests/lib-setup-batch.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s9 — fix the broken post-commit hook path

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster B. Finding: **L9**.
> Independent. Smallest slice — single-line source fix + one behavior assertion.

## Implementation Details

### Architecture Decision (ADR)

`src/lib/hooks-installer.js` `installPostCommitHook()` (line 475) builds
`agentHookPath = path.join(pluginRoot, 'hooks', 'post-commit.js')` (line 479), where
`pluginRoot` defaults to `path.join(__dirname, '..', '..')` (line 476) — the repo/plugin
root. That resolves to `<root>/hooks/post-commit.js`, which **does not exist**. Verified:
there is NO `hooks/` directory at the repo root; the real file is `src/hooks/post-commit.js`
(present). Every git post-commit hook this function writes embeds `node "<agentHookPath>"`
(lines 496 and 511) — invoking a path that isn't there, so the background quality agent never
runs (parent §L9). The parent also corrected the file's own location: it is
`src/lib/hooks-installer.js`, not `src/hooks/hooks-installer.js`.

**Fix (one line):** `agentHookPath = path.join(pluginRoot, 'src', 'hooks', 'post-commit.js')`.
This is correct for both the repo layout and the installed-plugin layout (both have `src/`
under the plugin root; `CLAUDE_PLUGIN_ROOT`, when set, points at that same root).

### Dependency Graph
```
src/lib/hooks-installer.js  → installPostCommitHook: agentHookPath resolution (line 479)
tests/lib-setup-batch.test.js → already tests installPostCommitHook; add the path-existence assertion
```

### File Specifications

#### `src/lib/hooks-installer.js` — MODIFY (line 479 only)
- Change `path.join(pluginRoot, 'hooks', 'post-commit.js')` →
  `path.join(pluginRoot, 'src', 'hooks', 'post-commit.js')`. No other change; the appended-
  hook branch (line 496) and new-hook branch (line 511) both consume `agentHookPath`, so both
  are fixed by the single edit.

#### `tests/lib-setup-batch.test.js` — MODIFY (add one behavior test)
- In the existing `installPostCommitHook` coverage, run the installer against a temp git repo
  with `pluginRoot` set to the real CTOC repo root, read the written post-commit hook script,
  extract the embedded path from the `node "<path>"` line, and assert
  `fs.existsSync(extractedPath) === true`. On current `main` the extracted path
  (`<root>/hooks/post-commit.js`) does not exist → RED; after the fix
  (`<root>/src/hooks/post-commit.js`) → GREEN. This directly encodes parent success-metric #4
  ("`installPostCommitHook`'s referenced hook path resolves via `fs.existsSync` to `true`").

### Test Plan (behavior)
1. **Embedded hook path exists (L9, RED on main):** as above — extract the `node "<path>"`
   target from the generated hook and assert it exists on disk.
2. **Both branches:** cover the new-hook-file branch AND the append-to-existing-hook branch
   (both embed `agentHookPath`), asserting the path exists in each generated script.

### Security Review
- [ ] `pluginRoot` comes from `options.pluginRoot`/`CLAUDE_PLUGIN_ROOT`/`__dirname` (trusted
      install context), joined via `path.join` — no traversal from untrusted input.
- [ ] The fix makes the installed hook invoke a real, in-repo script rather than a missing
      path; it does not broaden what the hook runs.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Add the path-existence assertion(s) to `tests/lib-setup-batch.test.js`. Run — fails on
      current `main` (embedded path `<root>/hooks/post-commit.js` does not exist).

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:` (hooks-installer.js, lib-setup-batch.test.js).
      Reconfirm `src/hooks/post-commit.js` exists and there is no root `hooks/` dir.

### Step 10: IMPLEMENT
- [ ] `src/lib/hooks-installer.js`: change line 479 to include `'src'` in the join. No other
      change.

### Step 11: REVIEW
- [ ] Confirm both the append branch (line 496) and new-hook branch (line 511) now embed the
      corrected path via the shared `agentHookPath`.

### Step 12: OPTIMIZE
- [ ] N/A.

### Step 13: SECURE
- [ ] Security checklist above.

### Step 14: VERIFY
- [ ] `node --test tests/lib-setup-batch.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0`.

### Step 15: DOCUMENT
- [ ] Update the inline comment near `agentHookPath` to note the real file lives at
      `src/hooks/post-commit.js`.

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Fix the path (add `src/`), not remove the installer** — the parent scope allows "fix or
  remove"; the post-commit quality hook is a live feature, so correcting the path is the right
  fix, and `src/hooks/post-commit.js` is confirmed present.
- **Extend the existing installer test** (`tests/lib-setup-batch.test.js`) rather than add a
  new file — it already exercises `installPostCommitHook`.
