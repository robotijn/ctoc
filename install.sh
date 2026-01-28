#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief Installation Script (dynamic version)
#  "You are the CTO Chief. Command your army of 80 AI agents."
#
#  Full repo clone approach: One git clone, all agents & skills available, easy updates.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_URL="https://github.com/robotijn/ctoc.git"
REPO_RAW="https://raw.githubusercontent.com/robotijn/ctoc/main"
VERSION=$(curl -fsSL "$REPO_RAW/VERSION" 2>/dev/null || echo "unknown")

# State
EXISTING_INSTALL=false
ALIAS_ADDED=false
NO_JQ=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════════════════════════
#  Output Helpers
# ═══════════════════════════════════════════════════════════════════════════════

show_banner() {
    echo ""
    echo -e "${CYAN}   ██████╗████████╗ ██████╗  ██████╗${NC}"
    echo -e "${CYAN}  ██╔════╝╚══██╔══╝██╔═══██╗██╔════╝${NC}"
    echo -e "${CYAN}  ██║        ██║   ██║   ██║██║     ${NC}"
    echo -e "${CYAN}  ██║        ██║   ██║   ██║██║     ${NC}"
    echo -e "${CYAN}  ╚██████╗   ██║   ╚██████╔╝╚██████╗${NC}"
    echo -e "${CYAN}   ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝${NC}"
    echo -e "${BOLD}            CTO Chief v$VERSION${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${BLUE}[$1]${NC}"
}

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
    echo -e "  $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Dependency Checking
# ═══════════════════════════════════════════════════════════════════════════════

# State for hooks installation
INSTALL_HOOKS=false

