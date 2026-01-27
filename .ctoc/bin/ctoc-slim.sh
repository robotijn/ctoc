#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC Slim - Minimal wrapper with smart routing
#
#  This is the future of ctoc: ~80 lines instead of 1000+
#  Deterministic ops stay fast, everything else routes to smart-router agent
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.4.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Deterministic Operations - Bash handles directly, no Claude needed
# ═══════════════════════════════════════════════════════════════════════════════

deterministic_op() {
    local cmd="$1"
    shift || true

    case "$cmd" in
        # Version - instant
        version|--version|-v)
            echo "CTOC v$VERSION"
            return 0
            ;;

        # Git workflow - fast, deterministic
        sync)
            exec "$SCRIPT_DIR/git-workflow.sh" sync "$@"
            ;;
        commit)
            exec "$SCRIPT_DIR/git-workflow.sh" commit "$@"
            ;;
        qc|quick-commit)
            exec "$SCRIPT_DIR/git-workflow.sh" qc "$@"
            ;;
        status)
            exec "$SCRIPT_DIR/git-workflow.sh" status "$@"
            ;;

        # Plan lifecycle - deterministic transitions
        plan)
            exec "$SCRIPT_DIR/plan.sh" "$@"
            ;;

        # Progress tracking - deterministic
        progress|dashboard)
            exec "$SCRIPT_DIR/progress.sh" "$@"
            ;;

        # Maintenance - deterministic
        doctor)
            # Inline doctor for speed
            echo -e "${CYAN}CTOC Doctor v$VERSION${NC}"
            [[ -d ".ctoc" ]] && echo -e "  ${GREEN}✓${NC} .ctoc/ exists" || echo -e "  ${RED}✗${NC} .ctoc/ missing"
            [[ -f "CLAUDE.md" ]] && echo -e "  ${GREEN}✓${NC} CLAUDE.md exists" || echo -e "  ${YELLOW}⚠${NC} CLAUDE.md missing"
            command -v git &>/dev/null && echo -e "  ${GREEN}✓${NC} git" || echo -e "  ${RED}✗${NC} git missing"
            command -v claude &>/dev/null && echo -e "  ${GREEN}✓${NC} claude" || echo -e "  ${YELLOW}⚠${NC} claude missing"
            return 0
            ;;

        update)
            if [[ -d ".ctoc/repo/.git" ]]; then
                cd .ctoc/repo && git pull --rebase --quiet && cd - > /dev/null
                echo -e "${GREEN}Updated!${NC}"
            else
                curl -fsSL "https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh" | bash
            fi
            return 0
            ;;
    esac

    return 1  # Not a deterministic op
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Smart Router - Claude handles everything else
# ═══════════════════════════════════════════════════════════════════════════════

invoke_smart_router() {
    local cmd="$1"
    shift || true
    local args="$*"

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}SMART ROUTER${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Command:  $cmd $args"
    echo ""
    echo "This command requires the smart-router agent."
    echo "The agent will:"
    echo "  1. Parse your command and understand intent"
    echo "  2. Route to the appropriate operation agent"
    echo "  3. Handle typos and suggest alternatives"
    echo ""
    echo "Agent spec: .ctoc/operations/core/smart-router.md"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"

    # Ensure cache directory exists
    [[ -d ".ctoc" ]] && mkdir -p ".ctoc/cache" 2>/dev/null || true

    # Try deterministic first (fast path)
    if deterministic_op "$@" 2>/dev/null; then
        exit 0
    fi

    # Help - can be generated but show static for now
    if [[ "$cmd" == "help" || "$cmd" == "--help" || "$cmd" == "-h" ]]; then
        cat << 'EOF'
CTOC Slim - Smart Command Router

DETERMINISTIC (instant, no Claude):
    sync, commit, qc, status    Git workflow
    plan <subcommand>           Plan management
    progress, dashboard         Progress tracking
    doctor, update, version     Maintenance

AGENT-POWERED (routes to smart-router):
    Everything else → smart-router agent

    Examples:
      ctoc understand           → understand agent
      ctoc setup                → project-setup agent
      ctoc detect               → understand agent
      ctoc "check my code"      → git-advisor agent (intent)
      ctoc understnad           → "Did you mean understand?"

Run 'ctoc help --full' for complete command list (via smart-router).
EOF
        exit 0
    fi

    # Everything else goes to smart router
    invoke_smart_router "$@"
}

main "$@"
