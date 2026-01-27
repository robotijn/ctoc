#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management
#  Folder-based organization: plans move between status folders
#  Naming: {4-digit-counter}-{slug}.md (e.g., 0052-landing-page-login-button.md)
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

# Plan directories - folder per status
PLANS_DIR=".ctoc/plans"
INDEX_FILE="$PLANS_DIR/index.yaml"

# Status folders (source of truth)
STATUS_FOLDERS=("draft" "proposed" "approved" "in_progress" "implemented" "superseded")

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

init_plans() {
    # Create status folders
    for status in "${STATUS_FOLDERS[@]}"; do
        mkdir -p "$PLANS_DIR/$status"
    done

    if [[ ! -f "$INDEX_FILE" ]]; then
        cat > "$INDEX_FILE" << 'EOF'
# CTOC Plan Index
# Counter tracks next plan number
# Plans organized by status folders (source of truth)

next_counter: 1
EOF
        echo -e "${GREEN}Plans directory initialized.${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Next Counter
# ═══════════════════════════════════════════════════════════════════════════════

get_next_counter() {
    if [[ ! -f "$INDEX_FILE" ]]; then
        echo "0001"
        return
    fi

    local counter
    counter=$(grep "^next_counter:" "$INDEX_FILE" | awk '{print $2}' || echo "1")
    counter=${counter:-1}

    printf "%04d" "$counter"
}

increment_counter() {
    if [[ ! -f "$INDEX_FILE" ]]; then
        return
    fi

    local current
    current=$(grep "^next_counter:" "$INDEX_FILE" | awk '{print $2}' || echo "1")
    current=${current:-1}

    local next=$((current + 1))
    sed -i "s/^next_counter: .*/next_counter: $next/" "$INDEX_FILE"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Slug from Title
# ═══════════════════════════════════════════════════════════════════════════════

create_slug() {
    local title="$1"
    # Lowercase, replace spaces with dashes, remove special chars, limit length
    echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-60
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Find Plan by ID (counter prefix)
# ═══════════════════════════════════════════════════════════════════════════════

find_plan() {
    local id="$1"

    # Normalize ID to 4 digits
    local normalized_id
    normalized_id=$(printf "%04d" "$((10#$id))" 2>/dev/null || echo "$id")

    # Search in all status folders
    for status in "${STATUS_FOLDERS[@]}"; do
        local found
        found=$(find "$PLANS_DIR/$status" -maxdepth 1 -name "${normalized_id}-*.md" 2>/dev/null | head -1)
        if [[ -n "$found" && -f "$found" ]]; then
            echo "$found"
            return 0
        fi
    done

    return 1
}

get_plan_status() {
    local filepath="$1"
    # Extract status from path
    local dir
    dir=$(dirname "$filepath")
    basename "$dir"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

create_plan() {
    local title="$1"
    local plan_type="${2:-functional}"  # functional or implementation
    local parent_id="${3:-}"            # Parent plan ID for implementation plans

    init_plans

    local counter
    counter=$(get_next_counter)

    local slug
    slug=$(create_slug "$title")

    local filename="${counter}-${slug}.md"
    local filepath="$PLANS_DIR/draft/$filename"

    local date
    date=$(date +%Y-%m-%d)
    local author="${USER:-unknown}"

    # Resolve parent info if provided
    local parent_file=""
    local parent_title=""
    if [[ -n "$parent_id" ]]; then
        parent_file=$(find_plan "$parent_id") || true
        if [[ -n "$parent_file" ]]; then
            parent_title=$(grep "^title:" "$parent_file" | sed 's/title: "\(.*\)"/\1/' | head -1)
        fi
    fi

    cat > "$filepath" << EOF
---
id: $counter
title: "$title"
type: $plan_type
created: $date
author: $author
${parent_id:+parent_id: $parent_id}
${parent_title:+parent_title: "$parent_title"}
approvers: []
branch: null
pr: null
---

# $title

## Summary

*Brief description of what this plan achieves*

## Background

*Context and motivation for this plan*

## Requirements

### Functional Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Non-Functional Requirements
- [ ] Performance:
- [ ] Security:

## Design

*Technical design and approach*

## Implementation Steps

1. Step 1
2. Step 2
3. Step 3

## Testing Strategy

*How will this be tested?*

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

## Dependencies

*What does this depend on?*

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
EOF

    increment_counter

    echo -e "${GREEN}Created plan: $counter${NC}"
    echo "  File: $filepath"
    echo "  Status: draft"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $filepath to fill in details"
    echo "  2. Run 'ctoc plan propose $counter' when ready for review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Move Plan Between Status Folders
# ═══════════════════════════════════════════════════════════════════════════════

move_plan() {
    local plan_id="$1"
    local new_status="$2"

    # Validate status
    local valid=false
    for status in "${STATUS_FOLDERS[@]}"; do
        [[ "$status" == "$new_status" ]] && valid=true
    done

    if [[ "$valid" != "true" ]]; then
        echo -e "${RED}Invalid status: $new_status${NC}"
        echo "Valid statuses: ${STATUS_FOLDERS[*]}"
        exit 1
    fi

    # Find current plan location
    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_status
    current_status=$(get_plan_status "$plan_file")

    if [[ "$current_status" == "$new_status" ]]; then
        echo "Plan $plan_id is already in $new_status"
        return 0
    fi

    # Move to new folder
    local filename
    filename=$(basename "$plan_file")
    local new_path="$PLANS_DIR/$new_status/$filename"

    mv "$plan_file" "$new_path"

    echo -e "${GREEN}Plan $plan_id: $current_status → $new_status${NC}"
    echo "  File: $new_path"

    # Handle status-specific actions
    case "$new_status" in
        approved)
            echo ""
            echo "Plan approved! Next steps:"
            echo "  • Run 'ctoc plan implement $plan_id' to create implementation plan"
            echo "  • Or run 'ctoc plan start $plan_id' to begin work directly"
            ;;
        in_progress)
            local branch_name="plan-$plan_id"
            echo ""
            echo "Suggested branch: $branch_name"
            # Update frontmatter with branch
            sed -i "s/^branch: .*/branch: $branch_name/" "$new_path"
            ;;
        implemented)
            echo ""
            echo "Plan completed!"
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Lifecycle Commands
# ═══════════════════════════════════════════════════════════════════════════════

propose_plan() {
    local plan_id="$1"
    move_plan "$plan_id" "proposed"
    echo ""
    echo "Plan submitted for review."
}

approve_plan() {
    local plan_id="$1"
    local approver="${2:-${USER:-unknown}}"
    local date
    date=$(date +%Y-%m-%d)

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    # Add approval to history table
    sed -i "/^| Approver | Date | Decision | Notes |/a\\| $approver | $date | Approved | |" "$plan_file"

    move_plan "$plan_id" "approved"
}

start_plan() {
    local plan_id="$1"
    move_plan "$plan_id" "in_progress"
}

complete_plan() {
    local plan_id="$1"
    move_plan "$plan_id" "implemented"
}

supersede_plan() {
    local plan_id="$1"
    local reason="${2:-Superseded by newer plan}"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -n "$plan_file" && -f "$plan_file" ]]; then
        # Add superseded note
        echo "" >> "$plan_file"
        echo "## Superseded" >> "$plan_file"
        echo "" >> "$plan_file"
        echo "**Date:** $(date +%Y-%m-%d)" >> "$plan_file"
        echo "**Reason:** $reason" >> "$plan_file"
    fi

    move_plan "$plan_id" "superseded"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Implementation Plan
# ═══════════════════════════════════════════════════════════════════════════════

implement_plan() {
    local parent_id="$1"

    local parent_file
    parent_file=$(find_plan "$parent_id")

    if [[ -z "$parent_file" || ! -f "$parent_file" ]]; then
        echo -e "${RED}Parent plan not found: $parent_id${NC}"
        exit 1
    fi

    local parent_title
    parent_title=$(grep "^title:" "$parent_file" | sed 's/title: "\(.*\)"/\1/' | head -1)

    echo "Creating implementation plan for: $parent_title"
    create_plan "impl-$parent_title" "implementation" "$parent_id"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Plans
# ═══════════════════════════════════════════════════════════════════════════════

list_plans() {
    local filter="${1:-all}"

    init_plans

    echo -e "${CYAN}CTOC Plans${NC}"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""

    local found=false

    if [[ "$filter" == "all" ]]; then
        for status in "${STATUS_FOLDERS[@]}"; do
            list_status_folder "$status"
        done
    else
        list_status_folder "$filter"
    fi
}

list_status_folder() {
    local status="$1"
    local folder="$PLANS_DIR/$status"

    if [[ ! -d "$folder" ]]; then
        return
    fi

    local files
    files=$(find "$folder" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort)

    if [[ -z "$files" ]]; then
        return
    fi

    # Status color
    local status_color="$NC"
    case "$status" in
        draft) status_color="$YELLOW" ;;
        proposed) status_color="$BLUE" ;;
        approved) status_color="$GREEN" ;;
        in_progress) status_color="$CYAN" ;;
        implemented) status_color="$GREEN" ;;
        superseded) status_color="$RED" ;;
    esac

    echo -e "${status_color}[$status]${NC}"

    while IFS= read -r filepath; do
        [[ -z "$filepath" ]] && continue

        local filename
        filename=$(basename "$filepath" .md)

        local id
        id=$(echo "$filename" | cut -d'-' -f1)

        local title
        title=$(grep "^title:" "$filepath" | sed 's/title: "\(.*\)"/\1/' | head -1)
        title="${title:-$filename}"

        local plan_type
        plan_type=$(grep "^type:" "$filepath" | awk '{print $2}' | head -1)
        plan_type="${plan_type:-functional}"

        local type_badge=""
        [[ "$plan_type" == "implementation" ]] && type_badge=" [impl]"

        printf "  %s  %-55s%s\n" "$id" "${title:0:53}" "$type_badge"
    done <<< "$files"

    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Status Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    init_plans

    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                      CTOC Plan Dashboard                         ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    # Count by status
    echo "Plan Statistics:"
    echo ""

    local total=0
    for status in "${STATUS_FOLDERS[@]}"; do
        local count
        count=$(find "$PLANS_DIR/$status" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
        count=$((count + 0))  # Ensure numeric

        local status_color="$NC"
        case "$status" in
            draft) status_color="$YELLOW" ;;
            proposed) status_color="$BLUE" ;;
            approved) status_color="$GREEN" ;;
            in_progress) status_color="$CYAN" ;;
            implemented) status_color="$GREEN" ;;
            superseded) status_color="$RED" ;;
        esac

        printf "  ${status_color}%-14s${NC} %d\n" "$status:" "$count"
        total=$((total + count))
    done

    echo "  ──────────────────"
    printf "  %-14s %d\n" "Total:" "$total"
    echo ""

    # Show active plans
    local in_progress_count
    in_progress_count=$(find "$PLANS_DIR/in_progress" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $in_progress_count -gt 0 ]]; then
        echo -e "${CYAN}Active Plans:${NC}"
        list_status_folder "in_progress"
    fi

    # Show ready plans
    local approved_count
    approved_count=$(find "$PLANS_DIR/approved" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $approved_count -gt 0 ]]; then
        echo -e "${GREEN}Ready to Start:${NC}"
        list_status_folder "approved"
    fi

    # Show pending review
    local proposed_count
    proposed_count=$(find "$PLANS_DIR/proposed" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $proposed_count -gt 0 ]]; then
        echo -e "${BLUE}Pending Review:${NC}"
        list_status_folder "proposed"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Plan Details
