#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Hybrid File Locking System
#  Optimistic locking + Git Rerere + Smart Conflict Recovery
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Setup Git Rerere
# ═══════════════════════════════════════════════════════════════════════════════

setup_rerere() {
    echo -e "${BLUE}Setting up Git Rerere (Reuse Recorded Resolution)${NC}"
    echo "═══════════════════════════════════════"

    # Enable rerere globally
    git config --global rerere.enabled true
    git config --global rerere.autoupdate true

    echo -e "${GREEN}Git rerere enabled.${NC}"
    echo ""
    echo "Rerere will automatically:"
    echo "  - Record how you resolve conflicts"
    echo "  - Replay those resolutions in future conflicts"
    echo "  - Save you time on repeated merge/rebase operations"
    echo ""
    echo "Your conflict resolutions are stored in:"
    echo "  ~/.git/rr-cache/"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check File Freshness (Optimistic Locking)
# ═══════════════════════════════════════════════════════════════════════════════

check_file_freshness() {
    local file="$1"
    local verbose="${2:-}"

    if [[ ! -f "$file" ]]; then
        echo -e "${RED}File not found: $file${NC}"
        return 1
    fi

    # Check if in git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
        echo -e "${YELLOW}Not a git repository - skipping freshness check${NC}"
        return 0
    fi

    # Get remote info
    local remote
    remote=$(git remote | head -1)
    if [[ -z "$remote" ]]; then
        [[ -n "$verbose" ]] && echo "No remote configured"
        return 0
    fi

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)

    # Fetch latest (quiet)
    git fetch "$remote" "$branch" --quiet 2>/dev/null || true

    # Get file hashes
    local local_hash
    local_hash=$(git hash-object "$file" 2>/dev/null || echo "")

    local remote_hash
    remote_hash=$(git show "$remote/$branch:$file" 2>/dev/null | git hash-object --stdin 2>/dev/null || echo "")

    # Check if file is tracked
    if ! git ls-files --error-unmatch "$file" &>/dev/null 2>&1; then
        echo -e "${GREEN}$file: Untracked (new file)${NC}"
        return 0
    fi

    if [[ -z "$remote_hash" ]]; then
        echo -e "${GREEN}$file: Not on remote (new to remote)${NC}"
        return 0
    fi

    # Get local committed hash (what we last committed)
    local committed_hash
    committed_hash=$(git show HEAD:"$file" 2>/dev/null | git hash-object --stdin 2>/dev/null || echo "")

    if [[ "$committed_hash" == "$remote_hash" ]]; then
        if [[ "$local_hash" == "$committed_hash" ]]; then
            echo -e "${GREEN}$file: Fresh (no changes)${NC}"
        else
            echo -e "${BLUE}$file: Local changes (safe to commit)${NC}"
        fi
        return 0
    else
        echo -e "${YELLOW}WARNING: $file has been modified on remote!${NC}"
        echo ""
        echo "Options:"
        echo "  1. Run 'ctoc sync' to get remote changes first"
        echo "  2. Continue editing (may cause conflict)"
        echo ""

        if [[ -n "$verbose" ]]; then
            echo "Local committed: ${committed_hash:0:8}"
            echo "Remote:          ${remote_hash:0:8}"
            echo "Working copy:    ${local_hash:0:8}"
        fi

        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Multiple Files
# ═══════════════════════════════════════════════════════════════════════════════

check_files() {
    local files=("$@")

    if [[ ${#files[@]} -eq 0 ]]; then
        # Check all modified files
        files=($(git diff --name-only 2>/dev/null || true))
        if [[ ${#files[@]} -eq 0 ]]; then
            echo "No modified files to check."
            return 0
        fi
    fi

    echo -e "${BLUE}Checking file freshness...${NC}"
    echo ""

    local stale_count=0
    for file in "${files[@]}"; do
        if ! check_file_freshness "$file"; then
            ((stale_count++))
        fi
    done

    echo ""
    if [[ $stale_count -gt 0 ]]; then
        echo -e "${YELLOW}$stale_count file(s) have remote changes.${NC}"
        echo "Run 'ctoc sync' to update before editing."
        return 1
    else
        echo -e "${GREEN}All files are fresh.${NC}"
        return 0
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Smart Conflict Resolution
# ═══════════════════════════════════════════════════════════════════════════════

resolve_conflict() {
    local file="${1:-}"

    if [[ -z "$file" ]]; then
        # Get all conflicted files
        local conflicted
        conflicted=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

        if [[ -z "$conflicted" ]]; then
            echo "No conflicts detected."
            return 0
        fi

        echo -e "${YELLOW}Conflicted files:${NC}"
        echo "$conflicted"
        echo ""
    fi

    # Check if rerere has a resolution
    local rerere_status
    rerere_status=$(git rerere status 2>/dev/null || true)

    if [[ -n "$rerere_status" ]]; then
        echo -e "${GREEN}Rerere has recorded resolutions for:${NC}"
        echo "$rerere_status"
        echo ""
        echo "Applying remembered resolutions..."
        git rerere

        # Check if still conflicted
        local still_conflicted
        still_conflicted=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

        if [[ -z "$still_conflicted" ]]; then
            echo -e "${GREEN}All conflicts resolved by rerere!${NC}"
            echo "Run 'git add .' and continue."
            return 0
        fi
    fi

    echo -e "${CYAN}Conflict Resolution Options:${NC}"
    echo ""
    echo "  [1] Keep ours (your local changes)"
    echo "  [2] Keep theirs (remote changes)"
    echo "  [3] Manual merge (open in editor)"
    echo "  [4] Show diff"
    echo "  [5] Abort operation"
    echo ""
    read -p "Choice [1-5]: " choice

    case "$choice" in
        1)
            if [[ -n "$file" ]]; then
                git checkout --ours "$file"
                git add "$file"
                echo -e "${GREEN}Kept our version of $file${NC}"
            else
                for f in $(git diff --name-only --diff-filter=U); do
                    git checkout --ours "$f"
                    git add "$f"
                done
                echo -e "${GREEN}Kept our versions of all conflicted files${NC}"
            fi
            ;;
        2)
            if [[ -n "$file" ]]; then
                git checkout --theirs "$file"
                git add "$file"
                echo -e "${GREEN}Kept their version of $file${NC}"
            else
                for f in $(git diff --name-only --diff-filter=U); do
                    git checkout --theirs "$f"
                    git add "$f"
                done
                echo -e "${GREEN}Kept their versions of all conflicted files${NC}"
            fi
            ;;
        3)
            if [[ -n "$file" ]]; then
                ${EDITOR:-nano} "$file"
            else
                echo "Open each conflicted file in your editor to resolve."
                git diff --name-only --diff-filter=U
            fi
            ;;
        4)
            if [[ -n "$file" ]]; then
                git diff "$file"
            else
                git diff
            fi
            ;;
        5)
            echo "Aborting..."
            if git rebase --show-current-patch &>/dev/null 2>&1; then
                git rebase --abort
            elif git merge HEAD &>/dev/null 2>&1; then
                git merge --abort
            fi
            ;;
        *)
            echo "Invalid choice."
            return 1
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Git Worktrees (Parallel Work)
# ═══════════════════════════════════════════════════════════════════════════════

create_worktree() {
    local branch="$1"
    local dir="${2:-.ctoc/worktrees/$branch}"

    echo -e "${BLUE}Creating worktree for: $branch${NC}"

    # Get remote
    local remote
    remote=$(git remote | head -1)
    local base_branch
    base_branch=$(git rev-parse --abbrev-ref HEAD)

    # Create worktree directory
    mkdir -p "$(dirname "$dir")"

    # Create worktree
    if git worktree add "$dir" -b "$branch" "$remote/$base_branch" 2>/dev/null; then
        echo -e "${GREEN}Created worktree at: $dir${NC}"
        echo ""
        echo "To work in this worktree:"
        echo "  cd $dir"
        echo ""
        echo "When done:"
        echo "  ctoc worktree remove $branch"
    else
        # Branch might already exist
        if git worktree add "$dir" "$branch" 2>/dev/null; then
            echo -e "${GREEN}Created worktree at: $dir${NC}"
        else
            echo -e "${RED}Failed to create worktree.${NC}"
            echo "Branch '$branch' might already exist or be checked out elsewhere."
            return 1
        fi
    fi
}

list_worktrees() {
    echo -e "${CYAN}Git Worktrees:${NC}"
    echo ""
    git worktree list
}

remove_worktree() {
    local branch="$1"
    local dir=".ctoc/worktrees/$branch"

    if [[ ! -d "$dir" ]]; then
        # Try finding by branch name
        dir=$(git worktree list --porcelain | grep -A1 "worktree.*$branch" | grep "worktree" | cut -d' ' -f2 || true)
    fi

    if [[ -z "$dir" || ! -d "$dir" ]]; then
        echo -e "${RED}Worktree not found for: $branch${NC}"
        git worktree list
        return 1
    fi

    echo -e "${BLUE}Removing worktree: $dir${NC}"
    git worktree remove "$dir"
    echo -e "${GREEN}Worktree removed.${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Hybrid File Locking System

USAGE:
    ctoc lock <command> [options]

COMMANDS:
    check [file...]       Check file freshness (optimistic locking)
    resolve [file]        Smart conflict resolution
    setup-rerere          Enable git rerere globally
    worktree new <branch> Create a worktree for parallel work
    worktree list         List all worktrees
    worktree remove <br>  Remove a worktree

HOW IT WORKS:

  1. Optimistic Locking
     Before editing, 'ctoc lock check' compares your local file
     with the remote version. If remote has changed, warns you
     to sync first.

  2. Git Rerere (Reuse Recorded Resolution)
     Git remembers how you resolve conflicts. Next time the same
     conflict occurs, it auto-applies your previous resolution.

  3. Smart Conflict Recovery
     When conflicts occur, offers multiple resolution strategies:
     - Keep ours / theirs
     - Manual merge
     - Show diff

  4. Worktrees for Parallel Work
     Need to work on multiple features simultaneously? Worktrees
     let you have multiple branches checked out in different dirs.

EXAMPLES:
    ctoc lock check src/main.py       # Check single file
    ctoc lock check                   # Check all modified files
    ctoc lock resolve                 # Interactive conflict resolution
    ctoc lock setup-rerere            # Enable rerere
    ctoc lock worktree new feature-x  # Create parallel workspace

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        check)
            if [[ $# -eq 0 ]]; then
                check_files
            else
                check_files "$@"
            fi
            ;;
        resolve)
            resolve_conflict "${1:-}"
            ;;
        setup-rerere)
            setup_rerere
            ;;
        worktree)
            local subcmd="${1:-list}"
            shift || true
            case "$subcmd" in
                new|create|add)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc lock worktree new <branch-name>"
                        exit 1
                    fi
                    create_worktree "$1" "${2:-}"
                    ;;
                list)
                    list_worktrees
                    ;;
                remove|rm|delete)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc lock worktree remove <branch-name>"
                        exit 1
                    fi
                    remove_worktree "$1"
                    ;;
                *)
                    echo "Unknown worktree command: $subcmd"
                    echo "Available: new, list, remove"
                    exit 1
                    ;;
            esac
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc lock help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
