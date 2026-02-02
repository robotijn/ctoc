# hooks

Manage Git hooks for quality enforcement. Automatically detects project type and installs appropriate hooks.

## Usage

```bash
ctoc hooks init [--system <system>] [--type <type>] [--force] [--dry-run]
ctoc hooks status
ctoc hooks remove [--system <system>]
ctoc hooks test [hook-name]
```

## Actions

### init

Initialize Git hooks for the project. Auto-detects the best system based on project type.

```bash
# Auto-detect and install
ctoc hooks init

# Force specific system
ctoc hooks init --system husky
ctoc hooks init --system pre-commit
ctoc hooks init --system native

# Specify project type (for pre-commit configs)
ctoc hooks init --type typescript
ctoc hooks init --type python
ctoc hooks init --type go
ctoc hooks init --type multi-lang

# Preview what would be installed
ctoc hooks init --dry-run

# Replace existing hooks
ctoc hooks init --force
```

**Systems:**
- `husky` - Recommended for Node.js/TypeScript projects. Uses lint-staged for fast linting.
- `pre-commit` - Recommended for Python projects. Uses the pre-commit framework.
- `native` - Universal shell scripts. Works with any project.

**Project Types (for pre-commit):**
- `typescript` - ESLint, Prettier, TypeScript, npm audit
- `python` - Ruff, mypy, bandit, safety
- `go` - gofmt, golangci-lint, gosec
- `multi-lang` - All of the above for polyglot projects

### status

Show current hooks status and recommendations.

```bash
ctoc hooks status
```

Displays:
- Detected project type
- Installed hook systems
- Status of each hook type
- Recommendations

### remove

Remove installed hooks.

```bash
# Remove all hooks
ctoc hooks remove

# Remove specific system
ctoc hooks remove --system husky
ctoc hooks remove --system pre-commit
ctoc hooks remove --system native
```

### test

Test a specific hook by running it manually.

```bash
# Test pre-commit hook
ctoc hooks test

# Test specific hook
ctoc hooks test pre-commit
ctoc hooks test pre-push
ctoc hooks test commit-msg
```

## Hook Types

| Hook | When it runs | What it checks |
|------|--------------|----------------|
| `pre-commit` | Before commit | Lint, format, secrets, file size |
| `pre-push` | Before push | Tests, coverage, security scan, build |
| `commit-msg` | After message entered | Conventional commits format |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CTOC_HOOK_TIMEOUT` | `300` | Hook timeout in seconds |
| `CTOC_MAX_FILE_SIZE_KB` | `5120` | Max file size (5MB) |
| `CTOC_MIN_COVERAGE` | `80` | Minimum coverage percentage |
| `CTOC_AUDIT_LOG` | `false` | Enable audit logging |

### Customization

After installation, you can customize the hooks:

**Husky:** Edit files in `.husky/` directory

**Pre-commit:** Edit `.pre-commit-config.yaml`

**Native:** Edit files in `.git/hooks/` directory

## Examples

### Node.js/TypeScript Project

```bash
# Install husky + lint-staged
ctoc hooks init

# This creates:
# - .husky/pre-commit (runs lint-staged)
# - .husky/pre-push (runs tests)
# - .husky/commit-msg (validates message)
# - .lintstagedrc.json (lint-staged config)
```

### Python Project

```bash
# Install pre-commit framework
ctoc hooks init

# This creates:
# - .pre-commit-config.yaml (with ruff, mypy, bandit)
# - Installs pre-commit hooks
```

### Go Project

```bash
# Install pre-commit with Go tools
ctoc hooks init --type go

# This creates:
# - .pre-commit-config.yaml (with gofmt, golangci-lint, gosec)
# - Installs pre-commit hooks
```

### Multi-language Monorepo

```bash
# Install pre-commit with all language support
ctoc hooks init --type multi-lang

# This creates:
# - .pre-commit-config.yaml (comprehensive)
# - Support for JS, Python, Go, Rust, Ruby, PHP, Shell
```

## Bypassing Hooks (Not Recommended)

In emergencies, you can bypass hooks:

```bash
# Bypass pre-commit
git commit --no-verify -m "emergency fix"

# Bypass pre-push
git push --no-verify
```

**Warning:** Bypassing hooks should be rare. Consider why the hook is failing.

## Troubleshooting

### Hook is slow

1. For Husky: Check lint-staged is installed and configured
2. For pre-commit: Use `pre-commit run --files <specific-files>`
3. Reduce the number of checks for pre-commit hook

### Hook keeps failing

1. Run `ctoc hooks test pre-commit` to see full output
2. Check the specific linter/tool that's failing
3. Fix the issues or adjust thresholds

### Secrets detection false positive

Add to `.gitignore` or create a `.gitleaksignore` file:

```
# .gitleaksignore
test-fixtures/fake-api-key.txt
```

## See Also

- `ctoc quality init` - Initialize quality configuration
- `ctoc quality check` - Run quality checks
- [Husky documentation](https://typicode.github.io/husky/)
- [pre-commit documentation](https://pre-commit.com/)
