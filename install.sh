#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief Installation Script
#  "You are the CTO Chief. Claude is your army of CTOs."
#
#  Smart skill loading: Downloads only the skills your project needs.
# ═══════════════════════════════════════════════════════════════════════════════

CTOC_VERSION="3.0.0"
CTOC_REPO="https://github.com/robotijn/ctoc"
CTOC_RAW="https://raw.githubusercontent.com/robotijn/ctoc/main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${CYAN}"
    cat << 'BANNER'
   _____ _______ ____   _____
  / ____|__   __/ __ \ / ____|
 | |       | | | |  | | |
 | |       | | | |  | | |
 | |____   | | | |__| | |____
  \_____|  |_|  \____/ \_____|

  CTO Chief - Your Army of Virtual CTOs
BANNER
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in a git repository or project directory
# Smart merge handled by init-claude-md.sh during setup_project
check_directory() {
    # Directory check - allow existing CLAUDE.md (will be smart-merged)
    if [[ ! -d ".git" ]]; then
        print_warning "Not a git repository. CTOC works best with git."
        read -p "Continue anyway? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Initialize git first: git init"
            exit 1
        fi
    fi
}

# Check for required tools
check_requirements() {
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Installing for skill management..."
        print_warning "You can install it with: sudo apt install jq (Ubuntu) or brew install jq (macOS)"
        print_warning "Continuing without smart skill detection..."
        NO_JQ=true
    else
        NO_JQ=false
    fi
}

# Download core CTOC files (bin scripts + skills.json)
download_core() {
    print_step "Downloading CTOC core files..."

    # Create directories
    mkdir -p .ctoc/bin
    mkdir -p .ctoc/skills/languages
    mkdir -p .ctoc/skills/frameworks
    mkdir -p .ctoc/templates
    mkdir -p .ctoc/agents
    mkdir -p .ctoc/plans

    # Download bin scripts
    local bin_files=(
        "ctoc.sh"
        "detect.sh"
        "download.sh"
        "init-claude-md.sh"
        "process-issues.sh"
        "plan.sh"
        "progress.sh"
        "git-workflow.sh"
        "file-lock.sh"
        "upgrade-agent.sh"
    )

    for file in "${bin_files[@]}"; do
        curl -sL "$CTOC_RAW/.ctoc/bin/$file" -o ".ctoc/bin/$file" 2>/dev/null || {
            print_warning "Failed to download $file"
        }
        chmod +x ".ctoc/bin/$file" 2>/dev/null || true
    done

    # Download skills index
    curl -sL "$CTOC_RAW/.ctoc/skills.json" -o ".ctoc/skills.json" 2>/dev/null || {
        print_error "Failed to download skills.json"
        exit 1
    }

    # Download templates
    curl -sL "$CTOC_RAW/.ctoc/templates/CLAUDE.md.template" -o ".ctoc/templates/CLAUDE.md.template" 2>/dev/null || true
    curl -sL "$CTOC_RAW/.ctoc/templates/IRON_LOOP.md.template" -o ".ctoc/templates/IRON_LOOP.md.template" 2>/dev/null || true
    curl -sL "$CTOC_RAW/.ctoc/templates/PLANNING.md.template" -o ".ctoc/templates/PLANNING.md.template" 2>/dev/null || true

    # Download agent versions
    curl -sL "$CTOC_RAW/.ctoc/agents/versions.yaml" -o ".ctoc/agents/versions.yaml" 2>/dev/null || true

    print_success "Core files installed"
}

