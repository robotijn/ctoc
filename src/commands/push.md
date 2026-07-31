---
description: Manually trigger quality checks and push (when auto-push is disabled)
---

**This is a deterministic script — run it and relay its output IMMEDIATELY.**
Do not deliberate, analyze, or think before or after running it; print the
script's output faithfully and stop. Reasoning is warranted ONLY if the script
itself errored or reported failing checks — then diagnose. Same discipline as
the menu's "just show it" rule.

Manually trigger quality checks and push to remote:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" [options]
```

---

## Overview

The `/ctoc:push` command manually triggers the background quality agent. Use this when:

- Auto-push on commit is disabled
- You want to push without making a new commit
- You need to retry after fixing failed checks
- You want to force a quality re-check

---

## Options

| Option | Description |
|--------|-------------|
| (none) | Run quality checks, push on success |
| `--force` | Push even with Tier 2 warnings |
| `--skip-tests` | Skip test execution (lint + typecheck only) |
| `--dry-run` | Run checks but don't push |

---

## How It Works

```
/ctoc:push
    │
    ▼
┌─────────────────────────────────────┐
│  Running quality checks...           │
│  • lint ✓                            │
│  • typecheck ✓                       │
│  • tests (47 affected)...            │
│  • security scan ✓                   │
└─────────────────────────────────────┘
    │
    ▼
┌────────┴────────┐
│    Result?      │
└────────┬────────┘
    ┌────┴────┐
    ▼         ▼
 PASS ✅   FAIL ❌
    │         │
    ▼         ▼
git push   Show errors
"Pushed!"  "Fix X, Y, Z"
```

---

## Usage Scenarios

### Scenario 1: Normal Push

After committing, manually trigger push:

```bash
git add .
git commit -m "feat: add new feature"
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"
```

### Scenario 2: Retry After Failure

Fix issues and retry without new commit:

```bash
# Initial commit triggered quality checks
# Checks failed due to lint errors
# Fix the errors...

node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"  # Retry with same commit
```

### Scenario 3: Push with Warnings

Push despite Tier 2 warnings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --force
```

Output:
```
⚠️ Pushing with 2 warnings:
  • coverage: 78% (below 80% threshold)
  • complexity: 1 function over threshold

Proceeding anyway (--force)...
✅ Pushed to origin/main
```

### Scenario 4: Check Without Pushing

Verify quality without pushing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --dry-run
```

Output:
```
Quality Status: ✅ PASS

Would push to: origin/main
Commits: 3 ahead

Dry run complete. Use '/ctoc:push' to actually push.
```

---

## Background Agent Behavior

When `/ctoc:push` is run:

1. **Check for running agent** - If quality agent is already running, show status
2. **Start quality checks** - Run Tier 1 + 2 checks
3. **Report progress** - Show live progress in terminal
4. **Handle result:**
   - **Pass:** Execute `git push`, show success
   - **Fail (Tier 1):** Block push, show errors
   - **Fail (Tier 2):** Warn, suggest `--force`

---

## Comparison: Auto vs Manual Push

| Feature | Auto (post-commit) | Manual (/ctoc:push) |
|---------|-------------------|-------------------|
| Trigger | Every commit | Explicit command |
| Background | Yes | No (foreground) |
| Progress | Notifies on complete | Live in terminal |
| Control | Automatic | User-initiated |

### When to Use Each

**Auto-push (default):**
- Normal development workflow
- Want to keep working while checks run
- Trust the quality gates

**Manual push:**
- Want to see check progress live
- Need more control over when to push
- Debugging quality check issues
- Auto-push disabled in config

---

## Configuration

Pushing is a **human ship gate**. CTOC NEVER pushes on its own unless you
explicitly open the gate. There is exactly ONE key that controls it, read only via
`settings.isAutoPushEnabled()`:

```json
// .ctoc/settings.json
{
  "git": {
    "autoPushEnabled": false   // default. CTOC commits locally but never pushes.
  }
}
```

- **`git.autoPushEnabled: false` (default)** — CTOC commits plan state locally
  (reversible) but NEVER pushes. You ship with `/ctoc:push`.
- **`git.autoPushEnabled: true`** — you have opted in; the machine push paths
  (post-commit hook, sync timer, dashboard sync) may push.

No environment profile (`dev`/`staging`/`prod`) may set this to `true` — opening a
ship gate is the human's act alone. There is no `push.autoPush` key: earlier docs
described one, but no code ever read it (it was a placebo). Ignore any such key.

---

## Error Handling

### Tier 1 Failure (Blocking)

```
❌ Quality checks failed (Tier 1)

Blocking issues:
  • lint: 3 errors in src/lib/state.js
  • tests: 2 tests failed
    - state.test.js: timeout in beforeEach
    - workflow.test.js: assertion failed

Fix these issues and run '/ctoc:push' again.
```

### Tier 2 Failure (Warning)

```
⚠️ Quality checks passed with warnings (Tier 2)

Warnings:
  • coverage: 78% (threshold: 80%)
  • complexity: checkoutFlow() has cyclomatic complexity 12 (max: 10)

To push anyway: /ctoc:push --force
To fix warnings first: address issues above
```

### Network Failure

```
❌ Push failed: Network error

Quality checks passed, but git push failed:
  fatal: Could not read from remote repository.

Retry with: node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"
Or manually: git push origin main
```

---

## Integration with the quality checks

`/ctoc:push` runs the same quality checks that gate a commit, then pushes on success.
CTOC ships no `ctoc` command-line executable, so there is no command-line quality
subcommand to run on its own — the checks that such a subcommand would "report" run
through `npm test` and the Step 14 verification path, and no installed command surfaces
them by name. The invocations that exist are:

| Invocation | Purpose |
|------------|---------|
| `/ctoc:push` | Run quality checks and push on success |
| `node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --dry-run` | Run the checks without pushing |
| `npm test` | Run the full gated quality suite locally |

---

## Examples

### Basic push
```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"
```

### Push with live output (verbose)
```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"
# Shows progress for each check
```

### Force push with warnings
```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --force
```

### Quick push (skip tests)
```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --skip-tests
# Only runs lint + typecheck
```

### Dry run to check status
```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --dry-run
```
