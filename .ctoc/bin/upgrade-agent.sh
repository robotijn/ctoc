#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Agent Upgrade Framework
#  Research-driven agent capability upgrades
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.0.0"

# ═══════════════════════════════════════════════════════════════════════════════
#  Colors
# ═══════════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════════

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
warn() { echo -e "${YELLOW}WARNING: $1${NC}" >&2; }
info() { echo -e "${BLUE}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }

# ═══════════════════════════════════════════════════════════════════════════════
#  Agent Version Tracking
# ═══════════════════════════════════════════════════════════════════════════════

get_versions_file() {
    local versions_file=".ctoc/agents/versions.yaml"
    if [[ -f "$versions_file" ]]; then
        echo "$versions_file"
    else
        # Create default versions file
        mkdir -p "$(dirname "$versions_file")"
        cat > "$versions_file" << 'EOF'
# CTOC Agent Version Tracking
# Tracks agent versions and capabilities

schema_version: "1.0"
last_updated: ""

agents:
  # Coordinator
  cto-coordinator:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - orchestration
      - conflict_resolution
      - skill_injection
    pending_upgrades: []

  # Testing Agents
  unit-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - unit_test_generation
      - mock_creation
    pending_upgrades: []

  integration-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - integration_test_generation
      - api_testing
    pending_upgrades: []

  e2e-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - e2e_test_generation
      - user_flow_testing
    pending_upgrades: []

  # Quality Agents
  code-reviewer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - style_validation
      - best_practice_check
    pending_upgrades: []

  architecture-checker:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - pattern_validation
      - dependency_analysis
    pending_upgrades: []

  # Security Agents
  security-scanner:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - owasp_scanning
      - vulnerability_detection
    pending_upgrades: []

  secrets-detector:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - secret_scanning
      - credential_detection
    pending_upgrades: []

  dependency-checker:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - cve_lookup
      - outdated_detection
    pending_upgrades: []

  # Performance Agents
  performance-profiler:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - cpu_profiling
      - memory_analysis
    pending_upgrades: []

  # Documentation Agents
  documentation-updater:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - api_docs
      - readme_updates
    pending_upgrades: []

# Upgrade History
upgrades: []
EOF
        echo "$versions_file"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Agents
# ═══════════════════════════════════════════════════════════════════════════════

list_agents() {
    info "CTOC Agents"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    local versions_file
    versions_file=$(get_versions_file)

    if command -v yq &>/dev/null; then
        echo "Agents:"
        yq '.agents | keys | .[]' "$versions_file" 2>/dev/null | while read -r agent; do
            local version
            version=$(yq ".agents.\"$agent\".version" "$versions_file" 2>/dev/null || echo "1.0.0")
            printf "  %-30s v%s\n" "$agent" "$version"
        done
    else
        echo "Agents (install yq for detailed view):"
        grep -E "^  [a-z]+-[a-z]+:" "$versions_file" 2>/dev/null | sed 's/://g' | awk '{print "  " $1}'
    fi

    echo ""
    echo "Total: 60 agents across 16 categories"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Agent Info
# ═══════════════════════════════════════════════════════════════════════════════

show_agent() {
    local agent="$1"

    if [[ -z "$agent" ]]; then
        error "Usage: ctoc agent info <agent-name>"
    fi

    local versions_file
    versions_file=$(get_versions_file)

    info "Agent: $agent"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    if command -v yq &>/dev/null; then
        local version capabilities pending
        version=$(yq ".agents.\"$agent\".version" "$versions_file" 2>/dev/null)

        if [[ "$version" == "null" ]] || [[ -z "$version" ]]; then
            warn "Agent not found: $agent"
            return 1
        fi

        echo "Version: $version"
        echo ""
        echo "Capabilities:"
        yq ".agents.\"$agent\".capabilities[]" "$versions_file" 2>/dev/null | while read -r cap; do
            echo "  - $cap"
        done
        echo ""
        echo "Pending Upgrades:"
        local pending_count
        pending_count=$(yq ".agents.\"$agent\".pending_upgrades | length" "$versions_file" 2>/dev/null || echo "0")
        if [[ "$pending_count" == "0" ]]; then
            echo "  (none)"
        else
            yq ".agents.\"$agent\".pending_upgrades[]" "$versions_file" 2>/dev/null | while read -r upgrade; do
                echo "  - $upgrade"
            done
        fi
    else
        grep -A 20 "^  $agent:" "$versions_file" 2>/dev/null | head -15 || warn "Agent not found"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Upgrade Agent
# ═══════════════════════════════════════════════════════════════════════════════

upgrade_agent() {
    local agent="$1"
    local capability="$2"

    if [[ -z "$agent" ]]; then
        error "Usage: ctoc agent upgrade <agent-name> [capability]"
    fi

    info "Upgrading agent: $agent"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # This is where Claude would:
    # 1. Research current best practices
    # 2. Search GitHub for implementations
    # 3. Analyze and propose upgrades
    # 4. Update the activation-map.yaml
    # 5. Update agent version

    echo "Upgrade workflow:"
    echo "  1. Research current best practices (web search)"
    echo "  2. Search GitHub for state-of-the-art implementations"
    echo "  3. Compare with current agent capabilities"
    echo "  4. Generate upgrade proposal"
    echo "  5. Test in sandbox"
    echo "  6. Create PR with changes"
    echo ""

    if [[ -n "$capability" ]]; then
        echo "Adding capability: $capability"
        # Add to pending_upgrades
        local versions_file
        versions_file=$(get_versions_file)

        if command -v yq &>/dev/null; then
            yq -i ".agents.\"$agent\".pending_upgrades += [\"$capability\"]" "$versions_file"
            success "Added to pending upgrades: $capability"
        else
            echo "Note: Install yq for automatic updates"
        fi
    fi

    echo ""
    warn "Note: Actual upgrade requires Claude Code to research and implement."
    echo "Run: ctoc agent research $agent"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Research Agent Capabilities
# ═══════════════════════════════════════════════════════════════════════════════

research_agent() {
    local agent="$1"

    if [[ -z "$agent" ]]; then
        error "Usage: ctoc agent research <agent-name>"
    fi

    info "Research: $agent"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # Map agent to research topics
    local topics=""
    case "$agent" in
        security-scanner)
            topics="OWASP Top 10 2026,CVE database,SBOM generation,supply chain security"
            ;;
        code-reviewer)
            topics="code review best practices 2026,static analysis,AI code review"
            ;;
        performance-profiler)
            topics="performance profiling 2026,benchmarking,memory analysis"
            ;;
        documentation-updater)
            topics="documentation generation,API docs,README best practices"
            ;;
        dependency-checker)
            topics="dependency security,npm audit,pip audit,cargo audit"
            ;;
        *)
            topics="$agent best practices 2026"
            ;;
    esac

    echo "Suggested research queries:"
    echo ""
    IFS=',' read -ra QUERIES <<< "$topics"
    for query in "${QUERIES[@]}"; do
        echo "  - WebSearch: \"$query\""
    done
    echo ""

    echo "GitHub searches:"
    echo "  - gh search repos \"$agent\" --sort stars --limit 10"
    echo "  - gh search code \"$agent\" --limit 20"
    echo ""

    info "Run these searches to gather upgrade information."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check for Updates
