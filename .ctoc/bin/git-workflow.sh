#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Git Workflow Helpers
#  Monobranch workflow: pull-rebase-commit-push with safety
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════
#
#  This script works WITH the git-advisor agent for intelligent features.
#
#  Division of Responsibility:
#  ┌─────────────────────────────────────────────────────────────────────────────┐
#  │  git-workflow.sh (This Script)   │  git-advisor Agent                      │
#  ├──────────────────────────────────┼─────────────────────────────────────────┤
#  │  - Actual git commands           │  - Contextual analysis of changes       │
#  │    (fetch, rebase, push, etc.)   │  - Commit message suggestions           │
#  │  - Sync workflow automation      │  - Conflict resolution guidance         │
#  │  - File freshness checking       │  - Branch strategy recommendations      │
#  │  - Status reporting              │  - Code review preparation              │
#  │  - Secret detection              │  - Impact analysis                      │
#  └──────────────────────────────────┴─────────────────────────────────────────┘
#
#  Usage:
#    - Use this script for git operations (ctoc sync, commit, qc, status)
#    - Invoke git-advisor agent for intelligent analysis and recommendations
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Agent Advice Helper
# ═══════════════════════════════════════════════════════════════════════════════

request_agent_advice() {
    local context="${1:-general}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Need intelligent advice?${NC}"
    echo ""
    echo "  Invoke the ${CYAN}git-advisor${NC} agent for:"
    echo "    - Contextual analysis of your changes"
    echo "    - Commit message suggestions"
    echo "    - Conflict resolution guidance"
    echo "    - Branch strategy recommendations"
    echo ""
    echo -e "  Usage: ${GREEN}ctoc agent invoke git-advisor${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Sync: Pull-Rebase-Push
# ═══════════════════════════════════════════════════════════════════════════════

sync_workflow() {
    local dry_run="${1:-}"

    echo -e "${BLUE}CTOC Sync Workflow${NC}"
    echo "═══════════════════════════════════════"

    # Check if in git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
        echo -e "${RED}Not a git repository.${NC}"
        exit 1
    fi

    # Get current branch
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)
    echo "Branch: $branch"

    # Check for uncommitted changes
    if [[ -n "$(git status --porcelain)" ]]; then
        echo -e "${YELLOW}Warning: You have uncommitted changes.${NC}"
        echo "Consider committing or stashing first."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Get remote
    local remote
    remote=$(git remote | head -1)
    if [[ -z "$remote" ]]; then
        echo -e "${RED}No remote configured.${NC}"
        exit 1
    fi

    echo "Remote: $remote"
    echo ""

    # Step 1: Fetch
    echo -e "${BLUE}Step 1: Fetching from $remote...${NC}"
    if [[ "$dry_run" == "--dry-run" ]]; then
        echo "  [dry-run] git fetch $remote $branch"
    else
        git fetch "$remote" "$branch" --quiet
    fi

    # Step 2: Check if we need to rebase
    local local_commit
    local remote_commit
    local base_commit

    local_commit=$(git rev-parse HEAD)
    remote_commit=$(git rev-parse "$remote/$branch" 2>/dev/null || echo "")

    if [[ -z "$remote_commit" ]]; then
        echo -e "${YELLOW}No remote branch found. Will push new branch.${NC}"
    else
        base_commit=$(git merge-base HEAD "$remote/$branch" 2>/dev/null || echo "")

        if [[ "$local_commit" == "$remote_commit" ]]; then
            echo -e "${GREEN}Already up to date.${NC}"
        elif [[ "$base_commit" == "$remote_commit" ]]; then
            echo "Local is ahead of remote. Ready to push."
        elif [[ "$base_commit" == "$local_commit" ]]; then
            echo -e "${YELLOW}Remote has new commits. Rebasing...${NC}"
            if [[ "$dry_run" == "--dry-run" ]]; then
                echo "  [dry-run] git rebase $remote/$branch"
            else
                if ! git rebase "$remote/$branch"; then
                    echo -e "${RED}Rebase failed. Resolve conflicts and run:${NC}"
                    echo "  git rebase --continue"
                    echo "  ctoc sync"
                    exit 1
                fi
            fi
        else
            echo -e "${YELLOW}Branches have diverged. Rebasing...${NC}"
            if [[ "$dry_run" == "--dry-run" ]]; then
                echo "  [dry-run] git rebase $remote/$branch"
            else
                if ! git rebase "$remote/$branch"; then
                    echo -e "${RED}Rebase failed. Resolve conflicts and run:${NC}"
                    echo "  git rebase --continue"
                    echo "  ctoc sync"
                    exit 1
                fi
            fi
        fi
    fi

    # Step 3: Push with --force-with-lease (safe force push)
    echo ""
    echo -e "${BLUE}Step 3: Pushing to $remote/$branch...${NC}"
    if [[ "$dry_run" == "--dry-run" ]]; then
        echo "  [dry-run] git push $remote $branch --force-with-lease"
    else
        if git push "$remote" "$branch" --force-with-lease; then
            echo -e "${GREEN}Sync complete!${NC}"
        else
            echo -e "${RED}Push failed.${NC}"
            echo "If someone else pushed, run: ctoc sync"
            exit 1
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Commit: Validated commit with sync
# ═══════════════════════════════════════════════════════════════════════════════

commit_workflow() {
    local message="$1"
    local skip_sync="${2:-}"

    echo -e "${BLUE}CTOC Commit Workflow${NC}"
    echo "═══════════════════════════════════════"

    # Check if in git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
        echo -e "${RED}Not a git repository.${NC}"
        exit 1
    fi

    # Check for changes
    if [[ -z "$(git status --porcelain)" ]]; then
        echo -e "${YELLOW}No changes to commit.${NC}"
        exit 0
    fi

    # Run pre-commit validation
    echo -e "${BLUE}Running pre-commit checks...${NC}"

    # Check for secrets (smarter detection to reduce false positives)
    # Look for actual secret values, not just env var names
    local secret_patterns='(PRIVATE_KEY|SECRET_KEY|PASSWORD|ACCESS_TOKEN)=[^$]|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|-----BEGIN.*PRIVATE'
    local matches
    matches=$(grep -rn -E "$secret_patterns" --include="*.env" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.txt" . 2>/dev/null | grep -v ".git" | grep -v "node_modules" | grep -v "_env:" | grep -v "key_env:" || true)

    if [[ -n "$matches" ]]; then
        echo "$matches"
        echo -e "${YELLOW}Warning: Possible secrets detected in files.${NC}"
        echo "Review the above files before committing."
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Stage all changes
    echo ""
    echo -e "${BLUE}Staging changes...${NC}"
    git add -A

    # Show what will be committed
    echo ""
    echo "Changes to be committed:"
    git diff --cached --stat

    echo ""
    read -p "Commit these changes? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Aborted."
        git reset HEAD
        exit 1
    fi

    # Commit
    echo ""
    echo -e "${BLUE}Committing...${NC}"
    git commit -m "$message

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

    echo -e "${GREEN}Committed!${NC}"

    # Sync unless skipped
    if [[ "$skip_sync" != "--no-sync" ]]; then
        echo ""
        sync_workflow
    else
        echo ""
        echo "Changes committed locally. Run 'ctoc sync' to push."
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Quick Commit: Stage, commit with message, push
# ═══════════════════════════════════════════════════════════════════════════════

quick_commit() {
    local message="$1"

    if [[ -z "$message" ]]; then
        echo -e "${RED}Commit message required.${NC}"
        echo "Usage: ctoc qc \"commit message\""
        exit 1
    fi

    git add -A
    git commit -m "$message

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
    sync_workflow
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check File Freshness
# ═══════════════════════════════════════════════════════════════════════════════

check_freshness() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        echo -e "${RED}File not found: $file${NC}"
        exit 1
    fi

    # Get remote
    local remote
    remote=$(git remote | head -1)
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)

    # Fetch latest
    git fetch "$remote" "$branch" --quiet 2>/dev/null || true

    # Compare file hash
    local local_hash
    local_hash=$(git hash-object "$file")

    local remote_hash
    remote_hash=$(git show "$remote/$branch:$file" 2>/dev/null | git hash-object --stdin 2>/dev/null || echo "")

    if [[ -z "$remote_hash" ]]; then
        echo -e "${GREEN}$file: New file (not on remote)${NC}"
        return 0
    fi

    if [[ "$local_hash" == "$remote_hash" ]]; then
        echo -e "${GREEN}$file: Up to date${NC}"
        return 0
    else
        echo -e "${YELLOW}$file: Modified on remote!${NC}"
        echo "Run 'ctoc sync' before editing to avoid conflicts."
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Status: Enhanced git status
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    echo -e "${CYAN}CTOC Git Status${NC}"
    echo "═══════════════════════════════════════"

    # Get branch info
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
    echo "Branch: $branch"

    # Check sync status
    local remote
    remote=$(git remote | head -1)

    if [[ -n "$remote" ]]; then
        git fetch "$remote" --quiet 2>/dev/null || true

        local local_commit
        local remote_commit

        local_commit=$(git rev-parse HEAD 2>/dev/null)
        remote_commit=$(git rev-parse "$remote/$branch" 2>/dev/null || echo "")

        if [[ -z "$remote_commit" ]]; then
            echo -e "Remote: ${YELLOW}No remote branch${NC}"
        elif [[ "$local_commit" == "$remote_commit" ]]; then
            echo -e "Remote: ${GREEN}Synced${NC}"
        else
            local ahead
            local behind
            ahead=$(git rev-list --count "$remote/$branch..HEAD" 2>/dev/null || echo "0")
            behind=$(git rev-list --count "HEAD..$remote/$branch" 2>/dev/null || echo "0")

            if [[ "$behind" -gt 0 && "$ahead" -gt 0 ]]; then
                echo -e "Remote: ${YELLOW}Diverged (↑$ahead ↓$behind)${NC}"
            elif [[ "$ahead" -gt 0 ]]; then
                echo -e "Remote: ${BLUE}Ahead by $ahead${NC}"
            else
                echo -e "Remote: ${YELLOW}Behind by $behind${NC}"
            fi
        fi
    fi

    echo ""

    # Show changes
    local staged
    local unstaged
    local untracked

    staged=$(git diff --cached --name-only | wc -l)
    unstaged=$(git diff --name-only | wc -l)
    untracked=$(git ls-files --others --exclude-standard | wc -l)

    if [[ "$staged" -gt 0 || "$unstaged" -gt 0 || "$untracked" -gt 0 ]]; then
        echo "Changes:"
        [[ "$staged" -gt 0 ]] && echo -e "  ${GREEN}Staged:    $staged files${NC}"
        [[ "$unstaged" -gt 0 ]] && echo -e "  ${YELLOW}Modified:  $unstaged files${NC}"
        [[ "$untracked" -gt 0 ]] && echo -e "  ${RED}Untracked: $untracked files${NC}"
    else
        echo -e "Working tree: ${GREEN}Clean${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Git Workflow Helpers

USAGE:
    ctoc sync [--dry-run]     Pull-rebase-push workflow
    ctoc commit "message"     Stage, validate, commit, and push
    ctoc qc "message"         Quick commit and push
    ctoc status               Enhanced git status
    ctoc lock-check <file>    Check if file is fresh

WORKFLOW:
    The monobranch workflow ensures clean, linear history:

    1. ctoc sync             # Pull and rebase before work
    2. ... make changes ...
    3. ctoc commit "msg"     # Validate, commit, and push

SYNC BEHAVIOR:
    - Fetches latest from remote
    - Rebases local changes on top of remote
    - Pushes with --force-with-lease (safe force push)
    - Handles conflicts gracefully

COMMIT VALIDATION:
    - Checks for potential secrets
    - Shows diff before committing
    - Adds Co-Authored-By for Claude
    - Auto-syncs after commit

EXAMPLES:
    ctoc sync                           # Sync with remote
    ctoc sync --dry-run                 # Preview sync actions
    ctoc commit "feat: Add login"       # Full commit workflow
    ctoc qc "fix: Typo"                 # Quick commit
    ctoc lock-check src/main.py         # Check file freshness

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        sync)
            sync_workflow "${1:-}"
            ;;
        commit)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc commit \"commit message\""
                exit 1
            fi
            commit_workflow "$1" "${2:-}"
            ;;
        qc|quick-commit)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc qc \"commit message\""
                exit 1
            fi
            quick_commit "$1"
            ;;
        lock-check|freshness)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc lock-check <file>"
                exit 1
            fi
            check_freshness "$1"
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc git help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
