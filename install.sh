#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief Installation Script
#  "You are the CTO Chief. Claude is your army of CTOs."
#
#  Smart skill loading: Downloads only the skills your project needs.
# ═══════════════════════════════════════════════════════════════════════════════

CTOC_VERSION="2.0.0"
CTOC_REPO="https://github.com/theaiguys/ctoc"
CTOC_RAW="https://raw.githubusercontent.com/theaiguys/ctoc/main"

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
check_directory() {
    if [[ -f "CLAUDE.md" ]]; then
        print_warning "CLAUDE.md already exists in this directory."
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted."
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

    # Download bin scripts
    local bin_files=(
        "ctoc.sh"
        "detect.sh"
        "download.sh"
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

    # Generate files
    generate_claude_md
    generate_iron_loop_md
    generate_planning_md
}

generate_claude_md() {
    print_step "Generating CLAUDE.md..."

    # Get lowercase language for skill file reference
    local lang_lower
    lang_lower=$(echo "$LANGUAGE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

    # Get framework skill path if detected
    local framework_skill_path=""
    if [[ -n "$FRAMEWORK" && "$NO_JQ" != "true" ]]; then
        local fw_lower
        fw_lower=$(echo "$FRAMEWORK" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
        framework_skill_path=$(jq -r --arg f "$fw_lower" '
            .skills.frameworks | to_entries[] | .value[$f].file // empty
        ' .ctoc/skills.json 2>/dev/null | head -1 || true)
    fi

    cat > CLAUDE.md << CLAUDE_EOF
# $PROJECT_NAME

> $DESCRIPTION

## CTO Persona

You are a **Senior CTO** with 20+ years of experience in $LANGUAGE${FRAMEWORK:+ and $FRAMEWORK}.
You have built and scaled systems at companies like Google, Stripe, and Airbnb.
Your role is to ensure this project meets the highest standards of engineering excellence.

## Technical Stack

- **Primary Language:** $LANGUAGE
${FRAMEWORK:+- **Framework:** $FRAMEWORK}

## Skills Library

Reference skills from \`.ctoc/skills/\` for language and framework-specific guidance.

**Active Skills:**
- \`.ctoc/skills/languages/$lang_lower.md\` - $LANGUAGE CTO standards
${framework_skill_path:+- \`.ctoc/skills/$framework_skill_path\` - $FRAMEWORK CTO standards}

**Skill Management:**
\`\`\`bash
# See all available skills (261 total)
.ctoc/bin/ctoc.sh skills list

# Add a new skill
.ctoc/bin/ctoc.sh skills add <skill-name>

# Auto-detect and sync skills
.ctoc/bin/ctoc.sh skills sync
\`\`\`

## Your Standards

### Non-Negotiables (Will Block PR)
1. Type safety / static analysis enabled
2. Tests for business logic
3. No secrets in code
4. Proper error handling
5. Documentation for public APIs

### Red Lines (Never Approve)
- Security vulnerabilities
- Untested critical paths
- Hardcoded configuration
- Missing input validation
- N+1 queries

## Commands

| Command | Action |
|---------|--------|
| \`ctoc plan\` | Enter planning mode - analyze requirements, create technical design |
| \`ctoc implement\` | Enter implementation mode - write code following Iron Loop |
| \`ctoc review\` | Enter review mode - CTO code review |
| \`ctoc improve\` | Suggest improvements to current code |

## Iron Loop Methodology

Follow the 12-step Iron Loop for all implementation:

1. **ASSESS** - Understand the problem
2. **PLAN** - Design the solution
3. **RISKS** - Identify what could go wrong
4. **PREPARE** - Set up environment
5. **ITERATE** - Build incrementally
6. **VALIDATE** - Test thoroughly
7. **DOCUMENT** - Explain decisions
8. **REVIEW** - Self-review as CTO
9. **SHIP** - Deploy confidently
10. **MONITOR** - Watch for issues
11. **LEARN** - Retrospective
12. **IMPROVE** - Apply lessons

See \`IRON_LOOP.md\` for current project status.
See \`PLANNING.md\` for feature backlog.

## Skill Auto-Sync

When you notice the project using a new technology (new dependencies, new file types),
automatically run skill sync to download relevant guidance:

\`\`\`bash
.ctoc/bin/ctoc.sh skills sync
\`\`\`
CLAUDE_EOF

    print_success "CLAUDE.md created"
}

generate_iron_loop_md() {
    print_step "Generating IRON_LOOP.md..."

    cat > IRON_LOOP.md << IRON_EOF
# Iron Loop - $PROJECT_NAME

> Track progress through the 12-step methodology

## Current Status

| Step | Status | Notes |
|------|--------|-------|
| 1. ASSESS | 🟡 In Progress | Initial project setup |
| 2. PLAN | ⚪ Pending | |
| 3. RISKS | ⚪ Pending | |
| 4. PREPARE | ⚪ Pending | |
| 5. ITERATE | ⚪ Pending | |
| 6. VALIDATE | ⚪ Pending | |
| 7. DOCUMENT | ⚪ Pending | |
| 8. REVIEW | ⚪ Pending | |
| 9. SHIP | ⚪ Pending | |
| 10. MONITOR | ⚪ Pending | |
| 11. LEARN | ⚪ Pending | |
| 12. IMPROVE | ⚪ Pending | |

## Legend
- ⚪ Pending
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked

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
    echo -e "${GREEN}  CTOC installed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "  Files created:"
    echo "    • CLAUDE.md     - CTO instructions for Claude"
    echo "    • IRON_LOOP.md  - Progress tracking"
    echo "    • PLANNING.md   - Feature backlog"
    echo "    • .ctoc/        - Skills library ($skill_count skills downloaded)"
    echo
    echo "  Skill commands:"
    echo "    • .ctoc/bin/ctoc.sh skills list     - See all 261 available skills"
    echo "    • .ctoc/bin/ctoc.sh skills add NAME - Add a specific skill"
    echo "    • .ctoc/bin/ctoc.sh skills sync     - Auto-detect & download skills"
    echo
    echo "  Next steps:"
    echo "    1. Review and customize CLAUDE.md"
    echo "    2. Run 'claude' in this directory"
    echo "    3. Claude is now your CTO!"
    echo
}

main "$@"
