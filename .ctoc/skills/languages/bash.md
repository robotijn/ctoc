# Bash CTO
> Shell scripts that don't break.

## Tools (2024-2025)
- **Bash 5.x**
- **shellcheck** - Linting
- **shfmt** - Formatting
- **bats** - Testing

## Non-Negotiables
1. set -euo pipefail
2. Quote all variables
3. Use functions
4. Check command existence

## Red Lines
- Unquoted variables
- Missing error handling
- eval with user input
- Parsing ls output
