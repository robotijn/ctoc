#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Codebase Explorer
#  Generates PROJECT_MAP.md during ctoc init
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ═══════════════════════════════════════════════════════════════════════════════
#  Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# Directories to ignore
IGNORE_DIRS="node_modules|__pycache__|\.git|\.next|dist|build|\.venv|venv|\.idea|\.vscode|coverage|\.pytest_cache|\.mypy_cache"

# File extensions to analyze
CODE_EXTENSIONS="py|ts|tsx|js|jsx|go|rs|java|rb|php|swift|kt|cs|cpp|c|h"

# Output file
OUTPUT_FILE=".ctoc/PROJECT_MAP.md"

# ═══════════════════════════════════════════════════════════════════════════════
#  Functions
# ═══════════════════════════════════════════════════════════════════════════════

generate_tree() {
    local depth="${1:-3}"

    echo "## Directory Structure"
    echo ""
    echo '```'

    if command -v tree &>/dev/null; then
        tree -L "$depth" -I "$IGNORE_DIRS" --dirsfirst 2>/dev/null || \
            find . -maxdepth "$depth" -type d | grep -vE "$IGNORE_DIRS" | sort
    else
        # Fallback if tree not installed
        find . -maxdepth "$depth" -type d | grep -vE "$IGNORE_DIRS" | sort | \
            sed 's|[^/]*/|  |g; s|  ||'
    fi

    echo '```'
    echo ""
}

analyze_key_files() {
    echo "## Key Files"
    echo ""
    echo "| File | Purpose | Key Elements |"
    echo "|------|---------|--------------|"

    # Find common important files
    local key_files=(
        "src/main.*"
        "src/app.*"
        "src/index.*"
        "main.*"
        "app.*"
        "index.*"
        "server.*"
        "api/routes.*"
        "api/index.*"
        "routes.*"
        "models/*"
        "services/*"
        "utils/*"
        "lib/*"
        "config.*"
        "settings.*"
    )

    for pattern in "${key_files[@]}"; do
        for file in $(find . -path "./$pattern" -type f 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -10); do
            local filename=$(basename "$file")
            local dirname=$(dirname "$file")
            local purpose=""
            local elements=""

            # Detect purpose based on filename/path
            case "$file" in
                *routes*|*router*) purpose="API routing" ;;
                *model*) purpose="Data models" ;;
                *service*) purpose="Business logic" ;;
                *util*|*helper*) purpose="Utilities" ;;
                *config*|*settings*) purpose="Configuration" ;;
                *main*|*app*|*index*) purpose="Entry point" ;;
                *auth*) purpose="Authentication" ;;
                *test*|*spec*) purpose="Tests" ;;
                *) purpose="Core logic" ;;
            esac

            # Extract key functions/classes (first 5)
            elements=$(grep -E "^(def |class |function |const |export |async function )" "$file" 2>/dev/null | \
                head -5 | \
                sed 's/def \([a-zA-Z_]*\).*/\1()/; s/class \([a-zA-Z_]*\).*/\1/; s/function \([a-zA-Z_]*\).*/\1()/; s/const \([a-zA-Z_]*\).*/\1/; s/export .* \([a-zA-Z_]*\).*/\1/' | \
                tr '\n' ', ' | sed 's/, $//')

            echo "| \`$file\` | $purpose | $elements |"
        done
    done

    echo ""
}

