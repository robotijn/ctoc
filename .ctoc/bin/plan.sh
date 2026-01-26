#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management
#  Manages plan states: DRAFT → PROPOSED → APPROVED → IN_PROGRESS → IMPLEMENTED
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

# Plan directories
PLANS_DIR=".ctoc/plans"
FUNCTIONAL_DIR="$PLANS_DIR/functional"
IMPLEMENTATION_DIR="$PLANS_DIR/implementation"
INDEX_FILE="$PLANS_DIR/index.yaml"

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

init_plans() {
    mkdir -p "$FUNCTIONAL_DIR" "$IMPLEMENTATION_DIR"

    if [[ ! -f "$INDEX_FILE" ]]; then
        cat > "$INDEX_FILE" << 'EOF'
# CTOC Plan Index
# Tracks all plans and their statuses

plans: []
last_plan_number: 0
EOF
        echo -e "${GREEN}Plans directory initialized.${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Generate Plan ID
# ═══════════════════════════════════════════════════════════════════════════════

get_next_plan_id() {
    local prefix="${1:-PLAN}"

    if [[ ! -f "$INDEX_FILE" ]]; then
        echo "${prefix}-001"
        return
    fi

    local last_num
    last_num=$(grep "last_plan_number:" "$INDEX_FILE" | awk '{print $2}' || echo "0")
    last_num=${last_num:-0}

    local next_num=$((last_num + 1))
    printf "%s-%03d" "$prefix" "$next_num"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

create_plan() {
    local title="$1"
    local type="${2:-functional}"  # functional or implementation
    local parent="${3:-}"          # Parent plan ID for implementation plans

    init_plans

    local prefix="PLAN"
    local target_dir="$FUNCTIONAL_DIR"

    if [[ "$type" == "implementation" ]]; then
        prefix="IMPL"
        target_dir="$IMPLEMENTATION_DIR"
    fi

    local plan_id
    plan_id=$(get_next_plan_id "$prefix")

    local filename
    filename=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
    filename="${plan_id}-${filename:0:50}.md"

    local filepath="$target_dir/$filename"
    local date
    date=$(date +%Y-%m-%d)
    local author="${USER:-unknown}"

    cat > "$filepath" << EOF
---
id: $plan_id
title: "$title"
status: draft
type: $type
created: $date
author: $author
approvers: []
${parent:+parent_plan: $parent}
branch: null
pr: null
commits: []
---

# $title

## Summary

*TODO: Brief description of what this plan achieves*

## Background

*TODO: Context and motivation for this plan*

## Requirements

### Functional Requirements
- [ ] *TODO: Add requirements*

### Non-Functional Requirements
- [ ] *TODO: Add requirements*

## Design

*TODO: Technical design and approach*

## Implementation Steps

1. *TODO: Step 1*
2. *TODO: Step 2*
3. *TODO: Step 3*

## Testing Strategy

*TODO: How will this be tested?*

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| *TODO* | *TODO* |

## Dependencies

*TODO: What does this depend on?*

## Timeline

*TODO: Milestones and estimates (if applicable)*

---

## Approval History

| Approver | Date | Status | Notes |
|----------|------|--------|-------|
| | | | |
EOF

    # Update index
    local last_num
    last_num=$(grep "last_plan_number:" "$INDEX_FILE" | awk '{print $2}' || echo "0")
    last_num=${last_num:-0}
    local next_num=$((last_num + 1))

    # Add to index (simple append for now)
    sed -i "s/last_plan_number: .*/last_plan_number: $next_num/" "$INDEX_FILE"

    # Add plan entry to index
    cat >> "$INDEX_FILE" << EOF

- id: $plan_id
  title: "$title"
  status: draft
  type: $type
  file: $filepath
  created: $date
EOF

    echo -e "${GREEN}Created plan: $plan_id${NC}"
    echo "  File: $filepath"
    echo "  Status: DRAFT"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $filepath to fill in details"
    echo "  2. Run 'ctoc plan propose $plan_id' when ready for review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Plan Status
# ═══════════════════════════════════════════════════════════════════════════════

transition_plan() {
    local plan_id="$1"
    local new_status="$2"

    # Valid statuses
    local valid_statuses="draft proposed approved in_progress implemented superseded"
    if [[ ! " $valid_statuses " =~ " $new_status " ]]; then
        echo -e "${RED}Invalid status: $new_status${NC}"
        echo "Valid statuses: $valid_statuses"
        exit 1
    fi

    # Find plan file
    local plan_file
    plan_file=$(find "$PLANS_DIR" -name "${plan_id}*.md" 2>/dev/null | head -1)

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    # Update status in plan file
    sed -i "s/^status: .*/status: $new_status/" "$plan_file"

    # Update status in index
    sed -i "/$plan_id/,/^-/{s/status: .*/status: $new_status/}" "$INDEX_FILE"

    echo -e "${GREEN}Plan $plan_id status updated to: $new_status${NC}"

    # Handle status-specific actions
    case "$new_status" in
        approved)
            echo ""
            echo "Plan approved! Next steps:"
            echo "  1. Run 'ctoc plan implement $plan_id' to create implementation plan"
            echo "  2. Or run 'ctoc plan start $plan_id' to begin work directly"
            ;;
        in_progress)
            # Create branch if needed
            local branch_name="feature/$plan_id"
            if git rev-parse --verify "$branch_name" &>/dev/null 2>&1; then
                echo "Branch $branch_name already exists"
            else
                echo "Creating branch: $branch_name"
                git checkout -b "$branch_name" 2>/dev/null || true
            fi
            # Update plan with branch
            sed -i "s/^branch: .*/branch: $branch_name/" "$plan_file"
            ;;
        implemented)
            echo ""
            echo "Plan marked as implemented."
            echo "Consider running 'ctoc plan archive $plan_id'"
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Propose Plan (DRAFT → PROPOSED)
# ═══════════════════════════════════════════════════════════════════════════════

propose_plan() {
    local plan_id="$1"
    transition_plan "$plan_id" "proposed"
    echo ""
    echo "Plan submitted for review."
    echo "Run 'ctoc plan approve $plan_id' to approve."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Approve Plan (PROPOSED → APPROVED)
# ═══════════════════════════════════════════════════════════════════════════════

approve_plan() {
    local plan_id="$1"
    local approver="${2:-${USER:-unknown}}"
    local date
    date=$(date +%Y-%m-%d)

    # Find plan file
    local plan_file
    plan_file=$(find "$PLANS_DIR" -name "${plan_id}*.md" 2>/dev/null | head -1)

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    # Add approver to frontmatter
    sed -i "/^approvers:/a\\  - name: $approver\n    date: $date\n    status: approved" "$plan_file"

    # Update approval history table
    sed -i "/^| Approver | Date | Status | Notes |/a\\| $approver | $date | Approved | |" "$plan_file"

    transition_plan "$plan_id" "approved"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Start Plan (APPROVED → IN_PROGRESS)
# ═══════════════════════════════════════════════════════════════════════════════

start_plan() {
    local plan_id="$1"
    transition_plan "$plan_id" "in_progress"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Implementation Plan
# ═══════════════════════════════════════════════════════════════════════════════

implement_plan() {
    local parent_id="$1"

    # Find parent plan
    local parent_file
    parent_file=$(find "$PLANS_DIR" -name "${parent_id}*.md" 2>/dev/null | head -1)

    if [[ -z "$parent_file" || ! -f "$parent_file" ]]; then
        echo -e "${RED}Parent plan not found: $parent_id${NC}"
        exit 1
    fi

    # Get parent title
    local parent_title
    parent_title=$(grep "^title:" "$parent_file" | sed 's/title: "\(.*\)"/\1/' | head -1)

    echo "Creating implementation plan for: $parent_title"
    create_plan "Implementation: $parent_title" "implementation" "$parent_id"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Plans
# ═══════════════════════════════════════════════════════════════════════════════

list_plans() {
    local filter="${1:-all}"  # all, draft, proposed, approved, in_progress, implemented

    if [[ ! -f "$INDEX_FILE" ]]; then
        echo "No plans found. Create one with: ctoc plan new \"Plan Title\""
        return
    fi

    echo -e "${CYAN}CTOC Plans${NC}"
    echo "════════════════════════════════════════════════════════"
    echo ""

    # Parse index and display plans
    local current_id=""
    local current_title=""
    local current_status=""
    local current_type=""

    while IFS= read -r line; do
        if [[ "$line" =~ ^-\ id:\ (.+) ]]; then
            # Print previous plan if exists
            if [[ -n "$current_id" ]]; then
                if [[ "$filter" == "all" || "$filter" == "$current_status" ]]; then
                    print_plan_line "$current_id" "$current_title" "$current_status" "$current_type"
                fi
            fi
            current_id="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^\ \ title:\ \"(.+)\" ]]; then
            current_title="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^\ \ status:\ (.+) ]]; then
            current_status="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^\ \ type:\ (.+) ]]; then
            current_type="${BASH_REMATCH[1]}"
        fi
    done < "$INDEX_FILE"

    # Print last plan
    if [[ -n "$current_id" ]]; then
        if [[ "$filter" == "all" || "$filter" == "$current_status" ]]; then
            print_plan_line "$current_id" "$current_title" "$current_status" "$current_type"
        fi
    fi

    echo ""
}

print_plan_line() {
    local id="$1"
    local title="$2"
    local status="$3"
    local type="$4"

    local status_color="$NC"
    case "$status" in
        draft) status_color="$YELLOW" ;;
        proposed) status_color="$BLUE" ;;
        approved) status_color="$GREEN" ;;
        in_progress) status_color="$CYAN" ;;
        implemented) status_color="$GREEN" ;;
        superseded) status_color="$RED" ;;
    esac

    printf "  %-12s %-50s ${status_color}%-12s${NC} %s\n" "$id" "${title:0:48}" "$status" "[$type]"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Status Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                    CTOC Plan Dashboard                       ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    if [[ ! -f "$INDEX_FILE" ]]; then
        echo "No plans yet. Create one with: ctoc plan new \"Plan Title\""
        return
    fi

    # Count by status
    local draft_count=0
    local proposed_count=0
    local approved_count=0
    local in_progress_count=0
    local implemented_count=0

    while IFS= read -r line; do
        case "$line" in
            *"status: draft"*) ((draft_count++)) ;;
            *"status: proposed"*) ((proposed_count++)) ;;
            *"status: approved"*) ((approved_count++)) ;;
            *"status: in_progress"*) ((in_progress_count++)) ;;
            *"status: implemented"*) ((implemented_count++)) ;;
        esac
    done < "$INDEX_FILE"

    echo "Plan Statistics:"
    echo "  Draft:       $draft_count"
    echo "  Proposed:    $proposed_count"
    echo "  Approved:    $approved_count"
    echo "  In Progress: $in_progress_count"
    echo "  Implemented: $implemented_count"
    echo ""

    if [[ $in_progress_count -gt 0 ]]; then
        echo -e "${YELLOW}Active Plans:${NC}"
        list_plans "in_progress"
    fi

    if [[ $approved_count -gt 0 ]]; then
        echo -e "${GREEN}Ready to Start:${NC}"
        list_plans "approved"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Plan Management

