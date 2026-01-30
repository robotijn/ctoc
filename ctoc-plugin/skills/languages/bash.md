# Bash CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets `set -euo pipefail` — essential for safe scripts
- Claude leaves variables unquoted — causes word splitting bugs
- Claude parses `ls` output — use globs instead
- Claude uses `eval` with user input — command injection risk

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `bash 5.x` | Modern features | Older bash |
| `shellcheck` | Static analysis (mandatory) | No linting |
| `shfmt` | Formatting | Manual style |
| `bats-core` | Testing | Ad-hoc tests |
| `#!/usr/bin/env bash` | Portable shebang | `#!/bin/bash` |

## Patterns Claude Should Use
```bash
#!/usr/bin/env bash
set -euo pipefail

# Always quote variables
name="John Doe"
echo "Hello, ${name}"

# Check command existence
command -v docker &>/dev/null || {
    echo "docker not found" >&2
    exit 1
}

# Safe directory change
cd "${target_dir}" || exit 1

# Use arrays for arguments
args=("--verbose" "--output" "${output_file}")
my_command "${args[@]}"

# Secure temp files
tmp_file=$(mktemp)
trap 'rm -f "${tmp_file}"' EXIT
```

## Anti-Patterns Claude Generates
- Missing `set -euo pipefail` — script continues on errors
- Unquoted `$var` — use `"${var}"` always
- Parsing `ls` output — use globs `for f in *.txt`
- `eval` with user input — command injection
- `cd dir` without error check — use `cd dir || exit 1`

## Version Gotchas
- **Scripts > 100 lines**: Consider rewriting in Python/Go
- **Portability**: Use POSIX if targeting multiple shells
- **ShellCheck**: Non-negotiable, catches subtle bugs
- **Error messages**: Redirect to stderr with `>&2`
- **Local variables**: Always use `local` in functions
