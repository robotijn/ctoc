#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Smart CLAUDE.md Integration
#  Merges CTOC sections with existing CLAUDE.md content
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

# CTOC markers
CTOC_START="<!-- CTOC:START - Do not edit below this line -->"
CTOC_END="<!-- CTOC:END -->"

# ═══════════════════════════════════════════════════════════════════════════════
#  GitHub CLI Setup
# ═══════════════════════════════════════════════════════════════════════════════

setup_github_cli() {
    echo -e "${BLUE}Checking GitHub CLI...${NC}"

    # Check if gh is installed
    if ! command -v gh &>/dev/null; then
        echo ""
        echo -e "${YELLOW}GitHub CLI (gh) not found.${NC}"
        echo ""
        echo "CTOC can automatically create improvement issues and PRs."
        echo "This requires GitHub CLI."
        echo ""
        read -p "Install GitHub CLI? (Y/n): " -n 1 -r
        echo

        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            install_github_cli
        else
            echo -e "${YELLOW}Skipped. You can install later: https://cli.github.com/${NC}"
            echo "Without GitHub CLI, you'll need to post issues manually."
            return 1
        fi
    fi

    # Check authentication
    if command -v gh &>/dev/null; then
        if ! gh auth status &>/dev/null 2>&1; then
            echo ""
            echo -e "${YELLOW}GitHub CLI installed but not authenticated.${NC}"
            echo "Authenticate to enable automatic issue/PR creation."
            echo ""
            read -p "Authenticate now? (Y/n): " -n 1 -r
            echo

            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                gh auth login
            else
                echo ""
                echo -e "${YELLOW}Skipped. Authenticate later with: gh auth login${NC}"
                echo "Without authentication, you'll need to post issues manually."
                return 1
            fi
        else
            echo -e "${GREEN}GitHub CLI authenticated.${NC}"
            return 0
        fi
    fi

    return 1
}