detect_patterns() {
    echo "## Patterns Used"
    echo ""

    local patterns_found=false

    # Detect authentication patterns
    if grep -rE "(jwt|JWT|Bearer|OAuth|session|passport)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
        if grep -rE "jwt|JWT" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
            echo "- **Authentication:** JWT tokens"
            patterns_found=true
        elif grep -rE "session" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
            echo "- **Authentication:** Session-based"
            patterns_found=true
        fi
    fi

    # Detect database/ORM
    if grep -rE "(SQLAlchemy|Prisma|TypeORM|Sequelize|mongoose|Hibernate|ActiveRecord|Diesel)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
        local orm=$(grep -rE "(SQLAlchemy|Prisma|TypeORM|Sequelize|mongoose|Hibernate|ActiveRecord|Diesel)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 | grep -oE "(SQLAlchemy|Prisma|TypeORM|Sequelize|mongoose|Hibernate|ActiveRecord|Diesel)" | head -1)
        echo "- **Database:** $orm ORM"
        patterns_found=true
    fi

    # Detect API framework
    if grep -rE "(FastAPI|Express|Flask|Django|Rails|Spring|Gin|Actix|Axum)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
        local framework=$(grep -rE "(FastAPI|Express|Flask|Django|Rails|Spring|Gin|Actix|Axum)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 | grep -oE "(FastAPI|Express|Flask|Django|Rails|Spring|Gin|Actix|Axum)" | head -1)
        echo "- **API:** $framework"
        patterns_found=true
    fi

    # Detect frontend framework
    if grep -rE "(React|Vue|Angular|Svelte|Next|Nuxt)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
        local fe_framework=$(grep -rE "(React|Vue|Angular|Svelte|Next|Nuxt)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 | grep -oE "(React|Vue|Angular|Svelte|Next|Nuxt)" | head -1)
        echo "- **Frontend:** $fe_framework"
        patterns_found=true
    fi

    # Detect testing framework
    if grep -rE "(pytest|jest|mocha|vitest|rspec|junit)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 &>/dev/null; then
        local test_framework=$(grep -rE "(pytest|jest|mocha|vitest|rspec|junit)" . --include="*.{$CODE_EXTENSIONS}" 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -1 | grep -oE "(pytest|jest|mocha|vitest|rspec|junit)" | head -1)
        echo "- **Testing:** $test_framework"
        patterns_found=true
    fi

    if [[ "$patterns_found" == "false" ]]; then
        echo "- No common patterns detected"
    fi

    echo ""
}

generate_search_reference() {
    echo "## Quick Search Reference"
    echo ""
    echo "| Looking for... | Check these files |"
    echo "|----------------|-------------------|"

    # Find by common categories
    local categories=(
        "User data:models/user|user.py|user.ts|User.java"
        "API endpoints:routes|api|controllers"
        "Auth logic:auth|login|session"
        "Config:config|settings|.env"
        "Database:models|schema|migrations"
        "Tests:test|spec|__tests__"
        "Utils:utils|helpers|lib"
    )

    for category in "${categories[@]}"; do
        local name="${category%%:*}"
        local patterns="${category#*:}"

        local files=""
        IFS='|' read -ra pattern_array <<< "$patterns"
        for pattern in "${pattern_array[@]}"; do
            local found=$(find . -type f \( -name "*$pattern*" -o -path "*$pattern*" \) 2>/dev/null | grep -vE "$IGNORE_DIRS" | head -2 | tr '\n' ', ' | sed 's/, $//')
            if [[ -n "$found" ]]; then
                files="$files$found, "
            fi
        done

        files=$(echo "$files" | sed 's/, $//')

        if [[ -n "$files" ]]; then
            echo "| $name | \`$files\` |"
        fi
    done

    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-generate}"

    case "$cmd" in
        generate)
            echo "Exploring codebase..."

            # Create .ctoc directory if it doesn't exist
            mkdir -p .ctoc

            {
                echo "# Project Map"
                echo ""
                echo "> Auto-generated during ctoc init. Quick reference for implementation."
                echo ""

                generate_tree
                analyze_key_files
                detect_patterns
                generate_search_reference

                echo "---"
                echo ""
                echo "*Generated by CTOC Codebase Explorer*"
            } > "$OUTPUT_FILE"

            echo "Generated: $OUTPUT_FILE"
            ;;

        help|--help|-h)
            echo "CTOC Codebase Explorer"
            echo ""
            echo "Usage: explore-codebase.sh [command]"
            echo ""
            echo "Commands:"
            echo "  generate    Generate PROJECT_MAP.md (default)"
            echo "  help        Show this help"
            ;;

        *)
            echo "Unknown command: $cmd"
            echo "Run 'explore-codebase.sh help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
