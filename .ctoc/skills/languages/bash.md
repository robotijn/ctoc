# Bash CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
shellcheck -x *.sh                     # Lint
shfmt -w -i 2 *.sh                     # Format
bats test/                             # Test
chmod +x scripts/*.sh                  # Make executable
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Bash 5.x** - Latest features
- **shellcheck** - Static analysis (essential)
- **shfmt** - Shell formatting
- **bats-core** - Testing framework
- **shunit2** - Alternative testing

## Project Structure
```
project/
├── bin/               # Executable scripts
├── lib/               # Sourced libraries
├── test/              # Bats test files
├── .shellcheckrc      # Shellcheck config
└── README.md          # Usage documentation
```

## Non-Negotiables
1. set -euo pipefail at script start
2. Quote all variable expansions
3. Use functions for reusable logic
4. Check command existence before use

## Red Lines (Reject PR)
- Unquoted variables `$var` instead of `"$var"`
- Missing error handling (no set -e)
- eval with user input
- Parsing ls output (use globs)
- Secrets hardcoded in scripts
- cd without error checking

## Testing Strategy
- **Unit**: Bats for function testing
- **Integration**: Test with sample inputs
- **Shellcheck**: Zero warnings policy

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Word splitting | Quote all expansions `"$var"` |
| Globbing accidents | Quote or use set -f |
| Exit code ignored | Use set -e or explicit checks |
| cd failures | `cd dir || exit 1` |

## Performance Red Lines
- No O(n^2) subprocess spawning
- No cat abuse (use redirection)
- No repeated command substitution in loops

## Security Checklist
- [ ] Input validated and sanitized
- [ ] No eval with external input
- [ ] Secrets from environment variables
- [ ] Temporary files created securely (mktemp)