USAGE:
    ctoc plan <command> [options]

COMMANDS:
    new <title>           Create a new functional plan
    propose <id>          Submit plan for review (DRAFT → PROPOSED)
    approve <id>          Approve a plan (PROPOSED → APPROVED)
    start <id>            Begin work on plan (APPROVED → IN_PROGRESS)
    implement <id>        Create implementation plan from functional plan
    complete <id>         Mark plan as implemented
    transition <id> <s>   Change plan status manually
    list [status]         List plans (filter by status)
    status                Show plan dashboard
    show <id>             Show plan details

PLAN LIFECYCLE:
    DRAFT → PROPOSED → APPROVED → IN_PROGRESS → IMPLEMENTED
                                      ↓
                                 (can be SUPERSEDED)

EXAMPLES:
    ctoc plan new "Add user authentication"
    ctoc plan propose PLAN-001
    ctoc plan approve PLAN-001
    ctoc plan start PLAN-001
    ctoc plan list in_progress
    ctoc plan status

EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        new)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan new <title>"
                exit 1
            fi
            create_plan "$1"
            ;;
        propose)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan propose <plan-id>"
                exit 1
            fi
            propose_plan "$1"
            ;;
        approve)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan approve <plan-id>"
                exit 1
            fi
            approve_plan "$1" "${2:-}"
            ;;
        start)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan start <plan-id>"
                exit 1
            fi
            start_plan "$1"
            ;;
        implement)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan implement <parent-plan-id>"
                exit 1
            fi
            implement_plan "$1"
            ;;
        complete)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan complete <plan-id>"
                exit 1
            fi
            transition_plan "$1" "implemented"
            ;;
        transition)
            if [[ $# -lt 2 ]]; then
                echo "Usage: ctoc plan transition <plan-id> <status>"
                exit 1
            fi
            transition_plan "$1" "$2"
            ;;
        list)
            list_plans "${1:-all}"
            ;;
        status)
            show_status
            ;;
        show)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan show <plan-id>"
                exit 1
            fi
            local plan_file
            plan_file=$(find "$PLANS_DIR" -name "${1}*.md" 2>/dev/null | head -1)
            if [[ -f "$plan_file" ]]; then
                cat "$plan_file"
            else
                echo "Plan not found: $1"
                exit 1
            fi
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            echo "Run 'ctoc plan help' for usage."
            exit 1
            ;;
    esac
}

main "$@"
