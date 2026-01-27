#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief CLI v1.3.0
#  Main entry point for skill management commands
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.3.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

print_step() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_fail() {
    echo -e "  ${RED}✗${NC} $1"
}

print_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << EOF
CTOC - CTO Chief v$VERSION
Your army of virtual CTOs.

USAGE:
    ctoc <command> [options]

SKILL COMMANDS:
    skills list              List all available skills (261 total)
    skills active            Show skills downloaded for this project
    skills add <name>        Download and add a skill
    skills search <query>    Search skills by keyword
    skills sync              Detect and download needed skills
    skills info <name>       Show skill details
    skills feedback <name>   Open issue form to suggest skill improvement

PLAN COMMANDS:
    plan new <title> [module]   Create a new functional plan
    plan propose <id>           Submit plan for review
    plan approve <id>           Approve a plan
    plan implement <id>         Create implementation plan from functional
    plan start <id>             Inject Iron Loop, move to todo/
    plan claim <id>             Claim plan from todo/ (git-atomic)
    plan complete <id>          Move to review/
    plan accept <id>            Accept and move to done/
    plan reject <id> [reason]   Return to draft with feedback
    plan abandon <id>           Release plan back to todo/
    plan list [stage]           List plans
    plan status                 Show plan dashboard
    plan migrate                Migrate from old .ctoc/plans structure

AGENT COMMANDS:
    agent list               List all agents (60 total)
    agent info <name>        Show agent details
    agent upgrade <name>     Add capability to upgrade queue
    agent research <name>    Show research queries for agent
    agent check              Check for agent updates
    agent apply <name>       Apply pending upgrades

PROGRESS COMMANDS:
    progress                 Quick progress view
    dashboard                Full progress dashboard
    progress step <n>        Move to Iron Loop step
    progress complete <n>    Complete step and move to next

GIT WORKFLOW COMMANDS:
    sync                     Pull-rebase-push workflow
    commit "message"         Stage, validate, commit, and push
    qc "message"             Quick commit and push
    status                   Enhanced git status
    lock-check <file>        Check if file is fresh (alias for lock check)
    lock check [files]       Check file freshness
    lock resolve             Smart conflict resolution
    lock setup-rerere        Enable git rerere
    lock worktree new <br>   Create parallel workspace

COMMUNITY COMMANDS:
    process-issues           Fetch approved skill improvements for processing

RESEARCH COMMANDS:
    research status          Show current research configuration
    research on              Enable WebSearch (default)
    research off             Disable WebSearch
    research steps <list>    Set auto-research steps (comma-separated)

DETECTION COMMANDS:
    detect                   Detect technologies in current project
    detect languages         Detect only languages
    detect frameworks        Detect only frameworks

MAINTENANCE COMMANDS:
    doctor                   Check installation health
    migrate                  Migrate plans from .ctoc/plans to plans/
    update                   Update CTOC to latest version
    update check             Check for updates without installing
    uninstall                Remove CTOC from this project

OTHER COMMANDS:
    help                     Show this help
    version                  Show version

EXAMPLES:
    ctoc skills list                    # See all available skills
    ctoc skills add langchain           # Add LangChain guidance
    ctoc skills sync                    # Auto-detect and download skills
    ctoc detect                         # See what technologies are detected
    ctoc plan new "Add authentication"  # Create a new plan
    ctoc plan status                    # View plan dashboard
    ctoc doctor                         # Check installation health

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Doctor Command - Check installation health
# ═══════════════════════════════════════════════════════════════════════════════

