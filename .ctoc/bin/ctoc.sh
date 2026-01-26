#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief CLI
#  Main entry point for skill management commands
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.0.0"

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

DETECTION COMMANDS:
    detect                   Detect technologies in current project
    detect languages         Detect only languages
    detect frameworks        Detect only frameworks

OTHER COMMANDS:
    help                     Show this help
    version                  Show version

EXAMPLES:
    ctoc skills list                    # See all available skills
    ctoc skills add langchain           # Add LangChain guidance
    ctoc skills sync                    # Auto-detect and download skills
    ctoc detect                         # See what technologies are detected

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Skills Commands
# ═══════════════════════════════════════════════════════════════════════════════

skills_list() {
    local index
    if [[ -f ".ctoc/skills.json" ]]; then
        index=".ctoc/skills.json"
    elif [[ -f "$SCRIPT_DIR/../skills.json" ]]; then
        index="$SCRIPT_DIR/../skills.json"
    else
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
    if [[ ! -d ".ctoc/skills" ]]; then
        echo "No skills downloaded for this project."
        return
    fi

    echo "Active Skills:"
    echo ""

    # Languages
    if ls .ctoc/skills/languages/*.md &>/dev/null; then
        echo "Languages:"
        ls -1 .ctoc/skills/languages/*.md 2>/dev/null | xargs -I{} basename {} .md | sed 's/^/  - /'
    fi

    # Frameworks by category
    for category_dir in .ctoc/skills/frameworks/*/; do
        [[ -d "$category_dir" ]] || continue
        local category
        category=$(basename "$category_dir")
        if ls "$category_dir"*.md &>/dev/null; then
            echo ""
            echo "Frameworks ($category):"
            ls -1 "$category_dir"*.md 2>/dev/null | xargs -I{} basename {} .md | sed 's/^/  - /'
        fi
    done
}

skills_add() {
    local name="$1"
    "$SCRIPT_DIR/download.sh" with-deps "$name"
}

skills_search() {
    local query="$1"
    local index

    if [[ -f ".ctoc/skills.json" ]]; then
        index=".ctoc/skills.json"
    elif [[ -f "$SCRIPT_DIR/../skills.json" ]]; then
        index="$SCRIPT_DIR/../skills.json"
    else
        echo "Error: skills.json not found" >&2
        exit 1
    fi

    echo "Searching for: $query"
    echo ""

    # Search in languages
    echo "Languages:"
    jq -r --arg q "$query" '
        .skills.languages | to_entries[] |
        select(.key | contains($q)) |
        "  - " + .key
    ' "$index" || true

    # Search in framework names and keywords
    echo ""
    echo "Frameworks:"
    jq -r --arg q "$query" '
        .skills.frameworks | to_entries[] | .value | to_entries[] |
        select(.key | contains($q) or (.value.keywords[]? | contains($q))) |
        "  - " + .key
    ' "$index" | sort -u || true
}

skills_info() {
    local name="$1"
    local index

    if [[ -f ".ctoc/skills.json" ]]; then
        index=".ctoc/skills.json"
    elif [[ -f "$SCRIPT_DIR/../skills.json" ]]; then
        index="$SCRIPT_DIR/../skills.json"
    else
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
    "$SCRIPT_DIR/download.sh" sync
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
                *)
                    echo "Unknown skills command: $subcmd"
                    echo "Available: list, active, add, search, sync, info"
                    exit 1
                    ;;
            esac
            ;;

        detect)
            local mode="${1:-all}"
            "$SCRIPT_DIR/detect.sh" "$mode"
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

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install it with: sudo apt install jq (Ubuntu/Debian) or brew install jq (macOS)"
    exit 1
fi

main "$@"
