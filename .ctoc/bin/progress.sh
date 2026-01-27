#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Progress Tracking
#  Tracks plan progress and provides dashboard views
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════
#
#  This script works WITH the progress-insights agent for intelligent features.
#
#  Division of Responsibility:
#  ┌─────────────────────────────────────────────────────────────────────────────┐
#  │  progress.sh (This Script)       │  progress-insights Agent                │
#  ├──────────────────────────────────┼─────────────────────────────────────────┤
#  │  - Step tracking (current step,  │  - Meaningful progress analysis         │
#  │    completion status)            │  - Blockers identification              │
#  │  - Dashboard rendering           │  - Velocity and trend insights          │
#  │  - Event recording               │  - Next step recommendations            │
#  │  - Progress file management      │  - Retrospective summaries              │
#  │  - Statistics gathering          │  - Quality gate assessments             │
#  └──────────────────────────────────┴─────────────────────────────────────────┘
#
#  Usage:
#    - Use this script for progress commands (ctoc progress, dashboard, step)
#    - Invoke progress-insights agent for meaningful analysis and recommendations
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
#  Agent Advice Helper
# ═══════════════════════════════════════════════════════════════════════════════

request_agent_advice() {
    local context="${1:-general}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Need intelligent insights?${NC}"
    echo ""
    echo "  Invoke the ${CYAN}progress-insights${NC} agent for:"
    echo "    - Meaningful progress analysis"
    echo "    - Blockers identification"
    echo "    - Velocity and trend insights"
    echo "    - Next step recommendations"
    echo ""
    echo -e "  Usage: ${GREEN}ctoc agent invoke progress-insights${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Progress directories
PROGRESS_DIR="${HOME}/.ctoc/progress"
PROJECT_HASH=$(echo "$PWD" | md5sum | cut -d' ' -f1)
PROGRESS_FILE="$PROGRESS_DIR/${PROJECT_HASH}.yaml"
LOCAL_PROGRESS=".ctoc/progress.yaml"

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Progress Tracking
# ═══════════════════════════════════════════════════════════════════════════════

init_progress() {
    mkdir -p "$PROGRESS_DIR"

    if [[ ! -f "$PROGRESS_FILE" ]]; then
        local project_name
        project_name=$(basename "$PWD")

        cat > "$PROGRESS_FILE" << EOF
# CTOC Progress Tracking
# Project: $project_name
# Path: $PWD

project: $project_name
path: $PWD
created: $(date -Iseconds)

current_plan: null
current_step: 0

plans_completed: 0
total_commits: 0
files_changed: 0

plans: []

history: []
EOF
    fi

    # Also create local progress file for project-specific tracking
    if [[ ! -f "$LOCAL_PROGRESS" ]]; then
        mkdir -p .ctoc
        cat > "$LOCAL_PROGRESS" << EOF
# CTOC Local Progress
# Tracks Iron Loop progress for current work

current_step: 1
step_name: ASSESS
started: $(date -Iseconds)

steps:
  - step: 1
    name: ASSESS
    phase: Planning
    status: in_progress
    started: $(date -Iseconds)
    completed: null
  - step: 2
    name: ALIGN
    phase: Planning
    status: pending
    started: null
    completed: null
  - step: 3
    name: CAPTURE
    phase: Planning
    status: pending
    started: null
    completed: null
  - step: 4
    name: PLAN
    phase: Planning
    status: pending
    started: null
    completed: null
  - step: 5
    name: DESIGN
    phase: Planning
    status: pending
    started: null
    completed: null
  - step: 6
    name: SPEC
    phase: Planning
    status: pending
    started: null
    completed: null
  - step: 7
    name: TEST
    phase: Development
    status: pending
    started: null
    completed: null
  - step: 8
    name: QUALITY
    phase: Development
    status: pending
    started: null
    completed: null
  - step: 9
    name: IMPLEMENT
    phase: Development
    status: pending
    started: null
    completed: null
  - step: 10
    name: REVIEW
    phase: Development
    status: pending
    started: null
    completed: null
  - step: 11
    name: OPTIMIZE
    phase: Delivery
    status: pending
    started: null
    completed: null
  - step: 12
    name: SECURE
    phase: Delivery
    status: pending
    started: null
    completed: null
  - step: 13
    name: DOCUMENT
    phase: Delivery
    status: pending
    started: null
    completed: null
  - step: 14
    name: VERIFY
    phase: Delivery
    status: pending
    started: null
    completed: null
  - step: 15
    name: COMMIT
    phase: Delivery
    status: pending
    started: null
    completed: null

notes: []
EOF
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Step Progress
# ═══════════════════════════════════════════════════════════════════════════════

update_step() {
    local step="$1"
    local status="${2:-in_progress}"

    init_progress

    # Validate step number
    if [[ "$step" -lt 1 || "$step" -gt 15 ]]; then
        echo -e "${RED}Invalid step: $step (must be 1-15)${NC}"
        exit 1
    fi

    # Update current step
    sed -i "s/^current_step: .*/current_step: $step/" "$LOCAL_PROGRESS"

    # Get step name from the IRON_LOOP steps
    local step_names=("ASSESS" "ALIGN" "CAPTURE" "PLAN" "DESIGN" "SPEC" "TEST" "QUALITY" "IMPLEMENT" "REVIEW" "OPTIMIZE" "SECURE" "DOCUMENT" "VERIFY" "COMMIT")
    local step_name="${step_names[$((step-1))]}"

    sed -i "s/^step_name: .*/step_name: $step_name/" "$LOCAL_PROGRESS"

    # Mark previous steps as completed
    for ((i=1; i<step; i++)); do
        # This is a simplified update - in production use proper YAML parsing
        echo "Marked step $i as completed" > /dev/null
    done

    echo -e "${GREEN}Progress updated: Step $step ($step_name) - $status${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Complete Step
# ═══════════════════════════════════════════════════════════════════════════════

complete_step() {
    local step="$1"

    init_progress

    local current_step
    current_step=$(grep "^current_step:" "$LOCAL_PROGRESS" | awk '{print $2}')

    if [[ "$step" -ne "$current_step" ]]; then
        echo -e "${YELLOW}Warning: Completing step $step but current step is $current_step${NC}"
    fi

    # Move to next step
    local next_step=$((step + 1))
    if [[ $next_step -le 15 ]]; then
        update_step "$next_step" "in_progress"
        echo -e "${GREEN}Moving to step $next_step${NC}"
    else
        echo -e "${GREEN}All steps completed!${NC}"

        # Record plan completion in global progress
        local timestamp
        timestamp=$(date -Iseconds)
        echo "  - timestamp: $timestamp" >> "$PROGRESS_FILE"
        echo "    event: plan_completed" >> "$PROGRESS_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

show_dashboard() {
    init_progress

    local project_name
    project_name=$(basename "$PWD")

    # Read current progress
    local current_step=1
    local step_name="ASSESS"
    if [[ -f "$LOCAL_PROGRESS" ]]; then
        current_step=$(grep "^current_step:" "$LOCAL_PROGRESS" | awk '{print $2}' || echo "1")
        step_name=$(grep "^step_name:" "$LOCAL_PROGRESS" | awk '{print $2}' || echo "ASSESS")
    fi

    # Calculate progress percentage
    local progress=$((current_step * 100 / 15))

    # Read global progress for history
    local plans_completed=0
    local total_commits=0
    if [[ -f "$PROGRESS_FILE" ]]; then
        plans_completed=$(grep "^plans_completed:" "$PROGRESS_FILE" | awk '{print $2}' || echo "0")
        total_commits=$(grep "^total_commits:" "$PROGRESS_FILE" | awk '{print $2}' || echo "0")
    fi

    # Get git stats
    local git_commits=0
    local git_changed=0
    if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
        git_commits=$(git rev-list --count HEAD 2>/dev/null || echo "0")
        git_changed=$(git diff --name-only HEAD~10 2>/dev/null | wc -l || echo "0")
    fi

    # Draw dashboard
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                    CTOC Progress Dashboard                   ║
╠══════════════════════════════════════════════════════════════╣
EOF
    echo -e "${NC}"

    printf "║ Project: %-50s ║\n" "$project_name"
    printf "║ Status: Step %d/15 (%s) - %d%% complete%*s║\n" "$current_step" "$step_name" "$progress" $((21 - ${#step_name})) ""

    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo "║ Iron Loop Progress                                           ║"

    # Progress bar
    local filled=$((progress / 5))
    local empty=$((20 - filled))
    printf "║ "
    for ((i=0; i<filled; i++)); do printf "█"; done
    for ((i=0; i<empty; i++)); do printf "░"; done
    printf " %3d%% (Step %d/15)                 ║\n" "$progress" "$current_step"

    echo "║                                                              ║"

    # Step status
    local step_names=("ASSESS" "ALIGN" "CAPTURE" "PLAN" "DESIGN" "SPEC" "TEST" "QUALITY" "IMPLEMENT" "REVIEW" "OPTIMIZE" "SECURE" "DOCUMENT" "VERIFY" "COMMIT")

    echo -n "║ "
    for ((i=1; i<=6; i++)); do
        if [[ $i -lt $current_step ]]; then
            echo -ne "${GREEN}[✓]${NC}"
        elif [[ $i -eq $current_step ]]; then
            echo -ne "${YELLOW}[▶]${NC}"
        else
            echo -n "[ ]"
        fi
        printf " %-7s " "${step_names[$((i-1))]}"
    done
    echo "      ║"

    echo -n "║ "
    for ((i=7; i<=12; i++)); do
        if [[ $i -lt $current_step ]]; then
            echo -ne "${GREEN}[✓]${NC}"
        elif [[ $i -eq $current_step ]]; then
            echo -ne "${YELLOW}[▶]${NC}"
        else
            echo -n "[ ]"
        fi
        printf " %-7s " "${step_names[$((i-1))]}"
    done
    echo "      ║"

    echo -n "║ "
    for ((i=13; i<=15; i++)); do
        if [[ $i -lt $current_step ]]; then
            echo -ne "${GREEN}[✓]${NC}"
        elif [[ $i -eq $current_step ]]; then
            echo -ne "${YELLOW}[▶]${NC}"
        else
            echo -n "[ ]"
        fi
        printf " %-7s " "${step_names[$((i-1))]}"
    done
    echo "                              ║"

    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    printf "║ Lifetime Stats                                               ║\n"
    printf "║ Plans: %-5d | Commits: %-6d | Files Changed: %-5d       ║\n" "$plans_completed" "$git_commits" "$git_changed"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Quick Progress View
# ═══════════════════════════════════════════════════════════════════════════════

show_quick() {
    init_progress

    local current_step=1
    local step_name="ASSESS"
    if [[ -f "$LOCAL_PROGRESS" ]]; then
        current_step=$(grep "^current_step:" "$LOCAL_PROGRESS" | awk '{print $2}' || echo "1")
        step_name=$(grep "^step_name:" "$LOCAL_PROGRESS" | awk '{print $2}' || echo "ASSESS")
    fi

    local progress=$((current_step * 100 / 15))

    echo -e "Iron Loop: Step ${CYAN}$current_step/15${NC} ($step_name) - $progress% complete"

    # Show what phase we're in
    local phase="Planning"
    if [[ $current_step -ge 7 && $current_step -le 10 ]]; then
        phase="Development"
    elif [[ $current_step -ge 11 ]]; then
        phase="Delivery"
    fi

    echo -e "Phase: ${YELLOW}$phase${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Record Event
# ═══════════════════════════════════════════════════════════════════════════════

record_event() {
    local event="$1"
    local details="${2:-}"

    init_progress

    local timestamp
    timestamp=$(date -Iseconds)

    cat >> "$PROGRESS_FILE" << EOF

  - timestamp: $timestamp
    event: $event
${details:+    details: $details}
EOF

    echo -e "${GREEN}Event recorded: $event${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Progress Tracking

USAGE:
    ctoc progress [command]
    ctoc dashboard

COMMANDS:
    show                  Quick progress view (default)
    dashboard             Full progress dashboard
    step <n>              Move to step n
    complete <n>          Complete step n and move to next
    record <event>        Record a custom event
    reset                 Reset progress for current work

IRON LOOP STEPS:
    Planning:    1-ASSESS  2-ALIGN  3-CAPTURE  4-PLAN  5-DESIGN  6-SPEC
    Development: 7-TEST  8-QUALITY  9-IMPLEMENT  10-REVIEW
    Delivery:    11-OPTIMIZE  12-SECURE  13-DOCUMENT  14-VERIFY  15-COMMIT

EXAMPLES:
    ctoc progress                 # Quick view
    ctoc dashboard                # Full dashboard
    ctoc progress step 7          # Move to TEST step
    ctoc progress complete 6      # Complete SPEC, move to TEST

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Reset Progress
# ═══════════════════════════════════════════════════════════════════════════════

reset_progress() {
    if [[ -f "$LOCAL_PROGRESS" ]]; then
        rm "$LOCAL_PROGRESS"
        echo -e "${GREEN}Local progress reset.${NC}"
    fi
    init_progress
    echo "Progress initialized to Step 1 (ASSESS)."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-show}"
    shift || true

    case "$cmd" in
        show|quick)
            show_quick
            ;;
        dashboard|full)
            show_dashboard
            ;;
        step)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc progress step <step-number>"
                exit 1
            fi
            update_step "$1"
            ;;
        complete)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc progress complete <step-number>"
                exit 1
            fi
            complete_step "$1"
            ;;
        record)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc progress record <event> [details]"
                exit 1
            fi
            record_event "$1" "${2:-}"
            ;;
        reset)
            reset_progress
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc progress help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