install_github_cli() {
    echo "Installing GitHub CLI..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &>/dev/null; then
            brew install gh
        else
            echo "Please install Homebrew first: https://brew.sh/"
            echo "Then run: brew install gh"
            return 1
        fi
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        (type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt update \
        && sudo apt install gh -y
    elif [[ -f /etc/fedora-release ]]; then
        # Fedora
        sudo dnf install 'dnf-command(config-manager)' -y
        sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
        sudo dnf install gh -y
    elif [[ -f /etc/arch-release ]]; then
        # Arch
        sudo pacman -S github-cli
    else
        echo "Please install GitHub CLI manually: https://cli.github.com/"
        return 1
    fi

    echo -e "${GREEN}GitHub CLI installed successfully.${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CLAUDE.md Analysis
# ═══════════════════════════════════════════════════════════════════════════════

analyze_existing_claude_md() {
    local file="$1"
    local output_file="$2"

    if [[ ! -f "$file" ]]; then
        echo "{}" > "$output_file"
        return
    fi

    # Extract key information from existing CLAUDE.md
    local content
    content=$(cat "$file")

    # Detect sections
    local has_commands=false
    local has_testing=false
    local has_style=false
    local has_structure=false

    grep -qi "## commands\|## scripts\|npm run\|pytest\|cargo\|go test" "$file" && has_commands=true
    grep -qi "## test\|testing\|jest\|pytest\|vitest" "$file" && has_testing=true
    grep -qi "## style\|## code style\|eslint\|prettier\|ruff" "$file" && has_style=true
    grep -qi "## structure\|## project\|├──\|└──" "$file" && has_structure=true

    # Extract explicit rules (MUST, NEVER, ALWAYS)
    local rules
    rules=$(grep -iE "(MUST|NEVER|ALWAYS|DO NOT|REQUIRED)" "$file" 2>/dev/null | head -20 || true)

    # Check for CTOC markers
    local has_ctoc_markers=false
    grep -q "$CTOC_START" "$file" && has_ctoc_markers=true

    # Output analysis
    cat > "$output_file" << EOF
{
  "file_exists": true,
  "has_ctoc_markers": $has_ctoc_markers,
  "sections": {
    "commands": $has_commands,
    "testing": $has_testing,
    "style": $has_style,
    "structure": $has_structure
  },
  "line_count": $(wc -l < "$file"),
  "has_explicit_rules": $([ -n "$rules" ] && echo "true" || echo "false")
}
EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Project Convention Detection
# ═══════════════════════════════════════════════════════════════════════════════

detect_project_conventions() {
    local output_file="$1"

    local conventions=""

    # Detect from package.json
    if [[ -f "package.json" ]]; then
        local scripts
        scripts=$(jq -r '.scripts // {} | keys[]' package.json 2>/dev/null || true)
        if [[ -n "$scripts" ]]; then
            conventions+="npm_scripts: [$scripts]\n"
        fi

        # Detect test framework
        if jq -e '.devDependencies.jest // .dependencies.jest' package.json &>/dev/null; then
            conventions+="test_framework: jest\n"
        elif jq -e '.devDependencies.vitest // .dependencies.vitest' package.json &>/dev/null; then
            conventions+="test_framework: vitest\n"
        fi

        # Detect linting
        if jq -e '.devDependencies.eslint // .dependencies.eslint' package.json &>/dev/null; then
            conventions+="linter: eslint\n"
        fi
    fi

    # Detect from pyproject.toml
    if [[ -f "pyproject.toml" ]]; then
        # Test framework
        if grep -q "pytest" pyproject.toml; then
            conventions+="test_framework: pytest\n"
        fi

        # Linting
        if grep -q "ruff" pyproject.toml; then
            conventions+="linter: ruff\n"
        elif grep -q "flake8" pyproject.toml; then
            conventions+="linter: flake8\n"
        fi

        # Formatting
        if grep -q "black" pyproject.toml; then
            conventions+="formatter: black\n"
        fi
    fi

    # Detect from Cargo.toml
    if [[ -f "Cargo.toml" ]]; then
        conventions+="build_system: cargo\n"
        conventions+="test_command: cargo test\n"
    fi

    # Detect from go.mod
    if [[ -f "go.mod" ]]; then
        conventions+="build_system: go\n"
        conventions+="test_command: go test ./...\n"
    fi

    # Write to file
    echo -e "$conventions" > "$output_file"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Smart Merge
# ═══════════════════════════════════════════════════════════════════════════════

smart_merge_claude_md() {
    local existing_file="$1"
    local ctoc_content="$2"
    local output_file="$3"

    if [[ ! -f "$existing_file" ]]; then
        # No existing file, just use CTOC content
        echo "$ctoc_content" > "$output_file"
        return
    fi

    local existing_content
    existing_content=$(cat "$existing_file")

    # Check if already has CTOC markers
    if grep -q "$CTOC_START" "$existing_file"; then
        # Replace content between markers
        local before_marker
        local after_marker

        before_marker=$(sed -n "1,/$CTOC_START/p" "$existing_file" | head -n -1)
        after_marker=$(sed -n "/$CTOC_END/,\$p" "$existing_file" | tail -n +2)

        cat > "$output_file" << EOF
$before_marker
$CTOC_START
$ctoc_content
$CTOC_END
$after_marker
EOF
    else
        # No markers, add CTOC content at the end with markers
        cat > "$output_file" << EOF
$existing_content

$CTOC_START
$ctoc_content
$CTOC_END
EOF
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Generate CTOC Section
# ═══════════════════════════════════════════════════════════════════════════════

generate_ctoc_section() {
    local project_name="$1"
    local language="$2"
    local framework="${3:-}"

    local framework_section=""
    if [[ -n "$framework" ]]; then
        local fw_lower
        fw_lower=$(echo "$framework" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
        framework_section="
### Framework: $framework
See \`.ctoc/skills/frameworks/*/$fw_lower.md\` for framework-specific guidance."
    fi

    local lang_lower
    lang_lower=$(echo "$language" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

    cat << EOF
## CTO Persona

You are a **Senior CTO** with 20+ years of experience in $language${framework:+ and $framework}.
You have built and scaled systems at companies like Google, Stripe, and Airbnb.
Your role is to ensure this project meets the highest standards of engineering excellence.

## Technical Stack

- **Primary Language:** $language
${framework:+- **Framework:** $framework}

## Skills Library

Reference skills from \`.ctoc/skills/\` for language and framework-specific guidance.

**Active Skills:**
- \`.ctoc/skills/languages/$lang_lower.md\` - $language CTO standards
$framework_section

**Skill Management:**
\`\`\`bash
.ctoc/bin/ctoc.sh skills list       # See all 261 available skills
.ctoc/bin/ctoc.sh skills add NAME   # Add a specific skill
.ctoc/bin/ctoc.sh skills sync       # Auto-detect & download skills
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

## Iron Loop - 15-Step Methodology

| Step | Phase | Description |
|------|-------|-------------|
| 1. ASSESS | Planning | Understand the problem |
| 2. ALIGN | Planning | Business alignment |
| 3. CAPTURE | Planning | Gather requirements |
| 4. PLAN | Planning | Design solution |
| 5. DESIGN | Planning | Architecture decisions |
| 6. SPEC | Planning | Technical specification |
| 7. TEST | Development | Write tests first |
| 8. QUALITY | Development | Quality gates |
| 9. IMPLEMENT | Development | Write code |
| 10. REVIEW | Development | Self-review as CTO |
| 11. OPTIMIZE | Delivery | Performance tuning |
| 12. SECURE | Delivery | Security validation |
| 13. DOCUMENT | Delivery | Update docs |
| 14. VERIFY | Delivery | Final validation |
| 15. COMMIT | Delivery | Ship with confidence |

See \`IRON_LOOP.md\` for current project status.
See \`PLANNING.md\` for feature backlog.

## Parallel Execution Guidelines

### Subagent Parallelism Formula
Use: \`max(2, CPU_CORES - 4)\` concurrent subagents

### Safe Parallelization Matrix

| Operation Type | Parallel Safe? | Notes |
|----------------|----------------|-------|
| WebSearch | Yes | No state modification |
| Read/Glob/Grep | Yes | Read-only |
| WebFetch | Yes | External fetch |
| Analysis | Yes | Results can merge |
| Edit/Write | NO | Serialize by file |
| Bash (read) | Yes | ls, cat, etc. |
| Bash (write) | NO | Serialize |
| Git operations | NO | Use worktrees for parallelism |

### Research Phase Pattern
When exploring a problem, use parallel research:

\`\`\`
Launch in parallel (up to max agents):
├── Agent 1: WebSearch "official docs {topic}"
├── Agent 2: WebSearch "GitHub implementations {topic}"
├── Agent 3: WebSearch "security considerations {topic}"
├── Agent 4: Grep codebase for existing patterns
└── Agent 5: Read related files

Wait for all results, then synthesize.
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| \`ctoc skills sync\` | Download skills for detected technologies |
| \`ctoc skills feedback <name>\` | Suggest skill improvement |
| \`ctoc plan new\` | Create a new plan |
| \`ctoc sync\` | Pull-rebase-push workflow |
| \`ctoc dashboard\` | View progress |
| \`ctoc process-issues\` | Process community suggestions |

## Quality Gates

Before committing:
1. All tests pass
2. No linting errors
3. Iron Loop step 14 (VERIFY) complete
4. Documentation updated

## Skill Auto-Sync

When you notice the project using a new technology (new dependencies, new file types),
automatically run skill sync to download relevant guidance:

\`\`\`bash
.ctoc/bin/ctoc.sh skills sync
\`\`\`
EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main Integration Flow
# ═══════════════════════════════════════════════════════════════════════════════

integrate_claude_md() {
    local project_name="$1"
    local language="$2"
    local framework="${3:-}"

    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  CTOC - Smart CLAUDE.md Integration${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Analyze existing CLAUDE.md
    local analysis_file="/tmp/ctoc-claude-analysis.json"
    analyze_existing_claude_md "CLAUDE.md" "$analysis_file"

    if [[ -f "CLAUDE.md" ]]; then
        local line_count
        line_count=$(jq -r '.line_count' "$analysis_file")
        local has_markers
        has_markers=$(jq -r '.has_ctoc_markers' "$analysis_file")

        echo -e "${YELLOW}Existing CLAUDE.md found (${line_count} lines)${NC}"
        echo ""

        if [[ "$has_markers" == "true" ]]; then
            echo "CTOC markers detected. Will update CTOC section only."
            echo ""
            read -p "Update CTOC section? (Y/n): " -n 1 -r
            echo
            [[ $REPLY =~ ^[Nn]$ ]] && return 1
        else
            echo "Choose integration method:"
            echo "  [1] Smart merge - Add CTOC sections, keep your content (Recommended)"
            echo "  [2] Replace - Start fresh with CTOC template"
            echo "  [3] Backup & replace - Save existing as CLAUDE.md.backup"
            echo "  [4] Cancel"
            echo ""
            read -p "Choice [1]: " choice
            choice=${choice:-1}

            case $choice in
                1)
                    echo "Smart merge selected."
                    ;;
                2)
                    echo "Replacing CLAUDE.md..."
                    rm -f "CLAUDE.md"
                    ;;
                3)
                    echo "Backing up to CLAUDE.md.backup..."
                    cp "CLAUDE.md" "CLAUDE.md.backup"
                    rm -f "CLAUDE.md"
                    ;;
                4)
                    echo "Cancelled."
                    return 1
                    ;;
                *)
                    echo "Invalid choice. Using smart merge."
                    ;;
            esac
        fi
    fi

    # Detect project conventions
    local conventions_file="/tmp/ctoc-conventions.yaml"
    detect_project_conventions "$conventions_file"

    # Store detected conventions
    mkdir -p .ctoc
    cp "$conventions_file" ".ctoc/detected_conventions.yaml"

    # Generate CTOC section
    local ctoc_section
    ctoc_section=$(generate_ctoc_section "$project_name" "$language" "$framework")

    # Merge or create
    if [[ -f "CLAUDE.md" ]]; then
        smart_merge_claude_md "CLAUDE.md" "$ctoc_section" "CLAUDE.md.new"
        mv "CLAUDE.md.new" "CLAUDE.md"
        echo -e "${GREEN}CLAUDE.md updated with CTOC integration.${NC}"
    else
        # Create new with markers
        cat > "CLAUDE.md" << EOF
# $project_name

<!-- Add your project-specific instructions here -->

$CTOC_START
$ctoc_section
$CTOC_END
EOF
        echo -e "${GREEN}CLAUDE.md created with CTOC integration.${NC}"
    fi

    # Setup GitHub CLI
    echo ""
    setup_github_cli || true

    echo ""
    echo -e "${GREEN}CLAUDE.md integration complete.${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Entry Point
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        integrate)
            local project_name="${1:-$(basename "$(pwd)")}"
            local language="${2:-}"
            local framework="${3:-}"
            integrate_claude_md "$project_name" "$language" "$framework"
            ;;
        analyze)
            local file="${1:-CLAUDE.md}"
            analyze_existing_claude_md "$file" "/dev/stdout"
            ;;
        detect-conventions)
            detect_project_conventions "/dev/stdout"
            ;;
        setup-gh)
            setup_github_cli
            ;;
        help|--help|-h)
            cat << EOF
CTOC - Smart CLAUDE.md Integration

USAGE:
    init-claude-md.sh <command> [options]

COMMANDS:
    integrate <name> <lang> [framework]   Integrate CTOC into CLAUDE.md
    analyze [file]                        Analyze existing CLAUDE.md
    detect-conventions                    Detect project conventions
    setup-gh                              Setup GitHub CLI
    help                                  Show this help

EXAMPLES:
    init-claude-md.sh integrate "My Project" python fastapi
    init-claude-md.sh analyze CLAUDE.md
    init-claude-md.sh setup-gh
EOF
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'init-claude-md.sh help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