check_dependencies() {
    print_section "Checking dependencies"

    local missing=()

    # Git (required)
    if command -v git &>/dev/null; then
        print_step "git"
    else
        print_fail "git (required)"
        missing+=("git")
    fi

    # jq (optional but recommended)
    if command -v jq &>/dev/null; then
        print_step "jq"
    else
        print_warn "jq (optional, some features limited)"
        NO_JQ=true
    fi

    # claude (optional)
    if command -v claude &>/dev/null; then
        print_step "claude (Claude Code CLI)"
    else
        print_warn "claude not found"
        print_info "         Install: npm install -g @anthropic-ai/claude-code"
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo ""
        echo -e "${RED}Required dependencies missing. Please install:${NC}"
        for dep in "${missing[@]}"; do
            echo "  • $dep"
        done
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Node.js Detection and Hooks Setup
# ═══════════════════════════════════════════════════════════════════════════════

check_nodejs() {
    print_section "Checking for Node.js"

    if command -v node &>/dev/null; then
        local node_version
        node_version=$(node --version)
        print_step "Node.js detected: $node_version"

        # Auto-enable hooks when Node.js is available
        INSTALL_HOOKS=true
        print_step "Hooks will be enabled"
    else
        print_warn "Node.js not detected"
        print_info "         Install Node.js to enable advanced features"
        INSTALL_HOOKS=false
    fi
}

install_nodejs() {
    print_step "Installing Node.js..."

    # Detect OS and use appropriate package manager
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &>/dev/null; then
            brew install node
        else
            echo "  Please install Homebrew first: https://brew.sh"
            INSTALL_HOOKS=false
            return
        fi
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        echo "  Installing Node.js via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
        sudo apt-get install -y nodejs 2>/dev/null
    elif [[ -f /etc/redhat-release ]]; then
        # RHEL/CentOS/Fedora
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - 2>/dev/null
        sudo yum install -y nodejs 2>/dev/null
    elif [[ -f /etc/arch-release ]]; then
        # Arch Linux
        sudo pacman -S --noconfirm nodejs npm 2>/dev/null
    else
        echo "  Please install Node.js manually: https://nodejs.org/"
        INSTALL_HOOKS=false
        return
    fi

    if command -v node &>/dev/null; then
        print_step "Node.js installed successfully: $(node --version)"
        INSTALL_HOOKS=true
    else
        print_fail "Node.js installation failed"
        INSTALL_HOOKS=false
    fi
}

setup_hooks() {
    if [[ "$INSTALL_HOOKS" == "true" ]]; then
        print_section "Setting up Claude Code hooks"

        # Create .claude directory
        mkdir -p .claude

        # Copy hooks configuration
        if [[ -f .ctoc/repo/hooks/hooks.json ]]; then
            # Check if .claude/settings.json exists
            if [[ -f .claude/settings.json ]]; then
                # Merge hooks into existing settings
                if command -v jq &>/dev/null; then
                    # Use jq to merge JSON files
                    jq -s '.[0] * .[1]' .claude/settings.json .ctoc/repo/hooks/hooks.json > .claude/settings.json.tmp
                    mv .claude/settings.json.tmp .claude/settings.json
                    print_step "Hooks merged into existing .claude/settings.json"
                else
                    # Without jq, just copy (may overwrite existing)
                    cp .ctoc/repo/hooks/hooks.json .claude/settings.json
                    print_warn "Hooks copied to .claude/settings.json (jq not available for merge)"
                fi
            else
                # No existing settings, just copy
                cp .ctoc/repo/hooks/hooks.json .claude/settings.json
                print_step "Hooks configured in .claude/settings.json"
            fi

            # Brief confirmation
            echo ""
            echo -e "${CYAN}Hooks enabled${NC} - CTOC will automatically detect your stack and track progress"
        else
            print_warn "hooks.json not found in repo, skipping"
        fi
    else
        print_info "Hooks not configured (Node.js not available)"
        print_info "         Install Node.js later to enable hooks"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Project Checking
# ═══════════════════════════════════════════════════════════════════════════════

check_project() {
    print_section "Checking project"

    # Git repository
    if [[ -d ".git" ]]; then
        print_step "Git repository detected"
    else
        print_warn "Not a git repository"
        echo ""
        read -p "  Continue anyway? (y/N): " -r response
        if [[ ! "$response" =~ ^[yY] ]]; then
            echo "  Initialize git first: git init"
            exit 1
        fi
    fi

    # Check .gitignore (silent - will auto-configure)
    if [[ -f ".gitignore" ]] && grep -q "^\.ctoc/$" .gitignore 2>/dev/null; then
        print_step ".ctoc/ in .gitignore"
    fi

    # Detect project types
    local detected=()

    if [[ -f "pyproject.toml" ]] || [[ -f "setup.py" ]] || [[ -f "requirements.txt" ]]; then
        detected+=("Python project")
    fi
    if [[ -f "package.json" ]]; then
        if grep -q '"typescript"' package.json 2>/dev/null; then
            detected+=("TypeScript project")
        else
            detected+=("JavaScript project")
        fi
    fi
    if [[ -f "Cargo.toml" ]]; then
        detected+=("Rust project")
    fi
    if [[ -f "go.mod" ]]; then
        detected+=("Go project")
    fi
    if [[ -f "Gemfile" ]]; then
        detected+=("Ruby project")
    fi
    if [[ -f "pom.xml" ]] || [[ -f "build.gradle" ]] || [[ -f "build.gradle.kts" ]]; then
        detected+=("Java project")
    fi
    if [[ -f "*.csproj" ]] || [[ -f "*.sln" ]]; then
        detected+=("C# project")
    fi

    for proj in "${detected[@]}"; do
        print_step "$proj"
    done

    if [[ ${#detected[@]} -eq 0 ]]; then
        print_warn "No known project type detected"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Existing Installation Check
# ═══════════════════════════════════════════════════════════════════════════════

check_existing() {
    if [[ -d ".ctoc/repo/.git" ]]; then
        local current_version
        current_version=$(cat .ctoc/repo/VERSION 2>/dev/null || echo "unknown")
        print_step "CTOC $current_version found at .ctoc/repo/"
        EXISTING_INSTALL=true
        return 0
    fi
    EXISTING_INSTALL=false
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Repository Installation
# ═══════════════════════════════════════════════════════════════════════════════

install_repo() {
    print_section "Installing CTOC"

    if [[ "$EXISTING_INSTALL" == "true" ]]; then
        upgrade_repo
        return
    fi

    # Fresh installation
    mkdir -p .ctoc

    print_info "Cloning repository..."
    if git clone --depth 1 --quiet "$REPO_URL" .ctoc/repo 2>/dev/null; then
        print_step "Cloned to .ctoc/repo/"
    else
        print_fail "Failed to clone repository"
        echo ""
        echo "  Try manually: git clone $REPO_URL .ctoc/repo"
        exit 1
    fi

    # Count skills
    local skill_count
    skill_count=$(find .ctoc/repo/.ctoc/skills -name "*.md" 2>/dev/null | wc -l)
    print_step "$skill_count skills available"

    # Create root-level plan directories (git-tracked)
    mkdir -p plans/{functional/{draft,approved},implementation/{draft,approved},todo,in_progress,review,done}
    print_step "Created plan directories (plans/)"

    # Create wrapper script
    create_wrapper_script
    print_step "Created wrapper script"

    # Create default settings if not exists
    if [[ ! -f ".ctoc/settings.yaml" ]]; then
        local project_name
        project_name=$(basename "$PWD")
        local tz
        tz=$(cat /etc/timezone 2>/dev/null || echo "UTC")

        cat > .ctoc/settings.yaml << SETTINGS
# CTOC Project Settings
# This file is project-specific and preserved during updates

project:
  name: "$project_name"
  timezone: "$tz"  # For plan dating (distributed teams)

# Update notifications
# When an update is available, Claude will ask if you want to update
updates:
  prompt_on_startup: true   # Ask about updates when starting
  auto_update: false        # Auto-update without asking (if prompt is off)

# Research configuration
research:
  enabled: true
  auto_steps: [1, 2, 5, 12]

# Language-specific commands (edit for your project)
# These are used when Iron Loop is injected into plans
# Uncomment and modify the sections relevant to your project
#
# languages:
#   typescript:
#     root: frontend/
#     lint: "npm run lint"
#     format: "npm run format"
#     typecheck: "npm run typecheck"
#     test: "npm test"
#     build: "npm run build"
#   python:
#     root: backend/
#     lint: "ruff check"
#     format: "ruff format --check"
#     typecheck: "mypy"
#     test: "pytest"

# Iron Loop Enforcement
# Controls whether Edit/Write operations are blocked before planning is complete
enforcement:
  # Mode: strict | soft | off
  # - strict: Blocks edit/write until both planning gates pass (recommended)
  # - soft: Warns but allows operations to proceed
  # - off: No enforcement (not recommended for production projects)
  mode: strict

  # Escape phrases that bypass strict enforcement
  # Say any of these to proceed without completing planning
  escape_phrases:
    - "skip planning"
    - "skip iron loop"
    - "quick fix"
    - "trivial fix"
    - "trivial change"
    - "hotfix"
    - "urgent"

# Skills read this session (reset on new session)
# This section is managed automatically
skills_read: []
SETTINGS
        print_step "Created settings.yaml"
    fi

    # Create counter file for plan naming
    if [[ ! -f ".ctoc/counter" ]]; then
        local today
        today=$(TZ="$tz" date +%Y-%m-%d)
        echo "${today}:0:${tz}" > .ctoc/counter
    fi
}

upgrade_repo() {
    print_info "Checking for updates..."

    cd .ctoc/repo
    git fetch --quiet 2>/dev/null || {
        print_warn "Could not check for updates (offline?)"
        cd - > /dev/null
        return 0
    }

    local local_version
    local_version=$(cat VERSION 2>/dev/null || echo "unknown")
    local remote_version
    remote_version=$(git show origin/main:VERSION 2>/dev/null || echo "$local_version")

    if [[ "$local_version" != "$remote_version" ]]; then
        echo ""
        echo -e "  ${CYAN}Update available: $local_version → $remote_version${NC}"
        echo ""

        # Backup project-specific files
        if [[ -f "../settings.yaml" ]]; then
            cp -f ../settings.yaml ../settings.yaml.backup 2>/dev/null || true
        fi

        git pull --rebase --quiet 2>/dev/null || git reset --hard origin/main --quiet
        print_step "Pulled latest changes"

        # Restore project-specific files
        if [[ -f "../settings.yaml.backup" ]]; then
            mv -f ../settings.yaml.backup ../settings.yaml 2>/dev/null || true
            print_step "Restored settings"
        fi

        # Show what's new
        show_whats_new "$local_version" "$remote_version"
    else
        print_step "Already up to date ($local_version)"
    fi

    cd - > /dev/null
}

show_whats_new() {
    local old_version="$1"
    local new_version="$2"

    echo ""
    echo -e "${CYAN}What's new in v$new_version:${NC}"

    # Try to show recent commits
    cd .ctoc/repo
    local changes
    changes=$(git log --oneline "v$old_version"..HEAD 2>/dev/null | head -5 || \
              git log --oneline -5 2>/dev/null || echo "")

    if [[ -n "$changes" ]]; then
        echo "$changes" | while read -r line; do
            echo "  • $line"
        done
    else
        echo "  • Various improvements and bug fixes"
    fi
    cd - > /dev/null
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Wrapper Script Creation
# ═══════════════════════════════════════════════════════════════════════════════

create_wrapper_script() {
    cat > .ctoc/ctoc << 'WRAPPER'
#!/bin/bash
# CTOC Wrapper Script
# Calls the actual script in repo/ and handles background update checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR/repo"

# Background update check (once per day)
check_update_background() {
    local last_check_file="$SCRIPT_DIR/.last-update-check"
    local now
    now=$(date +%s)
    local last_check=0

    [[ -f "$last_check_file" ]] && last_check=$(cat "$last_check_file" 2>/dev/null || echo "0")

    # 86400 seconds = 24 hours
    if (( now - last_check > 86400 )); then
        echo "$now" > "$last_check_file"
        # Run update check in background, suppress all output
        (
            cd "$REPO_DIR" 2>/dev/null || exit 0
            git fetch --quiet 2>/dev/null || exit 0
            local local_v
            local_v=$(cat VERSION 2>/dev/null || echo "")
            local remote_v
            remote_v=$(git show origin/main:VERSION 2>/dev/null || echo "")
            if [[ -n "$local_v" && -n "$remote_v" && "$local_v" != "$remote_v" ]]; then
                # Create a notification file that the main script can check
                echo "$remote_v" > "$SCRIPT_DIR/.update-available"
            fi
        ) &>/dev/null &
        disown 2>/dev/null || true
    fi

    # Check if we have a pending update notification
    if [[ -f "$SCRIPT_DIR/.update-available" ]]; then
        local new_version
        new_version=$(cat "$SCRIPT_DIR/.update-available" 2>/dev/null || echo "")
        local current_version
        current_version=$(cat "$REPO_DIR/VERSION" 2>/dev/null || echo "")
        if [[ -n "$new_version" && "$new_version" != "$current_version" ]]; then
            echo -e "\033[0;36mCTOC update available: $current_version → $new_version\033[0m"
            echo -e "Run: \033[1mctoc update\033[0m"
            echo ""
        else
            # Update was applied, remove notification
            rm -f "$SCRIPT_DIR/.update-available" 2>/dev/null || true
        fi
    fi
}

# Only check updates if not running a subcommand that does its own check
case "${1:-}" in
    update|doctor|version|--version|-v)
        # Skip background check for these commands
        ;;
    *)
        check_update_background
        ;;
esac

# Call actual script
exec "$REPO_DIR/.ctoc/bin/ctoc.sh" "$@"
WRAPPER
    chmod +x .ctoc/ctoc
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CLAUDE.md Configuration
# ═══════════════════════════════════════════════════════════════════════════════

configure_claude_md() {
    print_section "Configuration"

    if [[ -f "CLAUDE.md" ]]; then
        echo ""
        echo "  Found existing CLAUDE.md. How should we proceed?"
        echo ""
        echo "  [1] Merge (add CTOC sections, keep your content) - Recommended"
        echo "  [2] Replace (backup old as CLAUDE.md.backup, create new)"
        echo "  [3] Skip (don't touch CLAUDE.md)"
        echo ""
        read -p "  Choice [1-3]: " choice
        choice=${choice:-1}

        case $choice in
            1)
                # Run smart merge using init-claude-md.sh
                if [[ -x ".ctoc/repo/.ctoc/bin/init-claude-md.sh" ]]; then
                    .ctoc/repo/.ctoc/bin/init-claude-md.sh integrate "$(basename "$PWD")" "" ""
                    print_step "Merged CTOC sections into CLAUDE.md"
                else
                    print_warn "Could not find init-claude-md.sh, skipping merge"
                fi
                ;;
            2)
                cp CLAUDE.md CLAUDE.md.backup
                print_step "Backed up to CLAUDE.md.backup"
                create_fresh_claude_md
                ;;
            3)
                print_step "Skipped CLAUDE.md"
                ;;
            *)
                print_warn "Invalid choice, skipping CLAUDE.md"
                ;;
        esac
    else
        create_fresh_claude_md
    fi

    # Create IRON_LOOP.md if not exists
    if [[ ! -f "IRON_LOOP.md" ]]; then
        create_iron_loop_md
        print_step "Created IRON_LOOP.md"
    else
        print_step "IRON_LOOP.md already exists"
    fi

    # Generate PROJECT_MAP.md
    if [[ -x ".ctoc/repo/.ctoc/bin/explore-codebase.sh" ]]; then
        .ctoc/repo/.ctoc/bin/explore-codebase.sh generate 2>/dev/null && \
            print_step "Generated .ctoc/PROJECT_MAP.md" || \
            print_warn "Could not generate PROJECT_MAP.md"
    fi
}

create_fresh_claude_md() {
    local project_name
    project_name=$(basename "$PWD")

    if [[ -x ".ctoc/repo/.ctoc/bin/init-claude-md.sh" ]]; then
        .ctoc/repo/.ctoc/bin/init-claude-md.sh integrate "$project_name" "" ""
        print_step "Created CLAUDE.md"
    else
        # Fallback: copy template
        if [[ -f ".ctoc/repo/.ctoc/templates/CLAUDE.md.template" ]]; then
            cp ".ctoc/repo/.ctoc/templates/CLAUDE.md.template" CLAUDE.md
            sed -i "s/{{PROJECT_NAME}}/$project_name/g" CLAUDE.md 2>/dev/null || true
            print_step "Created CLAUDE.md from template"
        else
            print_warn "Could not create CLAUDE.md"
        fi
    fi
}

create_iron_loop_md() {
    local project_name
    project_name=$(basename "$PWD")

    cat > IRON_LOOP.md << IRON_EOF
# Iron Loop - $project_name

> Track progress through the 15-step methodology

## Current Status

| Step | Phase | Status | Notes |
|------|-------|--------|-------|
| 1. ASSESS | Planning | 🟡 In Progress | Understand the problem |
| 2. ALIGN | Planning | ⚪ Pending | Business alignment |
| 3. CAPTURE | Planning | ⚪ Pending | Gather requirements |
| 4. PLAN | Planning | ⚪ Pending | Design solution |
| 5. DESIGN | Planning | ⚪ Pending | Architecture decisions |
| 6. SPEC | Planning | ⚪ Pending | Technical specification |
| 7. TEST | Development | ⚪ Pending | Write tests first |
| 8. QUALITY | Development | ⚪ Pending | Quality gates |
| 9. IMPLEMENT | Development | ⚪ Pending | Write code |
| 10. REVIEW | Development | ⚪ Pending | Self-review as CTO |
| 11. OPTIMIZE | Delivery | ⚪ Pending | Performance tuning |
| 12. SECURE | Delivery | ⚪ Pending | Security validation |
| 13. DOCUMENT | Delivery | ⚪ Pending | Update docs |
| 14. VERIFY | Delivery | ⚪ Pending | Final validation |
| 15. COMMIT | Delivery | ⚪ Pending | Ship with confidence |

## Legend
- ⚪ Pending
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked

## Session Log

### $(date +%Y-%m-%d)
- CTOC initialized
- Project: $project_name
IRON_EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Git Setup
# ═══════════════════════════════════════════════════════════════════════════════

setup_gitignore() {
    # Silent setup - just add to .gitignore by default
    # Users can configure git submodule or other setups themselves

    # Check if already in .gitignore
    if grep -q "^\.ctoc/$" .gitignore 2>/dev/null; then
        return
    fi

    # Auto-add to .gitignore (safe default)
    if [[ -f .gitignore ]]; then
        echo "" >> .gitignore
        echo "# CTOC - CTO Chief (installed per-developer)" >> .gitignore
        echo ".ctoc/" >> .gitignore
    else
        echo "# CTOC - CTO Chief (installed per-developer)" > .gitignore
        echo ".ctoc/" >> .gitignore
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Shell Setup
# ═══════════════════════════════════════════════════════════════════════════════

setup_shell() {
    print_section "Shell setup"

    # Detect shell
    local shell_name
    shell_name=$(basename "$SHELL")
    local shell_rc=""

    case "$shell_name" in
        bash) shell_rc="$HOME/.bashrc" ;;
        zsh)  shell_rc="$HOME/.zshrc" ;;
        fish) shell_rc="$HOME/.config/fish/config.fish" ;;
    esac

    print_info "Detected shell: $shell_name"

    if [[ -z "$shell_rc" ]]; then
        print_warn "Unknown shell: $shell_name"
        print_info "         Add manually: alias ctoc='.ctoc/ctoc'"
        return
    fi

    # Check if alias already exists
    if grep -q "alias ctoc=" "$shell_rc" 2>/dev/null || \
       grep -q "alias ctoc " "$shell_rc" 2>/dev/null; then
        print_step "Alias already configured in $shell_rc"
        return
    fi

    echo ""
    read -p "  Add 'ctoc' alias to $shell_rc? [Y/n]: " response
    if [[ ! "$response" =~ ^[nN] ]]; then
        echo "" >> "$shell_rc"
        echo "# CTOC - CTO Chief" >> "$shell_rc"
        if [[ "$shell_name" == "fish" ]]; then
            echo "alias ctoc '.ctoc/ctoc'" >> "$shell_rc"
        else
            echo "alias ctoc='.ctoc/ctoc'" >> "$shell_rc"
        fi
        print_step "Alias added to $shell_rc"
        ALIAS_ADDED=true
    else
        print_step "Skipped alias setup"
        print_info "         Run manually: .ctoc/ctoc"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Final Menu
# ═══════════════════════════════════════════════════════════════════════════════

show_summary() {
    local skill_count
    skill_count=$(find .ctoc/repo/.ctoc/skills -name "*.md" 2>/dev/null | wc -l || echo "261")
    local agent_count
    agent_count=$(find .ctoc/repo/.ctoc/agents -name "*.md" 2>/dev/null | wc -l || echo "15")

    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ CTOC v$VERSION installed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}Summary:${NC}"
    echo "  • Repository: cloned to .ctoc/repo/"
    echo "  • Agents: 80 available ($agent_count core + 60 specialists)"
    echo "  • Skills: $skill_count available (50 languages, 200+ frameworks)"
    echo "  • Files: CLAUDE.md, IRON_LOOP.md, .ctoc/"
    if [[ "$INSTALL_HOOKS" == "true" ]]; then
        echo "  • Hooks: Enabled (.claude/settings.json)"
    else
        echo "  • Hooks: Disabled (install Node.js to enable)"
    fi
    if [[ "$ALIAS_ADDED" == "true" ]]; then
        echo "  • Alias: ctoc → .ctoc/ctoc"
    else
        echo "  • Command: .ctoc/ctoc (or add alias manually)"
    fi
    echo "  • Updates: Background check daily"
    echo ""
}

show_next_steps() {
    echo -e "${BOLD}Next steps:${NC}"
    echo ""
    if [[ "$ALIAS_ADDED" == "true" ]]; then
        echo "  Run 'source ~/.bashrc' (or restart terminal) to use the 'ctoc' alias."
        echo ""
    fi
    echo "  To start Claude Code:"
    echo -e "    ${CYAN}claude${NC}"
    echo ""
    echo "  To start with skip permissions:"
    echo -e "    ${CYAN}claude --dangerously-skip-permissions${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    show_banner

    check_dependencies

    check_project

    # Check for existing installation
    print_section "Checking existing installation"
    if check_existing; then
        # Upgrade flow
        install_repo
        check_nodejs
        setup_hooks
        setup_gitignore
        show_summary
        show_next_steps
    else
        # Fresh install flow
        print_info "No existing installation found"
        install_repo
        check_nodejs
        configure_claude_md
        setup_hooks
        setup_gitignore
        setup_shell
        show_summary
        show_next_steps
    fi
}

main "$@"
