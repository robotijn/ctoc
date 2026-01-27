#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief CLI
#  Main entry point for skill management and operations
#  Version is read from VERSION file
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read version from VERSION file
if [[ -f "$SCRIPT_DIR/../../VERSION" ]]; then
    VERSION=$(cat "$SCRIPT_DIR/../../VERSION" 2>/dev/null | tr -d '[:space:]')
else
    VERSION="unknown"
fi

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

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Bootstrap Check - Ensure operations system is ready
# ═══════════════════════════════════════════════════════════════════════════════

bootstrap_check() {
    local ctoc_dir=".ctoc"
    local cache_dir="$ctoc_dir/cache"

    # Auto-create cache directory if missing
    if [[ ! -d "$cache_dir" ]]; then
        mkdir -p "$cache_dir" 2>/dev/null || true
    fi

    # Check if operations directory exists (for operations that need it)
    if [[ ! -d "$ctoc_dir/operations" ]] && [[ ! -d "$ctoc_dir/repo/.ctoc/operations" ]]; then
        return 1
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Operations Agent Routing
# ═══════════════════════════════════════════════════════════════════════════════

get_operations_registry() {
    # Find operations-registry.yaml in various locations
    if [[ -f ".ctoc/operations-registry.yaml" ]]; then
        echo ".ctoc/operations-registry.yaml"
    elif [[ -f ".ctoc/repo/.ctoc/operations-registry.yaml" ]]; then
        echo ".ctoc/repo/.ctoc/operations-registry.yaml"
    else
        echo ""
    fi
}

check_cache_validity() {
    local cache_file="$1"
    local ttl_hours="${2:-1}"

    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi

    # Get cache file modification time
    local cache_mtime
    if [[ "$(uname)" == "Darwin" ]]; then
        cache_mtime=$(stat -f %m "$cache_file" 2>/dev/null || echo 0)
    else
        cache_mtime=$(stat -c %Y "$cache_file" 2>/dev/null || echo 0)
    fi

    local now
    now=$(date +%s)
    local age=$((now - cache_mtime))
    local ttl_seconds=$((ttl_hours * 3600))

    if [[ $age -gt $ttl_seconds ]]; then
        return 1
    fi

    # Check for file changes since cache (simplified - checks common patterns)
    local project_mtime=0
    for pattern in "*.py" "*.ts" "*.tsx" "*.js" "*.jsx" "package.json" "pyproject.toml" "Cargo.toml" "go.mod"; do
        local latest
        latest=$(find . -maxdepth 3 -name "$pattern" -newer "$cache_file" 2>/dev/null | head -1)
        if [[ -n "$latest" ]]; then
            return 1
        fi
    done

    return 0
}

invoke_operation_agent() {
    local operation_name="$1"
    shift
    local args="$*"

    local registry
    registry=$(get_operations_registry)

    if [[ -z "$registry" ]]; then
        echo -e "${YELLOW}Operations registry not found.${NC}" >&2
        echo "Run 'ctoc doctor' to check installation." >&2
        return 1
    fi

    # Check if operation exists in registry (simple grep check)
    if ! grep -q "^  $operation_name:" "$registry" 2>/dev/null; then
        echo -e "${RED}Unknown operation: $operation_name${NC}" >&2
        return 1
    fi

    # Get operation path from registry
    local operation_path
    operation_path=$(grep -A1 "^  $operation_name:" "$registry" | grep "path:" | sed 's/.*path: *//' | tr -d '"' | tr -d "'" 2>/dev/null)

    if [[ -z "$operation_path" ]]; then
        echo -e "${RED}Could not find path for operation: $operation_name${NC}" >&2
        return 1
    fi

    # Find the actual operation file
    local operation_file=""
    if [[ -f ".ctoc/$operation_path" ]]; then
        operation_file=".ctoc/$operation_path"
    elif [[ -f ".ctoc/repo/.ctoc/$operation_path" ]]; then
        operation_file=".ctoc/repo/.ctoc/$operation_path"
    fi

    if [[ -z "$operation_file" ]] || [[ ! -f "$operation_file" ]]; then
        echo -e "${YELLOW}Operation file not found: $operation_path${NC}" >&2
        echo "The operations system requires agent files to be present." >&2
        return 1
    fi

    # Output instruction for Claude Code to invoke via Task tool
    echo ""
    echo -e "${CYAN}Invoking $operation_name agent...${NC}"
    echo ""
    echo "─────────────────────────────────────────────────────────────────"
    echo -e "${BOLD}AGENT INVOCATION REQUIRED${NC}"
    echo "─────────────────────────────────────────────────────────────────"
    echo ""
    echo "This operation requires Claude Code's Task tool to execute."
    echo ""
    echo "Operation:   $operation_name"
    echo "Agent file:  $operation_file"
    if [[ -n "$args" ]]; then
        echo "Arguments:   $args"
    fi
    echo ""
    echo "To run this operation, use the Task tool with:"
    echo "  - Read the agent file: $operation_file"
    echo "  - Follow the instructions in the agent file"
    echo ""
    echo "─────────────────────────────────────────────────────────────────"

    return 0
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

OPERATION COMMANDS:
    understand               Semantic codebase understanding (agent-powered)
    setup                    Intelligent project setup (agent-powered)

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

    # Search in framework names and keywords (simple grep-based approach)
    echo ""
    echo "Frameworks:"
    jq -r '.skills.frameworks | to_entries[] | .value | keys[]' "$index" 2>/dev/null | \
        grep -i "$query" | sort -u | sed 's/^/  - /' || true
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
    # Route to issue-processor operation agent
    echo ""
    echo -e "${CYAN}Processing GitHub Issues${NC}"
    echo ""
    echo "This operation uses the issue-processor agent."
    echo "The agent will:"
    echo "  1. Fetch issues with 'ready-to-process' label"
    echo "  2. Analyze each issue for skill improvements"
    echo "  3. Apply validated changes"
    echo ""

    # Try to invoke the operation agent
    invoke_operation_agent "issue-processor" "$@" 2>/dev/null || {
        echo "Run this from within Claude Code for full functionality."
        echo ""
        echo "Manual alternative:"
        echo "  gh issue list -l ready-to-process --json number,title,body"
    }
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
            local cache_file=".ctoc/cache/understanding.yaml"

            # Check if we should use cached understanding
            if check_cache_validity "$cache_file" 1; then
                echo ""
                echo -e "${GREEN}Using cached understanding${NC} (< 1 hour old, no file changes)"
                echo ""
                cat "$cache_file"
                echo ""
                echo -e "${CYAN}Tip:${NC} Run 'ctoc understand' to refresh the analysis."
                exit 0
            fi

            # Try to invoke understand agent if available
            local registry
            registry=$(get_operations_registry)
            if [[ -n "$registry" ]] && grep -q "^  understand:" "$registry" 2>/dev/null; then
                echo ""
                echo -e "${CYAN}Cache expired or missing. Agent invocation needed.${NC}"
                invoke_operation_agent "understand" "$mode"
                exit 0
            fi

            # Fallback to legacy detect.sh
            if [[ -f "$SCRIPT_DIR/detect.sh" ]]; then
                "$SCRIPT_DIR/detect.sh" "$mode"
            else
                echo "detect.sh not found"
                exit 1
            fi
            ;;

        understand)
            # Semantic codebase understanding via agent
            local cache_file=".ctoc/cache/understanding.yaml"

            # Check cache validity first
            if check_cache_validity "$cache_file" 1; then
                echo ""
                echo -e "${GREEN}Cached understanding is still valid${NC} (< 1 hour old, no file changes)"
                echo ""
                echo "Use 'ctoc detect' to view the cached understanding."
                echo "Use 'ctoc understand --force' to force a refresh."
                echo ""

                # Check for --force flag
                if [[ "${1:-}" == "--force" ]] || [[ "${1:-}" == "-f" ]]; then
                    echo -e "${CYAN}Force refresh requested...${NC}"
                else
                    exit 0
                fi
            fi

            invoke_operation_agent "understand" "$@"
            ;;

        setup)
            # Intelligent project setup via agent
            if ! bootstrap_check; then
                echo ""
                echo -e "${YELLOW}Operations system not fully initialized.${NC}"
                echo ""
                echo "The setup operation requires the operations directory structure."
                echo "Run 'ctoc doctor' to check installation status."
                echo ""
            fi

            invoke_operation_agent "project-setup" "$@"
            ;;

        research)
            # Inline research settings management (no external script needed)
            local subcmd="${1:-status}"
            local settings_file=".ctoc/settings.yaml"
            if [[ ! -f "$settings_file" ]] && [[ -f ".ctoc/repo/.ctoc/settings.yaml" ]]; then
                settings_file=".ctoc/repo/.ctoc/settings.yaml"
            fi

            case "$subcmd" in
                status)
                    echo ""
                    echo -e "${CYAN}Research Settings${NC}"
                    echo ""
                    if command -v yq &>/dev/null && [[ -f "$settings_file" ]]; then
                        local enabled
                        enabled=$(yq '.research.websearch_enabled // true' "$settings_file" 2>/dev/null)
                        local steps
                        steps=$(yq '.research.auto_research_steps // "1,6"' "$settings_file" 2>/dev/null)
                        echo "  WebSearch: $enabled"
                        echo "  Auto-research steps: $steps"
                    else
                        echo "  WebSearch: enabled (default)"
                        echo "  Auto-research steps: 1, 6 (default)"
                        echo ""
                        echo "  (Install yq for advanced settings management)"
                    fi
                    echo ""
                    ;;
                on)
                    echo "WebSearch enabled (this is the default)"
                    ;;
                off)
                    echo "WebSearch disabled for this session"
                    echo "Note: Edit settings.yaml to persist this setting"
                    ;;
                *)
                    echo "Usage: ctoc research [status|on|off]"
                    exit 1
                    ;;
            esac
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

        lock-check|lock)
            # Inline file freshness check (no external script needed)
            local subcmd="${1:-check}"
            shift || true

            case "$subcmd" in
                check)
                    local file="${1:-}"
                    if [[ -z "$file" ]]; then
                        echo "Usage: ctoc lock check <file>"
                        exit 1
                    fi
                    if [[ ! -f "$file" ]]; then
                        echo -e "${RED}File not found: $file${NC}"
                        exit 1
                    fi
                    # Check if file has been modified since last commit
                    if git diff --quiet HEAD -- "$file" 2>/dev/null; then
                        echo -e "${GREEN}✓ $file is fresh (matches HEAD)${NC}"
                    else
                        echo -e "${YELLOW}⚠ $file has local modifications${NC}"
                    fi
                    # Check if there are remote changes
                    git fetch --quiet 2>/dev/null || true
                    if git diff --quiet HEAD..origin/main -- "$file" 2>/dev/null; then
                        echo -e "${GREEN}✓ $file is up to date with remote${NC}"
                    else
                        echo -e "${YELLOW}⚠ $file may have remote changes${NC}"
                    fi
                    ;;
                resolve)
                    echo "Resolving conflicts..."
                    if git mergetool 2>/dev/null; then
                        echo -e "${GREEN}✓ Conflicts resolved${NC}"
                    else
                        echo -e "${YELLOW}Use 'git mergetool' or resolve manually${NC}"
                    fi
                    ;;
                setup-rerere)
                    git config rerere.enabled true
                    echo -e "${GREEN}✓ Git rerere enabled${NC}"
                    ;;
                worktree)
                    local action="${1:-}"
                    local branch="${2:-}"
                    if [[ "$action" == "new" ]] && [[ -n "$branch" ]]; then
                        local path="../worktrees/$branch"
                        git worktree add "$path" -b "$branch" 2>/dev/null || \
                            git worktree add "$path" "$branch"
                        echo -e "${GREEN}✓ Worktree created at $path${NC}"
                    else
                        echo "Usage: ctoc lock worktree new <branch>"
                    fi
                    ;;
                *)
                    echo "Usage: ctoc lock [check|resolve|setup-rerere|worktree]"
                    exit 1
                    ;;
            esac
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
            # Unknown command - suggest similar commands or route to smart-router
            echo ""
            echo -e "${YELLOW}Unknown command: $cmd${NC}"
            echo ""

            # Simple typo detection for common commands
            case "$cmd" in
                understnad|udnerstand|undertsand)
                    echo -e "Did you mean: ${GREEN}ctoc understand${NC}?"
                    ;;
                detct|detetc|dtect)
                    echo -e "Did you mean: ${GREEN}ctoc detect${NC}?"
                    ;;
                staus|stauts|statsu)
                    echo -e "Did you mean: ${GREEN}ctoc status${NC}?"
                    ;;
                pln|plna|paln)
                    echo -e "Did you mean: ${GREEN}ctoc plan${NC}?"
                    ;;
                *)
                    # Try smart-router for intelligent intent analysis
                    if invoke_operation_agent "smart-router" "$cmd" "$@" 2>/dev/null; then
                        exit 0
                    fi
                    echo "Run 'ctoc help' for available commands."
                    ;;
            esac
            echo ""
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

# Bootstrap check - ensure cache directory exists
if [[ -d ".ctoc" ]] && [[ ! -d ".ctoc/cache" ]]; then
    mkdir -p ".ctoc/cache" 2>/dev/null || true
fi

# Show hint if operations directory is missing (only for operation-related commands)
case "${1:-}" in
    understand|setup|detect)
        if [[ ! -d ".ctoc/operations" ]] && [[ ! -d ".ctoc/repo/.ctoc/operations" ]]; then
            echo -e "${YELLOW}Note:${NC} Operations directory not found." >&2
            echo "Some agent-powered features may be limited." >&2
            echo "Run 'ctoc update' to get the latest version." >&2
            echo "" >&2
        fi
        ;;
esac

check_jq "${1:-}"
main "$@"