# ═══════════════════════════════════════════════════════════════════════════════

show_plan() {
    local plan_id="$1"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local status
    status=$(get_plan_status "$plan_file")

    echo -e "${CYAN}Plan $plan_id${NC} [$status]"
    echo "File: $plan_file"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    cat "$plan_file"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Plan Management

Plans are organized by status folders. Moving between statuses = moving files.
Naming: {4-digit-counter}-{slug}.md (e.g., 0052-landing-page-login-button.md)

USAGE:
    ctoc plan <command> [options]

COMMANDS:
    new <title>           Create a new plan (starts in draft/)
    propose <id>          Submit for review (draft/ → proposed/)
    approve <id>          Approve plan (proposed/ → approved/)
    start <id>            Begin work (approved/ → in_progress/)
    complete <id>         Mark done (in_progress/ → implemented/)
    supersede <id>        Replace with newer (any → superseded/)
    implement <id>        Create implementation plan from functional plan
    move <id> <status>    Move plan to any status folder
    list [status]         List plans (or filter by status)
    status                Show dashboard
    show <id>             Show plan details

PLAN LIFECYCLE:
    draft/ → proposed/ → approved/ → in_progress/ → implemented/
                                          ↓
                                    superseded/

FOLDER STRUCTURE:
    .ctoc/plans/
    ├── draft/              New plans start here
    ├── proposed/           Awaiting review
    ├── approved/           Ready to implement
    ├── in_progress/        Currently being worked on
    ├── implemented/        Completed
    └── superseded/         Replaced by newer plans

EXAMPLES:
    ctoc plan new "Landing page login button"
    ctoc plan propose 52
    ctoc plan approve 52
    ctoc plan start 52
    ctoc plan complete 52
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
            create_plan "$1" "${2:-functional}" "${3:-}"
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
        complete)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan complete <plan-id>"
                exit 1
            fi
            complete_plan "$1"
            ;;
        supersede)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan supersede <plan-id> [reason]"
                exit 1
            fi
            supersede_plan "$1" "${2:-}"
            ;;
        implement)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan implement <parent-plan-id>"
                exit 1
            fi
            implement_plan "$1"
            ;;
        move|transition)
            if [[ $# -lt 2 ]]; then
                echo "Usage: ctoc plan move <plan-id> <status>"
                echo "Statuses: ${STATUS_FOLDERS[*]}"
                exit 1
            fi
            move_plan "$1" "$2"
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
            show_plan "$1"
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
