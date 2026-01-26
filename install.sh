#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief Installation Script
#  "You are the CTO Chief. Claude is your army of CTOs."
# ═══════════════════════════════════════════════════════════════════════════════

CTOC_VERSION="1.0.0"
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

# Download .ctoc skills library
download_skills() {
    print_step "Downloading CTOC skills library..."
    
    # Create .ctoc directory
    mkdir -p .ctoc/skills/languages
    mkdir -p .ctoc/skills/frameworks/web
    mkdir -p .ctoc/skills/frameworks/mobile
    mkdir -p .ctoc/skills/frameworks/data
    mkdir -p .ctoc/skills/frameworks/ai-ml
    mkdir -p .ctoc/templates
    
    # Download via git clone (sparse checkout) or curl
    if command -v git &> /dev/null; then
        # Clone just the .ctoc folder
        git clone --depth 1 --filter=blob:none --sparse "$CTOC_REPO" .ctoc-temp 2>/dev/null || {
            print_warning "Git sparse checkout failed, using curl..."
            download_with_curl
            return
        }
        cd .ctoc-temp
        git sparse-checkout set .ctoc
        cd ..
        cp -r .ctoc-temp/.ctoc/* .ctoc/
        rm -rf .ctoc-temp
    else
        download_with_curl
    fi
    
    print_success "Skills library installed (.ctoc/)"
}

download_with_curl() {
    # Fallback: download key files with curl
    print_step "Downloading with curl (this may take a moment)..."
    
    # Download templates
    curl -sL "$CTOC_RAW/.ctoc/templates/CLAUDE.md.template" -o .ctoc/templates/CLAUDE.md.template 2>/dev/null || true
    curl -sL "$CTOC_RAW/.ctoc/templates/IRON_LOOP.md.template" -o .ctoc/templates/IRON_LOOP.md.template 2>/dev/null || true
    curl -sL "$CTOC_RAW/.ctoc/templates/PLANNING.md.template" -o .ctoc/templates/PLANNING.md.template 2>/dev/null || true
    
    # For now, download a manifest and iterate (simplified for this version)
    print_warning "For full skills library, clone the repo: git clone $CTOC_REPO"
}

# Interactive project setup
setup_project() {
    print_step "Setting up your project..."
    echo
    
    # Get project name
    DEFAULT_NAME=$(basename "$PWD")
    read -p "Project name [$DEFAULT_NAME]: " PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-$DEFAULT_NAME}
    
    # Get primary language
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
    
    # Get framework (optional)
    echo
    read -p "Primary framework (optional, e.g., FastAPI, React, Django): " FRAMEWORK
    
    # Get project description
    echo
    read -p "One-line project description: " DESCRIPTION
    
    # Generate CLAUDE.md
    generate_claude_md
    
    # Generate IRON_LOOP.md
    generate_iron_loop_md
    
    # Generate PLANNING.md
    generate_planning_md
}

generate_claude_md() {
    print_step "Generating CLAUDE.md..."
    
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

Reference skills from \`.ctoc/skills/\` for language and framework-specific guidance:
- \`.ctoc/skills/languages/${LANGUAGE,,}.md\` - $LANGUAGE CTO standards
${FRAMEWORK:+- \`.ctoc/skills/frameworks/*/${FRAMEWORK,,}.md\` - $FRAMEWORK CTO standards}

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
    echo "Version $CTOC_VERSION"
    echo
    
    check_directory
    download_skills
    setup_project
    setup_gitignore
    
    echo
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  CTOC installed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo
    echo "  Files created:"
    echo "    • CLAUDE.md     - CTO instructions for Claude"
    echo "    • IRON_LOOP.md  - Progress tracking"
    echo "    • PLANNING.md   - Feature backlog"
    echo "    • .ctoc/        - Skills library (103 CTO personas)"
    echo
    echo "  Next steps:"
    echo "    1. Review and customize CLAUDE.md"
    echo "    2. Run 'claude' in this directory"
    echo "    3. Claude is now your CTO!"
    echo
    echo "  Commands:"
    echo "    • 'ctoc plan'      - Planning mode"
    echo "    • 'ctoc implement' - Implementation mode"
    echo "    • 'ctoc review'    - Code review mode"
    echo
}

main "$@"