doctor() {
    echo ""
    echo -e "${CYAN}CTOC Doctor - Checking installation...${NC}"
    echo ""

    local issues=0
    local warnings=0

    # Determine CTOC root (support both old and new structure)
    local ctoc_root=""
    if [[ -d ".ctoc/repo/.git" ]]; then
        ctoc_root=".ctoc/repo"
    elif [[ -d ".ctoc" ]]; then
        ctoc_root=".ctoc"
    fi

    # Check repo/installation
    if [[ -n "$ctoc_root" ]]; then
        local version
        if [[ -f "$ctoc_root/VERSION" ]]; then
            version=$(cat "$ctoc_root/VERSION" 2>/dev/null || echo "unknown")
        else
            version=$(cat "$SCRIPT_DIR/../../VERSION" 2>/dev/null || echo "unknown")
        fi
        print_step "CTOC $version installed"

        if [[ -d "$ctoc_root/.git" ]] || [[ -d ".ctoc/repo/.git" ]]; then
            print_step "Repository structure (git clone)"
        else
            print_warn "Legacy structure (individual files)"
            ((warnings++))
        fi
    else
        print_fail "CTOC installation not found"
        ((issues++))
    fi

    # Check wrapper script
    if [[ -x ".ctoc/ctoc" ]]; then
        print_step "Wrapper script exists"
    elif [[ -n "$ctoc_root" ]]; then
        print_warn "Wrapper script missing (using direct path)"
        ((warnings++))
    fi

    # Check alias (best effort)
    if type ctoc &>/dev/null 2>&1; then
        print_step "Command 'ctoc' available"
    else
        print_warn "Alias 'ctoc' not in current shell"
        echo "         Run: source ~/.bashrc (or restart terminal)"
        ((warnings++))
    fi

    echo ""
    echo -e "${BOLD}Dependencies:${NC}"

    # Check dependencies
    if command -v git &>/dev/null; then
        print_step "git"
    else
        print_fail "git missing (required)"
        ((issues++))
    fi

    if command -v jq &>/dev/null; then
        print_step "jq"
    else
        print_warn "jq missing (some features limited)"
        ((warnings++))
    fi

    if command -v claude &>/dev/null; then
        print_step "claude (Claude Code CLI)"
    else
        print_warn "claude not installed"
        echo "         Install: npm install -g @anthropic-ai/claude-code"
        ((warnings++))
    fi

    echo ""
    echo -e "${BOLD}Project files:${NC}"

    # Check skills
    local skill_count=0
    if [[ -d ".ctoc/repo/.ctoc/skills" ]]; then
        skill_count=$(find .ctoc/repo/.ctoc/skills -name "*.md" 2>/dev/null | wc -l)
    elif [[ -d ".ctoc/skills" ]]; then
        skill_count=$(find .ctoc/skills -name "*.md" 2>/dev/null | wc -l)
    fi
    if [[ $skill_count -gt 0 ]]; then
        print_step "$skill_count skills available"
    else
        print_warn "No skills found"
        ((warnings++))
    fi

    # Check CLAUDE.md
    if [[ -f "CLAUDE.md" ]]; then
        if grep -q "CTOC" CLAUDE.md 2>/dev/null; then
            print_step "CLAUDE.md has CTOC integration"
        else
            print_warn "CLAUDE.md exists but missing CTOC sections"
            ((warnings++))
        fi
    else
        print_warn "CLAUDE.md not found"
        ((warnings++))
    fi

    # Check IRON_LOOP.md
    if [[ -f "IRON_LOOP.md" ]]; then
        print_step "IRON_LOOP.md exists"
    else
        print_warn "IRON_LOOP.md not found"
        ((warnings++))
    fi

    # Check plans directory (new location: root plans/)
    if [[ -d "plans" ]]; then
        local plan_count
        plan_count=$(find plans -name "*.md" 2>/dev/null | wc -l)
        print_step "Plans directory ($plan_count plans) - root level (git-tracked)"
    elif [[ -d ".ctoc/plans" ]]; then
        print_warn "Old plans structure found in .ctoc/plans/"
        echo "         Run 'ctoc migrate' to migrate to new structure"
        ((warnings++))
    else
        print_warn "Plans directory not found"
        ((warnings++))
    fi

    # Check settings
    if [[ -f ".ctoc/settings.yaml" ]]; then
        print_step "settings.yaml exists"
    else
        print_warn "settings.yaml not found"
        ((warnings++))
    fi

    echo ""

    # Summary
    if [[ $issues -eq 0 && $warnings -eq 0 ]]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
    elif [[ $issues -eq 0 ]]; then
        echo -e "${YELLOW}✓ Installation OK with $warnings warning(s)${NC}"
    else
        echo -e "${RED}Found $issues critical issue(s) and $warnings warning(s)${NC}"
        echo ""
        echo "Run 'curl -sL https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh | bash' to fix"
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Uninstall Command - Remove CTOC from project
# ═══════════════════════════════════════════════════════════════════════════════

uninstall() {
    echo ""
    echo -e "${CYAN}CTOC Uninstaller${NC}"
    echo ""

    read -p "This will remove CTOC from this project. Continue? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[yY] ]]; then
        echo "Cancelled."
        return 0
    fi

    echo ""

    # Remove .ctoc directory
    if [[ -d ".ctoc" ]]; then
        rm -rf .ctoc
        print_step "Removed .ctoc/"
    fi

    # Handle IRON_LOOP.md
    if [[ -f "IRON_LOOP.md" ]]; then
        read -p "  Remove IRON_LOOP.md? [Y/n]: " response
        if [[ ! "$response" =~ ^[nN] ]]; then
            rm -f IRON_LOOP.md
            print_step "Removed IRON_LOOP.md"
        fi
    fi

    # Handle PLANNING.md
    if [[ -f "PLANNING.md" ]]; then
        read -p "  Remove PLANNING.md? [Y/n]: " response
        if [[ ! "$response" =~ ^[nN] ]]; then
            rm -f PLANNING.md
            print_step "Removed PLANNING.md"
        fi
    fi

    # Handle CLAUDE.md
    if [[ -f "CLAUDE.md" ]]; then
        if grep -q "<!-- CTOC:START" CLAUDE.md 2>/dev/null; then
            read -p "  Remove CTOC sections from CLAUDE.md? [Y/n]: " response
            if [[ ! "$response" =~ ^[nN] ]]; then
                # Remove content between CTOC markers
                sed -i '/<!-- CTOC:START/,/<!-- CTOC:END/d' CLAUDE.md 2>/dev/null || \
                    sed '/<!-- CTOC:START/,/<!-- CTOC:END/d' CLAUDE.md > CLAUDE.md.tmp && mv CLAUDE.md.tmp CLAUDE.md
                print_step "Removed CTOC sections from CLAUDE.md"
            fi
        fi
    fi

    # Remove from .gitignore
    if [[ -f ".gitignore" ]] && grep -q "^\.ctoc/$" .gitignore 2>/dev/null; then
        sed -i '/^\.ctoc\/$/d' .gitignore 2>/dev/null || \
            sed '/^\.ctoc\/$/d' .gitignore > .gitignore.tmp && mv .gitignore.tmp .gitignore
        # Also remove the comment line if present
        sed -i '/# CTOC - CTO Chief/d' .gitignore 2>/dev/null || true
        print_step "Removed from .gitignore"
    fi

    # Remove alias from shell rc files
    for rc in ~/.bashrc ~/.zshrc ~/.config/fish/config.fish; do
        if [[ -f "$rc" ]] && grep -q "alias ctoc" "$rc" 2>/dev/null; then
            sed -i '/alias ctoc/d' "$rc" 2>/dev/null || \
                sed '/alias ctoc/d' "$rc" > "$rc.tmp" && mv "$rc.tmp" "$rc"
            sed -i '/# CTOC - CTO Chief/d' "$rc" 2>/dev/null || true
            print_step "Removed alias from $rc"
        fi
    done

    echo ""
    echo -e "${GREEN}CTOC uninstalled.${NC} Restart your terminal to complete."
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Command - Update CTOC to latest version
# ═══════════════════════════════════════════════════════════════════════════════

update_ctoc() {
    local subcmd="${1:-now}"

    case "$subcmd" in
        check)
            echo ""
            echo -e "${CYAN}Checking for updates...${NC}"
            echo ""

            local local_version
            if [[ -f ".ctoc/repo/VERSION" ]]; then
                local_version=$(cat ".ctoc/repo/VERSION" 2>/dev/null || echo "unknown")
            else
                local_version=$(cat "$SCRIPT_DIR/../../VERSION" 2>/dev/null || echo "unknown")
            fi

            local remote_version
            remote_version=$(curl -sf --connect-timeout 5 "https://raw.githubusercontent.com/robotijn/ctoc/main/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "")

            if [[ -z "$remote_version" ]]; then
                echo "Could not check for updates (offline?)"
                return 1
            fi

            echo "  Current version: $local_version"
            echo "  Latest version:  $remote_version"
            echo ""

            if [[ "$local_version" != "$remote_version" ]]; then
                echo -e "${CYAN}Update available!${NC}"
                echo "Run 'ctoc update' to install."
            else
                echo -e "${GREEN}Already up to date.${NC}"
            fi
            echo ""
            ;;

        now|"")
            echo ""
            echo -e "${CYAN}Updating CTOC...${NC}"
            echo ""

            # Check if using new repo structure
            if [[ -d ".ctoc/repo/.git" ]]; then
                cd .ctoc/repo
                git fetch --quiet 2>/dev/null || {
                    echo "Could not fetch updates (offline?)"
                    cd - > /dev/null
                    return 1
                }

                local local_v
                local_v=$(cat VERSION 2>/dev/null || echo "unknown")
                local remote_v
                remote_v=$(git show origin/main:VERSION 2>/dev/null || echo "$local_v")

                if [[ "$local_v" == "$remote_v" ]]; then
                    echo "Already up to date ($local_v)"
                    cd - > /dev/null
                    return 0
                fi

                echo "Updating: $local_v → $remote_v"
                echo ""

                # Backup settings
                if [[ -f "../settings.yaml" ]]; then
                    cp -f ../settings.yaml ../settings.yaml.backup 2>/dev/null || true
                fi

                git pull --rebase --quiet 2>/dev/null || git reset --hard origin/main --quiet
                print_step "Updated to $remote_v"

                # Restore settings
                if [[ -f "../settings.yaml.backup" ]]; then
                    mv -f ../settings.yaml.backup ../settings.yaml 2>/dev/null || true
                    print_step "Restored settings"
                fi

                # Remove update notification if present
                rm -f ../.update-available 2>/dev/null || true

                cd - > /dev/null

                echo ""
                echo -e "${GREEN}CTOC updated successfully!${NC}"
            else
                # Legacy: use install script
                echo "Using install script for update..."
                local install_url="https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh"
                curl -fsSL "$install_url" | bash
            fi
            echo ""
            ;;

        *)
            echo "Unknown update command: $subcmd"
            echo "Available: check, now"
            return 1
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Skills Commands
# ═══════════════════════════════════════════════════════════════════════════════

get_skills_index() {
    # Find skills.json in various locations (support both old and new structure)
    if [[ -f ".ctoc/skills.json" ]]; then
        echo ".ctoc/skills.json"
    elif [[ -f ".ctoc/repo/.ctoc/skills.json" ]]; then
        echo ".ctoc/repo/.ctoc/skills.json"
    elif [[ -f "$SCRIPT_DIR/../skills.json" ]]; then
        echo "$SCRIPT_DIR/../skills.json"
    else
        echo ""
    fi
}

skills_list() {
    local index
    index=$(get_skills_index)

    if [[ -z "$index" ]]; then
        echo "Error: skills.json not found" >&2
        exit 1
    fi

    echo "Available Skills:"
    echo ""

    echo "Languages ($(jq '.skills.languages | length' "$index")):"
    jq -r '.skills.languages | keys[]' "$index" | sort | column

    echo ""
    echo "Frameworks by Category:"

    for category in $(jq -r '.skills.frameworks | keys[]' "$index"); do
        local count
        count=$(jq -r --arg c "$category" '.skills.frameworks[$c] | length' "$index")
        echo ""
        echo "  $category ($count):"
        jq -r --arg c "$category" '.skills.frameworks[$c] | keys[]' "$index" | sort | sed 's/^/    /' | column
    done
}

skills_active() {
    # Check both old and new skill locations
    local skills_dir=""
    if [[ -d ".ctoc/repo/.ctoc/skills" ]]; then
        skills_dir=".ctoc/repo/.ctoc/skills"
    elif [[ -d ".ctoc/skills" ]]; then
        skills_dir=".ctoc/skills"
    fi

    if [[ -z "$skills_dir" ]] || [[ ! -d "$skills_dir" ]]; then
        echo "No skills available."
        echo ""
        echo "With the new CTOC structure, all 261 skills are available in .ctoc/repo/.ctoc/skills/"
        return
    fi

    echo "Active Skills (in $skills_dir):"
    echo ""

    # Languages
    if ls "$skills_dir"/languages/*.md &>/dev/null 2>&1; then
        echo "Languages:"
        ls -1 "$skills_dir"/languages/*.md 2>/dev/null | xargs -I{} basename {} .md | sed 's/^/  - /'
    fi

    # Frameworks by category
    for category_dir in "$skills_dir"/frameworks/*/; do
        [[ -d "$category_dir" ]] || continue
        local category
        category=$(basename "$category_dir")
        if ls "$category_dir"*.md &>/dev/null 2>&1; then
            echo ""
            echo "Frameworks ($category):"
            ls -1 "$category_dir"*.md 2>/dev/null | xargs -I{} basename {} .md | sed 's/^/  - /'
        fi
    done
}

skills_add() {
    local name="$1"
    if [[ -f "$SCRIPT_DIR/download.sh" ]]; then
        "$SCRIPT_DIR/download.sh" with-deps "$name"
    else
        echo "Note: With the new repo structure, all skills are already available."
        echo "Skills are located in: .ctoc/repo/.ctoc/skills/"
    fi
}

skills_search() {
    local query="$1"
    local index
    index=$(get_skills_index)

    if [[ -z "$index" ]]; then
        echo "Error: skills.json not found" >&2
        exit 1
    fi

    echo "Searching for: $query"
    echo ""

    # Search in languages
    echo "Languages:"
    jq -r --arg q "$query" '
        .skills.languages | to_entries[] |
        select(.key | ascii_downcase | contains($q | ascii_downcase)) |
        "  - " + .key
    ' "$index" || true

    # Search in framework names and keywords
    echo ""
    echo "Frameworks:"
    jq -r --arg q "$query" '
        .skills.frameworks | to_entries[] | .value | to_entries[] |
        select(.key | ascii_downcase | contains($q | ascii_downcase) or (.value.keywords[]? | ascii_downcase | contains($q | ascii_downcase))) |
        "  - " + .key
    ' "$index" | sort -u || true
}

skills_info() {
    local name="$1"
    local index
    index=$(get_skills_index)

    if [[ -z "$index" ]]; then
        echo "Error: skills.json not found" >&2
        exit 1
    fi

    # Try languages first
    local info
    info=$(jq --arg n "$name" '.skills.languages[$n] // empty' "$index")

    if [[ -z "$info" ]]; then
        # Try frameworks
        info=$(jq --arg n "$name" '.skills.frameworks | to_entries[] | .value[$n] // empty' "$index" | head -1)
    fi

    if [[ -z "$info" ]]; then
        echo "Skill not found: $name"
        exit 1
    fi

    echo "Skill: $name"
    echo "$info" | jq '.'
}

skills_sync() {
    if [[ -f "$SCRIPT_DIR/download.sh" ]]; then
        "$SCRIPT_DIR/download.sh" sync
    else
        echo "Note: With the new repo structure, all skills are already available."
        echo "Skills are located in: .ctoc/repo/.ctoc/skills/"
    fi
}

skills_feedback() {
    local skill="$1"
    local repo="robotijn/ctoc"
    local url="https://github.com/${repo}/issues/new"
    url+="?template=skill-improvement.yml"
    url+="&title=%5BSkill%5D+Update+${skill}"

    echo "Opening skill improvement form for: $skill"
    echo ""

    # Try to open browser
    if command -v xdg-open &>/dev/null; then
        xdg-open "$url" 2>/dev/null
    elif command -v open &>/dev/null; then
        open "$url"
    elif command -v wslview &>/dev/null; then
        wslview "$url"
    else
        echo "Please visit:"
        echo "  $url"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Community Commands
# ═══════════════════════════════════════════════════════════════════════════════

process_issues() {
    if [[ -f "$SCRIPT_DIR/process-issues.sh" ]]; then
        "$SCRIPT_DIR/process-issues.sh"
    else
        echo "process-issues.sh not found"
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        skills)
            local subcmd="${1:-list}"
            shift || true
            case "$subcmd" in
                list)
                    skills_list
                    ;;
                active)
                    skills_active
                    ;;
                add)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc skills add <skill-name>"
                        exit 1
                    fi
                    skills_add "$1"
                    ;;
                search)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc skills search <query>"
                        exit 1
                    fi
                    skills_search "$1"
                    ;;
                sync)
                    skills_sync
                    ;;
                info)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc skills info <skill-name>"
                        exit 1
                    fi
                    skills_info "$1"
                    ;;
                feedback)
                    if [[ $# -eq 0 ]]; then
                        echo "Usage: ctoc skills feedback <skill-name>"
                        echo "Opens a GitHub issue form to suggest improvements for the skill."
                        exit 1
                    fi
                    skills_feedback "$1"
                    ;;
                *)
                    echo "Unknown skills command: $subcmd"
                    echo "Available: list, active, add, search, sync, info, feedback"
                    exit 1
                    ;;
            esac
            ;;

        detect)
            local mode="${1:-all}"
            if [[ -f "$SCRIPT_DIR/detect.sh" ]]; then
                "$SCRIPT_DIR/detect.sh" "$mode"
            else
                echo "detect.sh not found"
                exit 1
            fi
            ;;

        research)
            if [[ -f "$SCRIPT_DIR/research.sh" ]]; then
                "$SCRIPT_DIR/research.sh" "$@"
            else
                echo "research.sh not found"
                exit 1
            fi
            ;;

        plan)
            if [[ -f "$SCRIPT_DIR/plan.sh" ]]; then
                "$SCRIPT_DIR/plan.sh" "$@"
            else
                echo "plan.sh not found"
                exit 1
            fi
            ;;

        progress)
            if [[ -f "$SCRIPT_DIR/progress.sh" ]]; then
                "$SCRIPT_DIR/progress.sh" "$@"
            else
                echo "progress.sh not found"
                exit 1
            fi
            ;;

        dashboard)
            if [[ -f "$SCRIPT_DIR/progress.sh" ]]; then
                "$SCRIPT_DIR/progress.sh" dashboard
            else
                echo "progress.sh not found"
                exit 1
            fi
            ;;

        sync)
            if [[ -f "$SCRIPT_DIR/git-workflow.sh" ]]; then
                "$SCRIPT_DIR/git-workflow.sh" sync "$@"
            else
                echo "git-workflow.sh not found"
                exit 1
            fi
            ;;

        commit)
            if [[ -f "$SCRIPT_DIR/git-workflow.sh" ]]; then
                "$SCRIPT_DIR/git-workflow.sh" commit "$@"
            else
                echo "git-workflow.sh not found"
                exit 1
            fi
            ;;

        qc|quick-commit)
            if [[ -f "$SCRIPT_DIR/git-workflow.sh" ]]; then
                "$SCRIPT_DIR/git-workflow.sh" qc "$@"
            else
                echo "git-workflow.sh not found"
                exit 1
            fi
            ;;

        status)
            if [[ -f "$SCRIPT_DIR/git-workflow.sh" ]]; then
                "$SCRIPT_DIR/git-workflow.sh" status
            else
                echo "git-workflow.sh not found"
                exit 1
            fi
            ;;

        lock-check)
            if [[ -f "$SCRIPT_DIR/file-lock.sh" ]]; then
                "$SCRIPT_DIR/file-lock.sh" check "$@"
            else
                echo "file-lock.sh not found"
                exit 1
            fi
            ;;

        lock)
            if [[ -f "$SCRIPT_DIR/file-lock.sh" ]]; then
                "$SCRIPT_DIR/file-lock.sh" "$@"
            else
                echo "file-lock.sh not found"
                exit 1
            fi
            ;;

        agent)
            if [[ -f "$SCRIPT_DIR/upgrade-agent.sh" ]]; then
                "$SCRIPT_DIR/upgrade-agent.sh" "$@"
            else
                echo "upgrade-agent.sh not found"
                exit 1
            fi
            ;;

        process-issues)
            process_issues
            ;;

        doctor)
            doctor
            ;;

        migrate)
            if [[ -f "$SCRIPT_DIR/plan.sh" ]]; then
                "$SCRIPT_DIR/plan.sh" migrate
            else
                echo "plan.sh not found"
                exit 1
            fi
            ;;

        uninstall)
            uninstall
            ;;

        update)
            update_ctoc "$@"
            ;;

        help|--help|-h)
            show_help
            ;;

        version|--version|-v)
            echo "CTOC v$VERSION"
            ;;

        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc help' for usage."
            exit 1
            ;;
    esac
}

# Check for jq (warning only, not fatal for all commands)
check_jq() {
    if ! command -v jq &> /dev/null; then
        case "${1:-}" in
            skills|detect)
                echo "Warning: jq is required for this command but not installed." >&2
                echo "Install it with: sudo apt install jq (Ubuntu/Debian) or brew install jq (macOS)" >&2
                exit 1
                ;;
            *)
                # Don't fail for commands that don't need jq
                ;;
        esac
    fi
}

# Check for updates (once per day, silent on failure) - only if not being called from wrapper
if [[ -z "${CTOC_FROM_WRAPPER:-}" ]]; then
    if [[ -f "$SCRIPT_DIR/update-check.sh" ]]; then
        source "$SCRIPT_DIR/update-check.sh"
        check_for_updates 2>/dev/null || true
    fi
fi

check_jq "${1:-}"
main "$@"