# Detect and download only needed skills
download_skills() {
    if [[ "$NO_JQ" == "true" ]]; then
        print_warning "Skipping smart skill detection (jq not installed)"
        return
    fi

    print_step "Detecting project technologies..."

    # Run detection
    local detected
    detected=$(.ctoc/bin/detect.sh all json 2>/dev/null || echo '{"languages":[],"frameworks":[]}')

    local languages
    local frameworks
    languages=$(echo "$detected" | jq -r '.languages[]' 2>/dev/null || true)
    frameworks=$(echo "$detected" | jq -r '.frameworks[]' 2>/dev/null || true)

    # Count detected skills
    local lang_count=0
    local frame_count=0
    for l in $languages; do [[ -n "$l" ]] && ((lang_count++)) || true; done
    for f in $frameworks; do [[ -n "$f" ]] && ((frame_count++)) || true; done

    if [[ $lang_count -eq 0 && $frame_count -eq 0 ]]; then
        print_warning "No technologies detected. Skills can be added later with: ctoc skills add <name>"
        return
    fi

    echo ""
    echo "Detected technologies:"
    for lang in $languages; do
        [[ -n "$lang" ]] && echo "  - $lang (language)"
    done
    for framework in $frameworks; do
        [[ -n "$framework" ]] && echo "  - $framework (framework)"
    done
    echo ""

    # Download detected skills
    print_step "Downloading detected skills..."

    local download_count=0
    local total_size=0

    # Download languages
    for lang in $languages; do
        [[ -z "$lang" ]] && continue
        local path
        path=$(jq -r --arg l "$lang" '.skills.languages[$l].file // empty' .ctoc/skills.json)
        if [[ -n "$path" ]]; then
            local size
            size=$(jq -r --arg l "$lang" '.skills.languages[$l].size // 0' .ctoc/skills.json)
            mkdir -p ".ctoc/skills/$(dirname "$path")"
            if curl -sL "$CTOC_RAW/.ctoc/skills/$path" -o ".ctoc/skills/$path" 2>/dev/null; then
                echo "  ✓ $lang"
                ((download_count++))
                ((total_size += size))
            else
                echo "  ✗ $lang (failed)"
            fi
        fi
    done

    # Download frameworks (and their required languages)
    for framework in $frameworks; do
        [[ -z "$framework" ]] && continue

        # Get framework info
        local path
        local requires
        path=$(jq -r --arg f "$framework" '
            .skills.frameworks | to_entries[] | .value[$f].file // empty
        ' .ctoc/skills.json | head -1)

        requires=$(jq -r --arg f "$framework" '
            .skills.frameworks | to_entries[] | .value[$f].requires[]? // empty
        ' .ctoc/skills.json)

        # Download required languages first
        for req in $requires; do
            [[ -z "$req" ]] && continue
            if [[ ! -f ".ctoc/skills/languages/$req.md" ]]; then
                local req_path
                req_path=$(jq -r --arg l "$req" '.skills.languages[$l].file // empty' .ctoc/skills.json)
                if [[ -n "$req_path" ]]; then
                    mkdir -p ".ctoc/skills/languages"
                    if curl -sL "$CTOC_RAW/.ctoc/skills/$req_path" -o ".ctoc/skills/$req_path" 2>/dev/null; then
                        echo "  ✓ $req (dependency)"
                        ((download_count++))
                    fi
                fi
            fi
        done

        # Download the framework
        if [[ -n "$path" ]]; then
            local size
            size=$(jq -r --arg f "$framework" '
                .skills.frameworks | to_entries[] | .value[$f].size // 0
            ' .ctoc/skills.json | head -1)
            mkdir -p ".ctoc/skills/$(dirname "$path")"
            if curl -sL "$CTOC_RAW/.ctoc/skills/$path" -o ".ctoc/skills/$path" 2>/dev/null; then
                echo "  ✓ $framework"
                ((download_count++))
                ((total_size += size))
            else
                echo "  ✗ $framework (failed)"
            fi
        fi
    done

    echo ""
    print_success "Downloaded $download_count skills (~$((total_size / 1024))KB)"
}

# Interactive project setup
setup_project() {
    print_step "Setting up your project..."
    echo

    # Get project name
    DEFAULT_NAME=$(basename "$PWD")
    read -p "Project name [$DEFAULT_NAME]: " PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-$DEFAULT_NAME}

    # Get primary language (from detected or manual)
    local detected_langs=""
    if [[ "$NO_JQ" != "true" && -f ".ctoc/skills.json" ]]; then
        detected_langs=$(.ctoc/bin/detect.sh languages 2>/dev/null | head -1 || true)
    fi

    if [[ -n "$detected_langs" ]]; then
        echo
        echo "Detected primary language: $detected_langs"
        read -p "Use this language? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            detected_langs=""
        fi
    fi

    if [[ -z "$detected_langs" ]]; then
        echo
        echo "Primary language:"
        echo "  1) Python      6) Go          11) Swift"
        echo "  2) TypeScript  7) Rust        12) Kotlin"
        echo "  3) JavaScript  8) C#          13) Other"
        echo "  4) Java        9) PHP"
        echo "  5) Ruby       10) Elixir"
        echo
        read -p "Select [1-13]: " LANG_CHOICE

        case $LANG_CHOICE in
            1) LANGUAGE="Python" ;;
            2) LANGUAGE="TypeScript" ;;
            3) LANGUAGE="JavaScript" ;;
            4) LANGUAGE="Java" ;;
            5) LANGUAGE="Ruby" ;;
            6) LANGUAGE="Go" ;;
            7) LANGUAGE="Rust" ;;
            8) LANGUAGE="C#" ;;
            9) LANGUAGE="PHP" ;;
            10) LANGUAGE="Elixir" ;;
            11) LANGUAGE="Swift" ;;
            12) LANGUAGE="Kotlin" ;;
            *)
                read -p "Enter language: " LANGUAGE
                ;;
        esac
    else
        LANGUAGE="$detected_langs"
    fi

    # Get framework (optional, from detected or manual)
    local detected_framework=""
    if [[ "$NO_JQ" != "true" && -f ".ctoc/skills.json" ]]; then
        detected_framework=$(.ctoc/bin/detect.sh frameworks 2>/dev/null | head -1 || true)
    fi

    if [[ -n "$detected_framework" ]]; then
        echo
        echo "Detected framework: $detected_framework"
        read -p "Use this framework? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            detected_framework=""
        fi
    fi

    if [[ -z "$detected_framework" ]]; then
        echo
        read -p "Primary framework (optional, e.g., FastAPI, React, Django): " FRAMEWORK
    else
        FRAMEWORK="$detected_framework"
    fi

    # Get project description
    echo
    read -p "One-line project description: " DESCRIPTION

    # Use smart CLAUDE.md integration (handles existing files)
    .ctoc/bin/init-claude-md.sh integrate "$PROJECT_NAME" "$LANGUAGE" "$FRAMEWORK"

    generate_iron_loop_md
    generate_planning_md
}

