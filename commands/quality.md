---
description: Run quality checks on changed files (smart incremental testing)
---

Run quality checks with smart incremental testing:

```bash
ctoc quality [options]
```

---

## Options

| Option | Description |
|--------|-------------|
| (none) | Run Tier 1 checks on changed files |
| `--full` | Run all tiers (1-3) |
| `--tier1` | Run only Tier 1 (blocking checks) |
| `--tier2` | Run Tier 1 + 2 (blocking + warnings) |
| `--tier3` | Run Tier 1 + 2 + 3 (all local checks) |
| `--security` | Security checks only (secrets + CVEs) |
| `status` | Show current quality state |

---

## Quality Gate Tiers

### Tier 1: BLOCKING (~5-30s)

Must pass before code can be pushed:

| Check | Description |
|-------|-------------|
| lint | Code style and lint errors |
| typecheck | Type errors (TypeScript, mypy, etc.) |
| affected-tests | Unit tests for changed files only |
| secrets | No API keys, tokens, or passwords in code |
| critical-cves | No critical/high CVEs in dependencies |

### Tier 2: WARNING (~10-30s)

Should fix, but doesn't block push:

| Check | Threshold |
|-------|-----------|
| coverage | >= 80% (configurable) |
| cyclomatic | <= 10 per function |
| cognitive | <= 15 per function |
| duplication | No blocks >= 6 lines |
| medium-cves | Medium severity CVEs |

### Tier 3: REVIEW (~30-60s)

Checked at stage transitions:

| Check | Description |
|-------|-------------|
| documentation | Adequate doc coverage |
| circular-deps | No new circular dependencies |
| bundle-size | Delta < 10% increase |
| api-compat | Backward compatible APIs |
| benchmarks | < 10% performance regression |
| integration-tests | Full integration suite |

### Tier 4: CI ONLY (~2-10min)

Full verification on push (runs in CI):

| Check | Description |
|-------|-------------|
| full-tests | Complete test suite |
| e2e | End-to-end tests |
| mutation | Mutation testing score |
| memory | Memory leak detection |
| license | License compliance scan |
| security-audit | Full security audit |
| accessibility | Accessibility checks |

---

## Smart Test Selection

The quality system uses **coverage mapping** to run only affected tests:

```
Changed: src/lib/state.js
         ↓
Coverage Map: state.js → [state.test.js, workflow.test.js]
         ↓
Runs only: state.test.js, workflow.test.js (not entire suite)
```

### Coverage Map Commands

| Command | Description |
|---------|-------------|
| `ctoc coverage-map rebuild` | Force rebuild of file→test mapping |
| `ctoc coverage-map status` | Show coverage map age and stats |

### Rebuild Triggers

The coverage map auto-rebuilds when:

- Test files added/removed/renamed
- Source file added (no mapping exists)
- Config files changed (tsconfig, pytest.ini, etc.)
- Map > 7 days old
- Manual: `ctoc coverage-map rebuild`

---

## Background Quality Agent

Quality checks run in the background after each commit:

```
git commit ───► Background agent starts (instant)
                     │
                Running quality checks...
                • lint ✓
                • typecheck ✓
                • tests (47 affected)...
                • security scan ✓
                     │
              ┌──────┴──────┐
              ▼             ▼
           PASS ✅       FAIL ❌
              │             │
        git push ────►   Notify:
        Notify: "Pushed"  "Fix X"
```

### How It Works

1. `git commit` completes instantly (never blocks)
2. Post-commit hook spawns background quality agent
3. Agent runs Tier 1 + 2 checks
4. **On pass:** Auto-pushes to remote, notifies "Pushed!"
5. **On fail:** Does not push, notifies what to fix
6. Any subsequent commit (or `--amend`) retries automatically

---

## Quality State Cache

Quality results are cached in `.ctoc/quality-state/`:

```
.ctoc/quality-state/
├── status.json           # Overall quality status
├── file-hashes.json      # SHA256 of each source file
├── test-results.json     # Pass/fail per test
├── coverage-map.json     # file → [tests that cover it]
├── lint-results.json     # Lint status per file
├── type-results.json     # Type check status
├── security-results.json # Security scan results
└── complexity-results.json # Complexity metrics
```

### Viewing Status

```bash
ctoc quality status
```

Output:
```
Quality Status: ✅ GREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Last checked: 2 minutes ago
Git HEAD: abc123d

Tier 1: ✅ PASS
  • lint: 0 errors, 5 warnings
  • typecheck: passed
  • tests: 142 passed, 0 failed, 3 skipped
  • secrets: none detected
  • cves: 0 critical, 0 high

Tier 2: ⚠️ WARNINGS (2)
  • coverage: 87.3% (threshold: 80%)
  • complexity: 2 functions over threshold
  • duplication: none

Staged files: 3 modified, all tested
```

---

## Configuration

Quality checks are configured in `.ctoc/quality-config.yaml`:

```yaml
tiers:
  tier1:
    blocking: true
    checks:
      - lint
      - typecheck
      - affected-tests
      - secrets
      - critical-cves

  tier2:
    blocking: false
    checks:
      - coverage:
          threshold: 80
      - complexity:
          cyclomatic: 10
          cognitive: 15

languages:
  javascript:
    lint: eslint .
    typecheck: tsc --noEmit
    test: jest
```

See `.ctoc/quality-config.yaml` for full configuration options.

---

## Examples

### Run default checks (Tier 1 on changed files)
```bash
ctoc quality
```

### Run full local quality suite
```bash
ctoc quality --full
```

### Check security issues only
```bash
ctoc quality --security
```

### View current quality state
```bash
ctoc quality status
```

### Rebuild coverage map
```bash
ctoc coverage-map rebuild
```

---

## Integration with CTOC Workflow

Quality checks integrate with the Iron Loop:

| Stage Transition | Quality Gate |
|------------------|--------------|
| commit | Tier 1 + 2 (background) |
| in-progress → review | Tier 3 (stage transition) |
| push to remote | Tier 4 (CI) |

The background agent ensures quality without blocking your workflow.