# ═══════════════════════════════════════════════════════════════════════════════

check_updates() {
    info "Checking for agent updates..."
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    local versions_file
    versions_file=$(get_versions_file)

    # Check remote for updates
    local remote_url="https://raw.githubusercontent.com/robotijn/ctoc/main/.ctoc/agents/versions.yaml"

    if command -v curl &>/dev/null; then
        local remote_content
        remote_content=$(curl -sSL "$remote_url" 2>/dev/null || echo "")

        if [[ -n "$remote_content" ]]; then
            echo "Remote version available."
            echo "Compare with local using: diff <(curl -sSL \"$remote_url\") \"$versions_file\""
        else
            warn "Could not fetch remote versions."
        fi
    else
        warn "curl not found. Cannot check for updates."
    fi

    echo ""

    # Show agents with pending upgrades
    echo "Agents with pending upgrades:"
    if command -v yq &>/dev/null; then
        local has_pending=false
        yq '.agents | keys | .[]' "$versions_file" 2>/dev/null | while read -r agent; do
            local count
            count=$(yq ".agents.\"$agent\".pending_upgrades | length" "$versions_file" 2>/dev/null || echo "0")
            if [[ "$count" != "0" ]] && [[ "$count" != "null" ]]; then
                echo "  - $agent ($count pending)"
                has_pending=true
            fi
        done

        if [[ "$has_pending" == "false" ]]; then
            echo "  (none)"
        fi
    else
        echo "  Install yq for detailed view"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Apply Upgrade
# ═══════════════════════════════════════════════════════════════════════════════

apply_upgrade() {
    local agent="$1"

    if [[ -z "$agent" ]]; then
        error "Usage: ctoc agent apply <agent-name>"
    fi

    local versions_file
    versions_file=$(get_versions_file)

    info "Applying upgrades for: $agent"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    if command -v yq &>/dev/null; then
        # Get pending upgrades
        local pending
        pending=$(yq ".agents.\"$agent\".pending_upgrades[]" "$versions_file" 2>/dev/null)

        if [[ -z "$pending" ]]; then
            echo "No pending upgrades for $agent"
            return 0
        fi

        echo "Applying upgrades:"
        echo "$pending" | while read -r upgrade; do
            echo "  - $upgrade"
            # Move from pending to capabilities
            yq -i ".agents.\"$agent\".capabilities += [\"$upgrade\"]" "$versions_file"
        done

        # Clear pending
        yq -i ".agents.\"$agent\".pending_upgrades = []" "$versions_file"

        # Bump version
        local current_version
        current_version=$(yq ".agents.\"$agent\".version" "$versions_file" 2>/dev/null || echo "1.0.0")
        # Simple version bump: increment patch
        local new_version
        new_version=$(echo "$current_version" | awk -F. '{print $1"."$2"."($3+1)}')
        yq -i ".agents.\"$agent\".version = \"$new_version\"" "$versions_file"
        yq -i ".agents.\"$agent\".last_updated = \"$(date -I)\"" "$versions_file"

        success "Upgraded $agent to v$new_version"
    else
        error "yq required for applying upgrades"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << EOF
CTOC Agent Upgrade Framework v$VERSION

USAGE:
    ctoc agent <command> [options]

COMMANDS:
    list                    List all agents
    info <name>             Show agent details
    upgrade <name> [cap]    Add capability to upgrade queue
    research <name>         Show research queries for agent
    check                   Check for available updates
    apply <name>            Apply pending upgrades

EXAMPLES:
    ctoc agent list
    ctoc agent info security-scanner
    ctoc agent upgrade security-scanner sbom_generation
    ctoc agent research security-scanner
    ctoc agent apply security-scanner

AGENT CATEGORIES:
    Coordinator (1)     - cto-coordinator
    Testing (9)         - unit/integration/e2e test writers and runners
    Quality (8)         - code-reviewer, architecture-checker, etc.
    Security (5)        - security-scanner, secrets-detector, etc.
    Performance (4)     - performance-profiler, memory-checker, etc.
    Documentation (2)   - documentation-updater, changelog-generator
    And more...

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local command="${1:-help}"
    local arg1="${2:-}"
    local arg2="${3:-}"

    case "$command" in
        list)
            list_agents
            ;;
        info|show)
            show_agent "$arg1"
            ;;
        upgrade|add)
            upgrade_agent "$arg1" "$arg2"
            ;;
        research)
            research_agent "$arg1"
            ;;
        check|updates)
            check_updates
            ;;
        apply)
            apply_upgrade "$arg1"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Unknown command: $command. Use 'ctoc agent help' for usage."
            ;;
    esac
}

main "$@"