# Note: CLAUDE.md generation is now handled by init-claude-md.sh
# which supports smart merge with existing CLAUDE.md files

generate_iron_loop_md() {
    print_step "Generating IRON_LOOP.md..."

    cat > IRON_LOOP.md << IRON_EOF
# Iron Loop - $PROJECT_NAME

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

## Research Protocol

Before implementing, use parallel web search agents for:
1. **Validate assumptions** - Search for current best practices (2026)
2. **Check dependencies** - Search for security advisories
3. **Find patterns** - Search for similar implementations
4. **Verify APIs** - Search for current documentation

**Subagent count:** max(2, CPU_CORES - 4)

## Session Log

### $(date +%Y-%m-%d)
- CTOC initialized
- Project: $PROJECT_NAME
- Language: $LANGUAGE
${FRAMEWORK:+- Framework: $FRAMEWORK}
IRON_EOF

    print_success "IRON_LOOP.md created"
}

generate_planning_md() {
    print_step "Generating PLANNING.md..."

    cat > PLANNING.md << PLANNING_EOF
# Planning - $PROJECT_NAME

> $DESCRIPTION

## Vision

*TODO: Define the vision for this project*

## Architecture

*TODO: High-level architecture decisions*

## Feature Backlog

### Phase 1: Foundation
- [ ] Project setup
- [ ] Core architecture
- [ ] Basic functionality

### Phase 2: Core Features
- [ ] *TODO: Define features*

### Phase 3: Polish
- [ ] Testing
- [ ] Documentation
- [ ] Performance optimization

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | $LANGUAGE | *TODO* |
${FRAMEWORK:+| Framework | $FRAMEWORK | *TODO* |}

## Dependencies

*TODO: Key dependencies and why*

## Open Questions

- *TODO: Questions to resolve*
PLANNING_EOF

    print_success "PLANNING.md created"
}

# Add to .gitignore
setup_gitignore() {
    print_step "Updating .gitignore..."

    if [[ -f .gitignore ]]; then
        # Check if .ctoc already in gitignore
        if ! grep -q "^\.ctoc/$" .gitignore 2>/dev/null; then
            echo "" >> .gitignore
            echo "# CTOC - Skills library (optional: can be tracked or ignored)" >> .gitignore
            echo "# .ctoc/" >> .gitignore
        fi
    else
        cat > .gitignore << 'GITIGNORE'
# CTOC - Skills library (optional: can be tracked or ignored)
# .ctoc/
GITIGNORE
    fi

    print_success ".gitignore updated"
}

# Main
main() {
    print_banner
    echo "Version $CTOC_VERSION - Smart Skill Loading"
    echo

    check_directory
    check_requirements
    download_core
    download_skills
    setup_project
    setup_gitignore

    # Count downloaded skills
    local skill_count=0
    if [[ -d ".ctoc/skills" ]]; then
        skill_count=$(find .ctoc/skills -name "*.md" -type f 2>/dev/null | wc -l)
    fi

    echo
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  CTOC v$CTOC_VERSION installed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "  Files created/updated:"
    echo "    • CLAUDE.md     - CTO instructions (smart-merged)"
    echo "    • IRON_LOOP.md  - 15-step progress tracking"
    echo "    • PLANNING.md   - Feature backlog"
    echo "    • .ctoc/        - Skills library ($skill_count skills downloaded)"
    echo
    echo "  Skill commands:"
    echo "    • .ctoc/bin/ctoc.sh skills list       - See all 261 available skills"
    echo "    • .ctoc/bin/ctoc.sh skills add NAME   - Add a specific skill"
    echo "    • .ctoc/bin/ctoc.sh skills sync       - Auto-detect & download skills"
    echo "    • .ctoc/bin/ctoc.sh skills feedback   - Suggest skill improvements"
    echo
    echo "  GitHub integration (requires gh CLI):"
    echo "    • .ctoc/bin/ctoc.sh process-issues   - Process community suggestions"
    echo
    echo "  Next steps:"
    echo "    1. Review and customize CLAUDE.md"
    echo "    2. Run 'claude' in this directory"
    echo "    3. Claude is now your CTO!"
    echo
    echo "  Iron Loop: Use many parallel subagents for research phases!"
    echo "    Subagent count: max(2, CPU_CORES - 4)"
    echo
}

main "$@"
