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

## Concurrency / Job-Control Footguns
Bash "parallelism" is process-level (`&` background jobs), and its sharp edges are
about **exit status** and **variable scope across process boundaries**.

```bash
# FOOTGUN 1: a pipeline's exit status is that of the LAST command only.
# `set -e` will NOT see a failure earlier in the pipe without pipefail:
set -euo pipefail            # pipefail => the pipe fails if ANY stage fails
curl -fsSL "$url" | tar -xz  # now a curl 404 aborts the script

# FOOTGUN 2: `while read` in a pipeline runs in a SUBSHELL — vars set inside
# are lost when the subshell exits:
count=0
printf 'a\nb\n' | while read -r line; do count=$((count+1)); done
echo "$count"                # prints 0, NOT 2 — the increment was in a subshell
# FIX: process substitution keeps the loop in the current shell:
while read -r line; do count=$((count+1)); done < <(printf 'a\nb\n')

# FOOTGUN 3: background jobs + wait. A bare `wait` waits for ALL children but
# returns 0; capture per-job status with `wait "$pid"`:
long_task & pid=$!
wait "$pid" || echo "job $pid failed with $?"
```
- Name: `pipefail`, `wait`. Race on shared temp files — always `mktemp` per job,
  never a fixed `/tmp/foo` name (predictable-name TOCTOU).

## Error Handling Idioms
`set -euo pipefail` is necessary but NOT sufficient — its traps have real holes.

```bash
set -Eeuo pipefail           # -E: ERR trap is INHERITED by functions/subshells
                             # (without -E, `trap ... ERR` does not fire inside functions)
trap 'echo "failed at line $LINENO: $BASH_COMMAND" >&2' ERR

# `set -e` is suppressed inside a command used as a condition — a failing
# function on the left of && will NOT abort:
check() { return 1; }
check && echo ok             # `set -e` does NOT trigger here (by design)

# Require a variable to be set, with a message, instead of an empty expansion:
: "${DEPLOY_ENV:?DEPLOY_ENV must be set}"

# Prefer explicit `|| { ...; exit 1; }` at call sites over trusting `set -e`
# in every context (command substitution, subshells and `local x=$(...)` all
# have surprising `set -e` interactions).
```
- Name: `trap ERR`, `set -E`. `local x=$(cmd)` masks the exit status of `cmd`
  (local's own status wins) — split declaration and assignment when you check `$?`.

## Security and Dependency Gotchas
**Command injection — CWE-78** ("OS Command Injection", cwe.mitre.org) is the
dominant Bash footgun: any place an attacker-controlled string is re-parsed by the
shell.

```bash
# UNSAFE: user input flows into eval / an unquoted expansion => arbitrary commands
eval "cp $userfile /backup"          # userfile="x; rm -rf ~" runs rm
cmd="ls $userdir"; $cmd              # word-splitting re-parses $userdir as args/globs

# SAFE: never eval user data; build argv as an ARRAY and quote every expansion:
cp -- "$userfile" /backup            # -- stops option injection; quotes stop splitting
args=(ls -- "$userdir"); "${args[@]}"

# When you MUST hand data to another shell/printf template, quote it:
printf '%q' "$userinput"             # emits a shell-safe reusable token
```
- **Quote every expansion** — unquoted `$var` / `$(...)` undergoes word-splitting
  **and** glob expansion (CWE-78 gateway). Reset `IFS` (`IFS=$' \t\n'`) if untrusted
  code may have changed it.
- **`curl … | sh` (fetch-pipe-to-shell)**: you execute whatever the server returns,
  including a truncated/MITM'd payload mid-download. Download, checksum, then run.
- Dependency pinning: vendor scripts by commit SHA, verify GPG signatures on release
  tarballs (Bash tarballs are signed — see References).
- Source: cwe.mitre.org/data/definitions/78.html (CWE-78, OS Command Injection),
  retrieved 2026-07-10. See References.

## Testing Conventions
```bash
# bats-core (Bash Automated Testing System) — the standard runner:
@test "greet quotes its argument" {
  run ./greet.sh "a b"
  [ "$status" -eq 0 ]
  [ "$output" = "hello, a b" ]      # asserts word-splitting did NOT mangle it
}
```
- Name: `bats-core`. Gate with **shellcheck** as CI (`shellcheck -S style script.sh`
  — `-S error|warning|info|style` sets the minimum severity that fails the build);
  format with **shfmt** (`shfmt -d` in CI to fail on unformatted diffs).

## Performance Traps
- **Forking per iteration**: `$(cmd)`, `[ "$(...)" ]`, or external `grep`/`sed`/`cut`
  inside a tight loop forks a process each pass — orders of magnitude slower than a
  builtin. Prefer parameter expansion (`${var%suffix}`, `${var//a/b}`) and `[[ ]]`.
- **`cat file | cmd`** (useless-use-of-cat): pass the file directly — `cmd < file`.
- **Line-by-line reads**: `mapfile -t lines < file` beats a `while read` loop when
  you need the whole file; stream with `while read` only for huge/unbounded input.

## Version-Specific Gotchas (dated, sourced)
- **Bash 5.3** released **2025-07-30** (adds a compat `GLOBSORT`, function-scoped
  `${ ...; }` command substitution without a subshell fork, and assoc-array
  improvements). [ftp.gnu.org/gnu/bash, listing retrieved 2026-07-10]
- **Bash 5.2.37** (2024-09-23) is the prior 5.2.x point release.
  [ftp.gnu.org/gnu/bash, retrieved 2026-07-10]
- **macOS ships Bash 3.2** (last GPLv2 release, 2007) as `/bin/bash`; features you
  write against 5.x (`mapfile`, `${var,,}` case-fold, `wait -n`, assoc arrays) are
  ABSENT there. Target `#!/usr/bin/env bash` and install a current Bash via Homebrew,
  or write POSIX `sh` for portability. [gnu.org/software/bash, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Bash releases (source tarballs + dates): https://ftp.gnu.org/gnu/bash/
- Bash home / documentation: https://www.gnu.org/software/bash/
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- ShellCheck: https://www.shellcheck.net/
- bats-core: https://bats-core.readthedocs.io/
