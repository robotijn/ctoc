#!/usr/bin/env bash
# git-atomic.sh - Deterministic git operations for operation agents
# Returns JSON: {success: bool, output: string, error: string}

set -o pipefail

json_response() {
    local success="$1"
    local output="$2"
    local error="$3"

    # Escape special characters for JSON
    output=$(printf '%s' "$output" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
    error=$(printf '%s' "$error" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')

    printf '{"success": %s, "output": "%s", "error": "%s"}\n' "$success" "$output" "$error"
}

run_git() {
    local output
    local exit_code

    output=$(git "$@" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        json_response "true" "$output" ""
    else
        json_response "false" "" "$output"
    fi
}

command="$1"
shift

case "$command" in
    push)
        # Safe force push with lease
        run_git push --force-with-lease "$@"
        ;;
    pull)
        # Pull with rebase
        run_git pull --rebase "$@"
        ;;
    commit)
        # Commit with message (first arg is message)
        message="$1"
        shift
        run_git commit -m "$message" "$@"
        ;;
    mv)
        run_git mv "$@"
        ;;
    add)
        run_git add "$@"
        ;;
    status)
        run_git status --porcelain "$@"
        ;;
    *)
        json_response "false" "" "Unknown command: $command. Valid: push, pull, commit, mv, add, status"
        exit 1
        ;;
esac
