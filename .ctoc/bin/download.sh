#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Skill Downloader
#  Downloads individual skills from the CTOC repository
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTOC_RAW="https://raw.githubusercontent.com/theaiguys/ctoc/main"

# Skills index location (try local first, then global)
CTOC_DIR="$(dirname "$SCRIPT_DIR")"
if [[ -f ".ctoc/skills.json" ]]; then
    SKILLS_INDEX=".ctoc/skills.json"
elif [[ -f "$CTOC_DIR/skills.json" ]]; then
    SKILLS_INDEX="$CTOC_DIR/skills.json"
else
    echo "Error: skills.json not found" >&2
    exit 1
fi

# Local skills directory
SKILLS_DIR=".ctoc/skills"

# ═══════════════════════════════════════════════════════════════════════════════
#  Find skill path in index
# ═══════════════════════════════════════════════════════════════════════════════

get_skill_path() {
    local name="$1"

    # Try languages first
    local path
    path=$(jq -r --arg n "$name" '.skills.languages[$n].file // empty' "$SKILLS_INDEX")

    # If not found, try frameworks
    if [[ -z "$path" ]]; then
        path=$(jq -r --arg n "$name" '
            .skills.frameworks | to_entries[] | .value[$n].file // empty
        ' "$SKILLS_INDEX" | head -1)
    fi

    echo "$path"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download a single skill
# ═══════════════════════════════════════════════════════════════════════════════

download_skill() {
    local name="$1"
    local quiet="${2:-false}"

    # Find skill path in index
    local path
    path=$(get_skill_path "$name")

    if [[ -z "$path" ]]; then
        [[ "$quiet" != "true" ]] && echo "Unknown skill: $name" >&2
        return 1
    fi

    local local_path="$SKILLS_DIR/$path"

    # Check if already downloaded
    if [[ -f "$local_path" ]]; then
        [[ "$quiet" != "true" ]] && echo "Already have: $name"
        return 0
    fi

    # Create directory
    mkdir -p "$(dirname "$local_path")"

    # Download
    local url="$CTOC_RAW/.ctoc/skills/$path"
    if curl -sL --fail "$url" -o "$local_path" 2>/dev/null; then
        [[ "$quiet" != "true" ]] && echo "✓ Downloaded: $name"
        return 0
    else
        [[ "$quiet" != "true" ]] && echo "✗ Failed to download: $name" >&2
        rm -f "$local_path"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download multiple skills
# ═══════════════════════════════════════════════════════════════════════════════

download_skills() {
    local skills=("$@")
    local success=0
    local failed=0

    for skill in "${skills[@]}"; do
        if download_skill "$skill" "true"; then
            ((success++))
            echo "✓ $skill"
        else
            ((failed++))
            echo "✗ $skill (failed)"
        fi
    done

    echo ""
    echo "Downloaded: $success, Failed: $failed"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download skills and their dependencies
# ═══════════════════════════════════════════════════════════════════════════════

download_with_deps() {
    local name="$1"
    local downloaded=()

    # Get required languages for this skill
    local requires
    requires=$(jq -r --arg n "$name" '
        .skills.frameworks | to_entries[] | .value[$n].requires[]? // empty
    ' "$SKILLS_INDEX" 2>/dev/null || true)

    # Download required languages first
    for req in $requires; do
        if [[ ! -f "$SKILLS_DIR/languages/$req.md" ]]; then
            download_skill "$req" "true" && downloaded+=("$req")
        fi
    done

    # Download the main skill
    download_skill "$name" "true" && downloaded+=("$name")

    # Report what was downloaded
    if [[ ${#downloaded[@]} -gt 0 ]]; then
        echo "Downloaded: ${downloaded[*]}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Sync - Detect and download all needed skills
# ═══════════════════════════════════════════════════════════════════════════════

sync_skills() {
    echo "Scanning project..."

    # Run detection
    local detected
    detected=$("$SCRIPT_DIR/detect.sh" all json)

    local languages
    local frameworks
    languages=$(echo "$detected" | jq -r '.languages[]' 2>/dev/null || true)
    frameworks=$(echo "$detected" | jq -r '.frameworks[]' 2>/dev/null || true)

    local to_download=()

    # Check languages
    for lang in $languages; do
        [[ -z "$lang" ]] && continue
        if [[ ! -f "$SKILLS_DIR/languages/$lang.md" ]]; then
            to_download+=("$lang")
        fi
    done

    # Check frameworks
    for framework in $frameworks; do
        [[ -z "$framework" ]] && continue
        local path
        path=$(get_skill_path "$framework")
        if [[ -n "$path" && ! -f "$SKILLS_DIR/$path" ]]; then
            to_download+=("$framework")

            # Also download required languages
            local requires
            requires=$(jq -r --arg n "$framework" '
                .skills.frameworks | to_entries[] | .value[$n].requires[]? // empty
            ' "$SKILLS_INDEX" 2>/dev/null || true)
            for req in $requires; do
                if [[ ! -f "$SKILLS_DIR/languages/$req.md" ]] && [[ ! " ${to_download[*]} " =~ " $req " ]]; then
                    to_download+=("$req")
                fi
            done
        fi
    done

    if [[ ${#to_download[@]} -eq 0 ]]; then
        echo "✓ All needed skills already downloaded"
        return 0
    fi

    echo "Downloading ${#to_download[@]} skill(s)..."
    for skill in "${to_download[@]}"; do
        download_skill "$skill"
    done

    echo "✓ Skills synchronized"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        skill|"")
            if [[ $# -eq 0 ]]; then
                echo "Usage: download.sh skill <name> [name...]"
                exit 1
            fi
            if [[ $# -eq 1 ]]; then
                download_skill "$1"
            else
                download_skills "$@"
            fi
            ;;
        with-deps)
            if [[ $# -eq 0 ]]; then
                echo "Usage: download.sh with-deps <name>"
                exit 1
            fi
            download_with_deps "$1"
            ;;
        sync)
            sync_skills
            ;;
        *)
            # Treat as skill name
            download_skill "$cmd"
            ;;
    esac
}

# Check for required tools
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "Error: curl is required but not installed." >&2
    exit 1
fi

main "$@"
