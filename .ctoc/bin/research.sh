#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Research Configuration
#  Toggle and configure WebSearch for Iron Loop steps
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS_FILE=".ctoc/settings.yaml"

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << EOF
CTOC Research Configuration

Manage WebSearch integration for Iron Loop steps.
WebSearch is ENABLED by default and runs automatically at high-value steps.

USAGE:
    ctoc research <command> [options]

COMMANDS:
    status              Show current research configuration
    on                  Enable WebSearch (default)
    off                 Disable WebSearch
    steps <list>        Set auto-research steps (comma-separated)

AUTO-RESEARCH STEPS (default: 1,2,5,12):
    1  ASSESS   - Problem domain, existing solutions
    2  ALIGN    - Business patterns, UX research
    5  DESIGN   - Architecture patterns, scalability
    12 SECURE   - CVE lookup, security advisories

OPTIONAL STEPS (available on request: 4,6,11,13):
    4  PLAN     - Find similar implementations
    6  SPEC     - Validate API design standards
    11 OPTIMIZE - Performance benchmarks
    13 DOCUMENT - Documentation standards

EXAMPLES:
    ctoc research status          # Show current config (default: ON)
    ctoc research off             # Disable WebSearch
    ctoc research on              # Re-enable WebSearch
    ctoc research steps 1,2,5,12  # Customize auto-research steps

DISABLE FOR:
    - Offline environments
    - Confidential projects
    - Speed optimization

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Utility Functions
# ═══════════════════════════════════════════════════════════════════════════════

ensure_settings() {
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        echo "Error: Settings file not found at $SETTINGS_FILE"
        echo "Run 'ctoc init' first to initialize your project."
        exit 1
    fi
}

get_research_enabled() {
    if command -v yq &>/dev/null; then
        yq -r '.research.websearch.enabled // true' "$SETTINGS_FILE" 2>/dev/null || echo "true"
    else
        # Fallback: grep for the setting
        if grep -q "enabled: false" "$SETTINGS_FILE" 2>/dev/null; then
            echo "false"
        else
            echo "true"
        fi
    fi
}

get_auto_steps() {
    if command -v yq &>/dev/null; then
        yq -r '.research.websearch.auto_steps // [1,2,5,12] | @csv' "$SETTINGS_FILE" 2>/dev/null | tr -d '"' || echo "1,2,5,12"
    else
        # Fallback: grep for the setting
        local steps
        steps=$(grep -A1 "auto_steps:" "$SETTINGS_FILE" 2>/dev/null | tail -1 | tr -d '[]' | tr -d ' ')
        echo "${steps:-1,2,5,12}"
    fi
}

set_research_enabled() {
    local enabled="$1"

    if command -v yq &>/dev/null; then
        yq -i ".research.websearch.enabled = $enabled" "$SETTINGS_FILE"
    else
        # Fallback: sed replacement
        if grep -q "enabled:" "$SETTINGS_FILE" 2>/dev/null; then
            sed -i "s/enabled: .*/enabled: $enabled/" "$SETTINGS_FILE"
        else
            echo "Warning: Could not update settings. Install 'yq' for full functionality."
        fi
    fi
}

set_auto_steps() {
    local steps="$1"
    local steps_array="[$steps]"

    if command -v yq &>/dev/null; then
        yq -i ".research.websearch.auto_steps = $steps_array" "$SETTINGS_FILE"
    else
        # Fallback: sed replacement
        if grep -q "auto_steps:" "$SETTINGS_FILE" 2>/dev/null; then
            sed -i "s/auto_steps: .*/auto_steps: $steps_array/" "$SETTINGS_FILE"
        else
            echo "Warning: Could not update settings. Install 'yq' for full functionality."
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Commands
# ═══════════════════════════════════════════════════════════════════════════════

research_status() {
    ensure_settings

    local enabled
    enabled=$(get_research_enabled)

    local steps
    steps=$(get_auto_steps)

    echo "CTOC Research Configuration"
    echo "═══════════════════════════════════════"
    echo ""

    if [[ "$enabled" == "true" ]]; then
        echo "  Status:     ENABLED (default)"
        echo "  Auto-steps: $steps"
        echo ""
        echo "WebSearch runs automatically at these Iron Loop steps:"
        echo ""

        # Parse steps and show descriptions
        IFS=',' read -ra step_array <<< "$steps"
        for step in "${step_array[@]}"; do
            case "$step" in
                1) echo "  ✓ Step 1 (ASSESS)   - Problem domain research" ;;
                2) echo "  ✓ Step 2 (ALIGN)    - Business patterns, UX" ;;
                4) echo "  ✓ Step 4 (PLAN)     - Similar implementations" ;;
                5) echo "  ✓ Step 5 (DESIGN)   - Architecture patterns" ;;
                6) echo "  ✓ Step 6 (SPEC)     - API design standards" ;;
                11) echo "  ✓ Step 11 (OPTIMIZE) - Performance benchmarks" ;;
                12) echo "  ✓ Step 12 (SECURE)   - CVE lookup, advisories" ;;
                13) echo "  ✓ Step 13 (DOCUMENT) - Documentation standards" ;;
            esac
        done
    else
        echo "  Status:     DISABLED"
        echo ""
        echo "WebSearch is disabled. Run 'ctoc research on' to enable."
    fi

    echo ""
    echo "Commands:"
    echo "  ctoc research on              Enable WebSearch"
    echo "  ctoc research off             Disable WebSearch"
    echo "  ctoc research steps 1,2,5,12  Set auto-research steps"
}

research_on() {
    ensure_settings
    set_research_enabled "true"
    echo "WebSearch enabled."
    echo "Auto-research will run at configured Iron Loop steps."
}

research_off() {
    ensure_settings
    set_research_enabled "false"
    echo "WebSearch disabled."
    echo "No automatic research will be performed."
}

research_steps() {
    local steps="$1"

    if [[ -z "$steps" ]]; then
        echo "Usage: ctoc research steps <comma-separated-steps>"
        echo "Example: ctoc research steps 1,2,5,12"
        exit 1
    fi

    # Validate steps
    IFS=',' read -ra step_array <<< "$steps"
    for step in "${step_array[@]}"; do
        if ! [[ "$step" =~ ^[0-9]+$ ]] || [[ "$step" -lt 1 ]] || [[ "$step" -gt 15 ]]; then
            echo "Error: Invalid step '$step'. Steps must be 1-15."
            exit 1
        fi
    done

    ensure_settings
    set_auto_steps "$steps"
    echo "Auto-research steps set to: $steps"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-status}"
    shift || true

    case "$cmd" in
        status)
            research_status
            ;;
        on|enable)
            research_on
            ;;
        off|disable)
            research_off
            ;;
        steps)
            research_steps "${1:-}"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc research help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
