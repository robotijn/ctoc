#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Project Technology Detection
#  Detects languages and frameworks used in the current project
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTOC_DIR="$(dirname "$SCRIPT_DIR")"

# Skills index location (try local first, then global)
if [[ -f ".ctoc/skills.json" ]]; then
    SKILLS_INDEX=".ctoc/skills.json"
elif [[ -f "$CTOC_DIR/skills.json" ]]; then
    SKILLS_INDEX="$CTOC_DIR/skills.json"
else
    echo "Error: skills.json not found" >&2
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  Detect Languages
# ═══════════════════════════════════════════════════════════════════════════════

detect_languages() {
    local detected=()

    # Read all languages and their triggers from skills.json
    while IFS= read -r lang; do
        local triggers
        triggers=$(jq -r --arg l "$lang" '.skills.languages[$l].triggers[]' "$SKILLS_INDEX")

        for trigger in $triggers; do
            # Skip empty triggers
            [[ -z "$trigger" ]] && continue

            if [[ "$trigger" == *"*"* ]]; then
                # Glob pattern (e.g., "*.py")
                # Use find to check if any matching files exist (limited depth for speed)
                if find . -maxdepth 3 -name "${trigger#\*}" -type f 2>/dev/null | head -1 | grep -q .; then
                    detected+=("$lang")
                    break
                fi
            else
                # Exact file match (e.g., "pyproject.toml")
                if [[ -f "$trigger" ]]; then
                    detected+=("$lang")
                    break
                fi
            fi
        done
    done < <(jq -r '.skills.languages | keys[]' "$SKILLS_INDEX")

    # Output unique detected languages
    printf '%s\n' "${detected[@]}" | sort -u
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Detect Frameworks
# ═══════════════════════════════════════════════════════════════════════════════

detect_frameworks() {
    local detected=()

    # Common config files to search for keywords
    local config_files=""
    for f in pyproject.toml requirements.txt setup.py package.json package-lock.json \
             Cargo.toml go.mod go.sum pom.xml build.gradle build.gradle.kts \
             Gemfile composer.json pubspec.yaml mix.exs deps.edn project.clj \
             Pipfile poetry.lock; do
        [[ -f "$f" ]] && config_files="$config_files $f"
    done

    # If no config files, skip framework detection
    [[ -z "$config_files" ]] && return

    # Combine all config file contents for keyword searching
    local config_content
    config_content=$(cat $config_files 2>/dev/null || true)

    # Read all frameworks and their keywords from skills.json
    for category in $(jq -r '.skills.frameworks | keys[]' "$SKILLS_INDEX"); do
        while IFS= read -r framework; do
            local keywords
            keywords=$(jq -r --arg c "$category" --arg f "$framework" \
                '.skills.frameworks[$c][$f].keywords[]' "$SKILLS_INDEX" 2>/dev/null || true)

            for keyword in $keywords; do
                [[ -z "$keyword" ]] && continue

                # Check if keyword exists in config files
                if echo "$config_content" | grep -q "$keyword"; then
                    detected+=("$framework")
                    break
                fi
            done
        done < <(jq -r --arg c "$category" '.skills.frameworks[$c] | keys[]' "$SKILLS_INDEX")
    done

    # Output unique detected frameworks
    printf '%s\n' "${detected[@]}" | sort -u
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local mode="${1:-all}"
    local output_format="${2:-text}"

    case "$mode" in
        languages)
            detect_languages
            ;;
        frameworks)
            detect_frameworks
            ;;
        all|*)
            local languages
            local frameworks

            languages=$(detect_languages)
            frameworks=$(detect_frameworks)

            if [[ "$output_format" == "json" ]]; then
                # Output as JSON
                jq -n \
                    --argjson langs "$(echo "$languages" | jq -R . | jq -s .)" \
                    --argjson frames "$(echo "$frameworks" | jq -R . | jq -s .)" \
                    '{languages: $langs, frameworks: $frames}'
            else
                # Output as text
                if [[ -n "$languages" ]]; then
                    echo "Languages:"
                    echo "$languages" | sed 's/^/  - /'
                fi
                if [[ -n "$frameworks" ]]; then
                    echo "Frameworks:"
                    echo "$frameworks" | sed 's/^/  - /'
                fi
                if [[ -z "$languages" && -z "$frameworks" ]]; then
                    echo "No technologies detected."
                fi
            fi
            ;;
    esac
}

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

main "$@"
