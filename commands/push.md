---
description: Manually trigger quality checks and push (when auto-push is disabled)
---

Manually trigger quality checks and push to remote:

```bash
ctoc push [options]
```

---

## Overview

The `ctoc push` command manually triggers the background quality agent. Use this when:

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
ctoc push
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
ctoc push
```

### Scenario 2: Retry After Failure

Fix issues and retry without new commit:

```bash
# Initial commit triggered quality checks
# Checks failed due to lint errors
# Fix the errors...

ctoc push  # Retry with same commit
```

### Scenario 3: Push with Warnings

Push despite Tier 2 warnings:

```bash
ctoc push --force
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
ctoc push --dry-run
```

Output:
```
Quality Status: ✅ PASS

Would push to: origin/main
Commits: 3 ahead

Dry run complete. Use 'ctoc push' to actually push.
```

---

## Background Agent Behavior

When `ctoc push` is run:

1. **Check for running agent** - If quality agent is already running, show status
2. **Start quality checks** - Run Tier 1 + 2 checks
3. **Report progress** - Show live progress in terminal
4. **Handle result:**
   - **Pass:** Execute `git push`, show success
   - **Fail (Tier 1):** Block push, show errors
   - **Fail (Tier 2):** Warn, suggest `--force`

---

## Comparison: Auto vs Manual Push

| Feature | Auto (post-commit) | Manual (ctoc push) |
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

Control push behavior in `.ctoc/quality-config.yaml`:

```yaml
push:
  # Auto-push after successful quality checks
  autoPush: true  # Set to false for manual-only

  # Remote to push to
  remote: origin

  # Branch to push (null = current branch)
  branch: null

  # Allow push with Tier 2 warnings
  allowWarnings: false

  # Retry on transient failures
  retryCount: 2
  retryDelay: 5000  # ms
```

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

Fix these issues and run 'ctoc push' again.
```

### Tier 2 Failure (Warning)

```
⚠️ Quality checks passed with warnings (Tier 2)

Warnings:
  • coverage: 78% (threshold: 80%)
  • complexity: checkoutFlow() has cyclomatic complexity 12 (max: 10)

To push anyway: ctoc push --force
To fix warnings first: address issues above
```

### Network Failure

```
❌ Push failed: Network error

Quality checks passed, but git push failed:
  fatal: Could not read from remote repository.

Retry with: ctoc push
Or manually: git push origin main
```

---

## Integration with ctoc quality

`ctoc push` builds on `ctoc quality`:

| Command | Purpose |
|---------|---------|
| `ctoc quality` | Run checks, report status |
| `ctoc quality status` | Show cached quality state |
| `ctoc push` | Run checks AND push on success |
| `ctoc push --dry-run` | Same as `ctoc quality --full` |

---

## Examples

### Basic push
```bash
ctoc push
```

### Push with live output (verbose)
```bash
ctoc push
# Shows progress for each check
```

### Force push with warnings
```bash
ctoc push --force
```

### Quick push (skip tests)
```bash
ctoc push --skip-tests
# Only runs lint + typecheck
```

### Dry run to check status
```bash
ctoc push --dry-run
```
