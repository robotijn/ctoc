#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management v1.3.0
#
#  Folder-based lifecycle with Iron Loop injection:
#    functional/draft → functional/approved → implementation/draft →
#    implementation/approved → todo (Iron Loop injected) → in_progress →
#    review → done
#
#  Naming: YYYY-MM-DD-NNN-module-feature.md
#  Concurrency: Git push is the atomic operation (no local locks)
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════
#
#  This script works WITH the plan-advisor agent for intelligent features.
#
#  Division of Responsibility:
#  ┌─────────────────────────────────────────────────────────────────────────────┐
#  │  plan.sh (This Script)           │  plan-advisor Agent                     │
#  ├──────────────────────────────────┼─────────────────────────────────────────┤
#  │  - Deterministic lifecycle       │  - Quality assessment of plans          │
#  │    transitions (move, claim,     │  - Iron Loop step customization         │
#  │    complete, etc.)               │  - Dependency analysis                  │
#  │  - File creation and management  │  - Risk identification                  │
#  │  - Git-based atomic claiming     │  - Approval recommendations             │
#  │  - Folder structure maintenance  │  - Context-aware suggestions            │
#  │  - Iron Loop injection template  │  - Intelligent plan refinement          │
#  └──────────────────────────────────┴─────────────────────────────────────────┘
#
#  Usage:
#    - Use this script for lifecycle commands (ctoc plan new, claim, complete)
#    - Invoke plan-advisor agent for intelligent analysis and recommendations
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
    echo -e "${BOLD}Need intelligent advice?${NC}"
    echo ""
    echo "  Invoke the ${CYAN}plan-advisor${NC} agent for:"
    echo "    - Quality assessment of your plan"
    echo "    - Iron Loop step customization for your context"
    echo "    - Dependency analysis and risk identification"
    echo "    - Approval recommendations"
    echo ""
    echo -e "  Usage: ${GREEN}ctoc agent invoke plan-advisor${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Plan directories - ROOT level (git tracked)
PLANS_DIR="plans"
SETTINGS_FILE=".ctoc/settings.yaml"
COUNTER_FILE=".ctoc/counter"
IRON_LOOP_TEMPLATE=".ctoc/repo/IRON_LOOP.md"

# Status folders - the lifecycle stages
LIFECYCLE_FOLDERS=(
    "functional/draft"
    "functional/approved"
    "implementation/draft"
    "implementation/approved"
    "todo"
    "in_progress"
    "review"
    "done"
)

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

init_plans() {
    for folder in "${LIFECYCLE_FOLDERS[@]}"; do
        mkdir -p "$PLANS_DIR/$folder"
    done

    # Ensure counter file exists
    if [[ ! -f "$COUNTER_FILE" ]]; then
        mkdir -p "$(dirname "$COUNTER_FILE")"
        local tz="UTC"
        [[ -f "$SETTINGS_FILE" ]] && tz=$(grep "timezone:" "$SETTINGS_FILE" | awk '{print $2}' | tr -d '"' || echo "UTC")
        local today
        today=$(TZ="$tz" date +%Y-%m-%d)
        echo "${today}:0:${tz}" > "$COUNTER_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Next Plan ID (YYYY-MM-DD-NNN format)
# ═══════════════════════════════════════════════════════════════════════════════

get_next_id() {
    local tz="UTC"
    [[ -f "$SETTINGS_FILE" ]] && tz=$(grep "timezone:" "$SETTINGS_FILE" | awk '{print $2}' | tr -d '"' || echo "UTC")

    local today
    today=$(TZ="$tz" date +%Y-%m-%d)

    # Read counter: "YYYY-MM-DD:N:timezone"
    local counter_date=""
    local counter_num=0

    if [[ -f "$COUNTER_FILE" ]]; then
        IFS=':' read -r counter_date counter_num _ < "$COUNTER_FILE"
    fi

    # Reset counter if new day
    if [[ "$counter_date" != "$today" ]]; then
        counter_num=0
    fi

    # Increment
    counter_num=$((counter_num + 1))

    # Save counter
    echo "${today}:${counter_num}:${tz}" > "$COUNTER_FILE"

    # Return formatted ID
    printf "%s-%03d" "$today" "$counter_num"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Slug from Title
# ═══════════════════════════════════════════════════════════════════════════════

create_slug() {
    local title="$1"
    # Replace spaces with underscores, lowercase, remove special chars, limit length
    echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | tr -cd 'a-z0-9_-' | cut -c1-40
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Find Plan by ID (prefix match)
# ═══════════════════════════════════════════════════════════════════════════════

find_plan() {
    local id="$1"

    # Search in all lifecycle folders
    for folder in "${LIFECYCLE_FOLDERS[@]}"; do
        local found
        found=$(find "$PLANS_DIR/$folder" -maxdepth 1 -name "${id}*.md" 2>/dev/null | head -1)
        if [[ -n "$found" && -f "$found" ]]; then
            echo "$found"
            return 0
        fi
    done

    return 1
}

get_plan_stage() {
    local filepath="$1"
    # Extract stage from path (e.g., "plans/functional/draft/..." → "functional/draft")
    local rel_path="${filepath#$PLANS_DIR/}"
    local stage="${rel_path%/*}"
    echo "$stage"
}

get_stage_color() {
    local stage="$1"
    case "$stage" in
        functional/draft) echo "$YELLOW" ;;
        functional/approved) echo "$GREEN" ;;
        implementation/draft) echo "$BLUE" ;;
        implementation/approved) echo "$CYAN" ;;
        todo) echo "$BOLD$CYAN" ;;
        in_progress) echo "$BOLD$YELLOW" ;;
        review) echo "$BOLD$BLUE" ;;
        done) echo "$GREEN" ;;
        *) echo "$NC" ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

create_plan() {
    local title="$1"
    local module="${2:-general}"

    init_plans

    local id
    id=$(get_next_id)

    local slug
    slug=$(create_slug "$module-$title")

    local filename="${id}-${slug}.md"
    local filepath="$PLANS_DIR/functional/draft/$filename"

    local date
    date=$(date +%Y-%m-%d)
    local author="${USER:-unknown}"

    cat > "$filepath" << EOF
---
id: $id
title: "$title"
module: $module
type: functional
created: $date
author: $author
depends_on: []
approvers: []
---

# $title

## Summary

*Brief description of what this feature achieves*

## Business Value

*Why should we build this? What problem does it solve?*

## User Story

As a [user type], I want to [action], so that [benefit].

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Out of Scope

*What this feature will NOT include*

## Dependencies

*What must be completed before this can start?*

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
EOF

    echo -e "${GREEN}Created plan: $id${NC}"
    echo "  File: $filepath"
    echo "  Stage: functional/draft"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $filepath to fill in details"
    echo "  2. Run 'ctoc plan propose $id' when ready for review"
    echo ""
    echo -e "${CYAN}Tip:${NC} After finalizing the plan, consider running '/clear' to"
    echo "     clear context before starting implementation."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Move Plan Between Stages
# ═══════════════════════════════════════════════════════════════════════════════

move_plan() {
    local plan_id="$1"
    local new_stage="$2"

    # Validate stage
    local valid=false
    for stage in "${LIFECYCLE_FOLDERS[@]}"; do
        [[ "$stage" == "$new_stage" ]] && valid=true
    done

    if [[ "$valid" != "true" ]]; then
        echo -e "${RED}Invalid stage: $new_stage${NC}"
        echo "Valid stages: ${LIFECYCLE_FOLDERS[*]}"
        exit 1
    fi

    # Find current plan location
    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    if [[ "$current_stage" == "$new_stage" ]]; then
        echo "Plan $plan_id is already in $new_stage"
        return 0
    fi

    # Check dependencies before moving to todo
    if [[ "$new_stage" == "todo" ]]; then
        check_dependencies "$plan_file"
    fi

    # Move to new folder
    local filename
    filename=$(basename "$plan_file")
    local new_path="$PLANS_DIR/$new_stage/$filename"

    mv "$plan_file" "$new_path"

    local color
    color=$(get_stage_color "$new_stage")
    echo -e "${GREEN}Plan $plan_id:${NC} $current_stage → ${color}$new_stage${NC}"
    echo "  File: $new_path"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Dependencies
# ═══════════════════════════════════════════════════════════════════════════════

check_dependencies() {
    local plan_file="$1"

    # Extract depends_on from frontmatter
    local deps
    deps=$(grep "^depends_on:" "$plan_file" | sed 's/depends_on: \[\(.*\)\]/\1/' | tr -d '[]"' | tr ',' '\n' | tr -d ' ')

    if [[ -z "$deps" ]]; then
        return 0
    fi

    local blocked=false
    while IFS= read -r dep; do
        [[ -z "$dep" ]] && continue

        # Check if dependency is in done/
        if ! find "$PLANS_DIR/done" -name "${dep}*.md" 2>/dev/null | grep -q .; then
            echo -e "${RED}Blocked:${NC} Dependency '$dep' is not in done/"
            blocked=true
        fi
    done <<< "$deps"

    if [[ "$blocked" == "true" ]]; then
        echo ""
        echo "Complete all dependencies before moving to todo."
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Lifecycle Commands
# ═══════════════════════════════════════════════════════════════════════════════

propose_plan() {
    local plan_id="$1"

    local plan_file
    plan_file=$(find_plan "$plan_id") || true

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    case "$current_stage" in
        functional/draft)
            move_plan "$plan_id" "functional/approved"
            echo ""
            echo "Functional plan submitted for business approval."
            ;;
        implementation/draft)
            move_plan "$plan_id" "implementation/approved"
            echo ""
            echo "Implementation plan submitted for technical approval."
            ;;
        *)
            echo -e "${RED}Cannot propose from stage: $current_stage${NC}"
            echo "Only plans in draft stages can be proposed."
            exit 1
            ;;
    esac
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

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    # Add approval to history table
    sed -i "/^| Approver | Date | Decision | Notes |/a\\| $approver | $date | Approved | |" "$plan_file"

    case "$current_stage" in
        functional/approved)
            # Business approved → create implementation plan
            echo -e "${GREEN}Functional plan approved!${NC}"
            echo ""
            echo "Next: Run 'ctoc plan implement $plan_id' to create technical implementation plan."
            ;;
        implementation/approved)
            # Technical approved → ready for todo (with Iron Loop injection)
            echo -e "${GREEN}Implementation plan approved!${NC}"
            echo ""
            echo "Next: Run 'ctoc plan start $plan_id' to inject Iron Loop and move to todo."
            ;;
        *)
            echo "Plan approved in stage: $current_stage"
            ;;
    esac
}

start_plan() {
    local plan_id="$1"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    if [[ "$current_stage" != "implementation/approved" ]]; then
        echo -e "${RED}Can only start plans from implementation/approved${NC}"
        echo "Current stage: $current_stage"
        exit 1
    fi

    # Inject Iron Loop steps 7-15
    inject_iron_loop "$plan_file"

    # Move to todo
    move_plan "$plan_id" "todo"

    echo ""
    echo -e "${CYAN}Iron Loop steps 7-15 injected!${NC}"
    echo "Plan is now ready for execution in todo/"
    echo ""
    echo "Next: Run 'ctoc plan claim $plan_id' to start working on it."
}

claim_plan() {
    local plan_id="$1"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    if [[ "$current_stage" != "todo" ]]; then
        echo -e "${RED}Can only claim plans from todo/${NC}"
        echo "Current stage: $current_stage"
        exit 1
    fi

    # Git-based atomic claim
    echo "Claiming plan $plan_id..."

    # 1. Pull latest
    if ! git pull --rebase 2>/dev/null; then
        echo -e "${YELLOW}Warning: Could not pull latest changes${NC}"
    fi

    # 2. Check if still in todo/
    plan_file=$(find_plan "$plan_id")
    current_stage=$(get_plan_stage "$plan_file")

    if [[ "$current_stage" != "todo" ]]; then
        echo -e "${RED}Plan already claimed by someone else!${NC}"
        exit 1
    fi

    # 3. Move to in_progress
    local filename
    filename=$(basename "$plan_file")
    local new_path="$PLANS_DIR/in_progress/$filename"

    git mv "$plan_file" "$new_path" 2>/dev/null || mv "$plan_file" "$new_path"

    # 4. Commit
    git add "$new_path" 2>/dev/null || true
    git commit -m "claim: $plan_id" 2>/dev/null || true

    # 5. Push (atomic moment)
    if git push 2>/dev/null; then
        echo -e "${GREEN}Plan claimed successfully!${NC}"
        echo "  File: $new_path"
        echo ""
        echo "You now own this plan. Work through the Iron Loop steps."
        echo "When done, run 'ctoc plan complete $plan_id'"
    else
        echo -e "${RED}Push failed - someone else may have claimed it${NC}"
        # Reset
        git reset --hard HEAD~1 2>/dev/null || true
        git pull --rebase 2>/dev/null || true
        echo ""
        echo "Try claiming a different plan, or check 'ctoc plan list todo'"
        exit 1
    fi
}

complete_plan() {
    local plan_id="$1"
    move_plan "$plan_id" "review"
    echo ""
    echo "Plan moved to review/"
    echo "Awaiting business review. Run 'ctoc plan accept $plan_id' when approved."
}

accept_plan() {
    local plan_id="$1"
    move_plan "$plan_id" "done"
    echo ""
    echo -e "${GREEN}Plan completed!${NC}"
}

reject_plan() {
    local plan_id="$1"
    local reason="${2:-Needs revision}"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -n "$plan_file" && -f "$plan_file" ]]; then
        # Add rejection note
        echo "" >> "$plan_file"
        echo "## Rejection Feedback" >> "$plan_file"
        echo "" >> "$plan_file"
        echo "**Date:** $(date +%Y-%m-%d)" >> "$plan_file"
        echo "**Reason:** $reason" >> "$plan_file"
    fi

    move_plan "$plan_id" "functional/draft"
    echo ""
    echo "Plan returned to functional/draft for revision."
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

    local parent_stage
    parent_stage=$(get_plan_stage "$parent_file")

    if [[ "$parent_stage" != "functional/approved" ]]; then
        echo -e "${RED}Can only create implementation plans from functional/approved${NC}"
        echo "Current stage: $parent_stage"
        exit 1
    fi

    local parent_title
    parent_title=$(grep "^title:" "$parent_file" | sed 's/title: "\(.*\)"/\1/' | head -1)
    local parent_module
    parent_module=$(grep "^module:" "$parent_file" | awk '{print $2}' | head -1)

    init_plans

    local id
    id=$(get_next_id)

    local slug
    slug=$(create_slug "${parent_module:-general}-impl-$parent_title")

    local filename="${id}-${slug}.md"
    local filepath="$PLANS_DIR/implementation/draft/$filename"

    local date
    date=$(date +%Y-%m-%d)
    local author="${USER:-unknown}"

    cat > "$filepath" << EOF
---
id: $id
title: "Implementation: $parent_title"
module: ${parent_module:-general}
type: implementation
parent_id: $parent_id
created: $date
author: $author
depends_on: []
approvers: []
---

# Implementation: $parent_title

## Parent Plan

- ID: $parent_id
- Title: $parent_title
- File: $parent_file

## Technical Summary

*Brief description of the technical approach*

## Architecture

*High-level architecture decisions*

### Components Affected

- [ ] Component 1
- [ ] Component 2

### Data Model Changes

*Database/schema changes if any*

### API Changes

*API changes if any*

## Implementation Steps

### Phase 1: Foundation
1. Step 1
2. Step 2

### Phase 2: Core Logic
1. Step 1
2. Step 2

### Phase 3: Integration
1. Step 1
2. Step 2

## Testing Strategy

### Unit Tests
- [ ] Test case 1
- [ ] Test case 2

### Integration Tests
- [ ] Test case 1

### E2E Tests
- [ ] Test case 1

## Rollback Plan

*How to rollback if something goes wrong*

## Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
EOF

    echo -e "${GREEN}Created implementation plan: $id${NC}"
    echo "  File: $filepath"
    echo "  Parent: $parent_id"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $filepath with technical details"
    echo "  2. Run 'ctoc plan propose $id' when ready for technical review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Inject Iron Loop (Steps 7-15)
# ═══════════════════════════════════════════════════════════════════════════════

inject_iron_loop() {
    local plan_file="$1"

    echo "Injecting Iron Loop steps 7-15..."

    # Read settings for language commands
    local lint_cmd="# Run your linter"
    local format_cmd="# Run your formatter"
    local typecheck_cmd="# Run your type checker"
    local test_cmd="# Run your tests"

    if [[ -f "$SETTINGS_FILE" ]] && command -v grep &>/dev/null; then
        # Try to extract commands from settings (best effort)
        local yaml_lint
        yaml_lint=$(grep -A1 "lint:" "$SETTINGS_FILE" 2>/dev/null | tail -1 | tr -d '"' | xargs || true)
        [[ -n "$yaml_lint" && "$yaml_lint" != "lint:" ]] && lint_cmd="$yaml_lint"
    fi

    # Read plan title and module for context
    local title
    title=$(grep "^title:" "$plan_file" | sed 's/title: "\(.*\)"/\1/' | head -1)
    local module
    module=$(grep "^module:" "$plan_file" | awk '{print $2}' | head -1)

    # Append Iron Loop steps
    cat >> "$plan_file" << EOF

---

## Iron Loop Execution (Steps 7-15)

> This section was auto-injected when the plan moved to todo/.
> Work through each step in order. Check off items as you complete them.

### Step 7: TEST (Write Tests First)

*Write tests before implementation. TDD ensures we build the right thing.*

- [ ] Write unit tests for core functionality
- [ ] Write integration tests for component interactions
- [ ] Write E2E tests for critical user flows
- [ ] Ensure tests fail (proving they test something)

### Step 8: QUALITY (Run Quality Gates)

*All quality checks must pass before proceeding.*

- [ ] Run linters and fix all issues
- [ ] Run formatters
- [ ] Run type checkers (if applicable)
- [ ] Address all warnings (not just errors)

### Step 9: IMPLEMENT (Write Code)

*Implement until all tests pass.*

- [ ] Write minimal code to pass tests
- [ ] Follow existing patterns in codebase
- [ ] No shortcuts on error handling
- [ ] Refactor as needed (tests protect you)

### Step 10: REVIEW (Self-Review as CTO)

*Review your own code with senior engineer standards.*

- [ ] Code is readable and self-documenting
- [ ] No unnecessary complexity
- [ ] Error handling is comprehensive
- [ ] Edge cases are handled
- [ ] No hardcoded values that should be configurable

### Step 11: OPTIMIZE (Performance)

*Only optimize what needs optimizing.*

- [ ] Profile if performance-sensitive
- [ ] Check for N+1 queries
- [ ] Verify no memory leaks
- [ ] Check bundle size (if frontend)
- [ ] Document performance characteristics

### Step 12: SECURE (Security Validation)

*Security is non-negotiable.*

- [ ] No secrets in code
- [ ] Input validation complete
- [ ] Auth/authz properly checked
- [ ] SQL injection prevention
- [ ] XSS prevention (if applicable)
- [ ] CSRF protection (if applicable)
- [ ] Check OWASP top 10

### Step 13: DOCUMENT (Update Docs)

*If it's not documented, it doesn't exist.*

- [ ] Update API documentation
- [ ] Add inline comments where non-obvious
- [ ] Update README if needed
- [ ] Update CHANGELOG
- [ ] Document breaking changes

### Step 14: VERIFY (Final Validation)

*The final gate before shipping.*

- [ ] All tests pass
- [ ] All linters pass
- [ ] Manual testing complete
- [ ] Acceptance criteria from plan verified
- [ ] Demo to stakeholder (if applicable)

### Step 15: COMMIT (Ship It)

*Ship with confidence.*

- [ ] Commit with descriptive message
- [ ] Link to plan ID in commit: "implements $id"
- [ ] PR created (if workflow requires)
- [ ] CI/CD passes
- [ ] Ready for review stage
EOF

    echo -e "${GREEN}Iron Loop injected.${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Abandon Plan (Release from in_progress)
# ═══════════════════════════════════════════════════════════════════════════════

abandon_plan() {
    local plan_id="$1"

    local plan_file
    plan_file=$(find_plan "$plan_id")

    if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
        echo -e "${RED}Plan not found: $plan_id${NC}"
        exit 1
    fi

    local current_stage
    current_stage=$(get_plan_stage "$plan_file")

    if [[ "$current_stage" != "in_progress" ]]; then
        echo "Plan is not in in_progress/"
        exit 1
    fi

    move_plan "$plan_id" "todo"

    # Commit and push (so others can claim)
    git add "$PLANS_DIR" 2>/dev/null || true
    git commit -m "abandon: $plan_id (returning to todo)" 2>/dev/null || true
    git push 2>/dev/null || true

    echo ""
    echo "Plan returned to todo/ and is available for others to claim."
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

    if [[ "$filter" == "all" ]]; then
        for stage in "${LIFECYCLE_FOLDERS[@]}"; do
            list_stage_folder "$stage"
        done
    else
        list_stage_folder "$filter"
    fi
}

list_stage_folder() {
    local stage="$1"
    local folder="$PLANS_DIR/$stage"

    if [[ ! -d "$folder" ]]; then
        return
    fi

    local files
    files=$(find "$folder" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort)

    if [[ -z "$files" ]]; then
        return
    fi

    local color
    color=$(get_stage_color "$stage")

    echo -e "${color}[$stage]${NC}"

    while IFS= read -r filepath; do
        [[ -z "$filepath" ]] && continue

        local filename
        filename=$(basename "$filepath" .md)

        local id
        id=$(echo "$filename" | cut -d'-' -f1-4)  # YYYY-MM-DD-NNN

        local title
        title=$(grep "^title:" "$filepath" | sed 's/title: "\(.*\)"/\1/' | head -1)
        title="${title:-$filename}"

        local plan_type
        plan_type=$(grep "^type:" "$filepath" | awk '{print $2}' | head -1)

        local type_badge=""
        [[ "$plan_type" == "implementation" ]] && type_badge=" [impl]"

        printf "  %s  %-50s%s\n" "$id" "${title:0:48}" "$type_badge"
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

    # Count by stage
    echo "Plan Statistics:"
    echo ""

    local total=0
    for stage in "${LIFECYCLE_FOLDERS[@]}"; do
        local count
        count=$(find "$PLANS_DIR/$stage" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
        count=$((count + 0))

        local color
        color=$(get_stage_color "$stage")

        printf "  ${color}%-25s${NC} %d\n" "$stage:" "$count"
        total=$((total + count))
    done

    echo "  ─────────────────────────────"
    printf "  %-25s %d\n" "Total:" "$total"
    echo ""

    # Show active plans
    local in_progress_count
    in_progress_count=$(find "$PLANS_DIR/in_progress" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $in_progress_count -gt 0 ]]; then
        echo -e "${BOLD}${YELLOW}Active Plans (in_progress):${NC}"
        list_stage_folder "in_progress"
    fi

    # Show ready plans
    local todo_count
    todo_count=$(find "$PLANS_DIR/todo" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $todo_count -gt 0 ]]; then
        echo -e "${BOLD}${CYAN}Ready to Claim (todo):${NC}"
        list_stage_folder "todo"
    fi

    # Show pending review
    local review_count
    review_count=$(find "$PLANS_DIR/review" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $review_count -gt 0 ]]; then
        echo -e "${BOLD}${BLUE}Pending Review:${NC}"
        list_stage_folder "review"
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

    local stage
    stage=$(get_plan_stage "$plan_file")
    local color
    color=$(get_stage_color "$stage")

    echo -e "${CYAN}Plan $plan_id${NC} [${color}$stage${NC}]"
    echo "File: $plan_file"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    cat "$plan_file"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Migration from Old Structure
# ═══════════════════════════════════════════════════════════════════════════════

migrate_plans() {
    echo "Checking for plans to migrate..."

    # Old structure: .ctoc/plans/{draft,proposed,approved,...}
    if [[ -d ".ctoc/plans/draft" ]]; then
        echo "Found old plan structure in .ctoc/plans/"
        echo "Migrating to new structure (plans/)..."

        init_plans

        # Map old folders to new lifecycle stages
        [[ -d ".ctoc/plans/draft" ]] && {
            mv .ctoc/plans/draft/*.md "$PLANS_DIR/functional/draft/" 2>/dev/null || true
            echo "  Moved draft → functional/draft"
        }
        [[ -d ".ctoc/plans/proposed" ]] && {
            mv .ctoc/plans/proposed/*.md "$PLANS_DIR/functional/approved/" 2>/dev/null || true
            echo "  Moved proposed → functional/approved"
        }
        [[ -d ".ctoc/plans/approved" ]] && {
            mv .ctoc/plans/approved/*.md "$PLANS_DIR/implementation/approved/" 2>/dev/null || true
            echo "  Moved approved → implementation/approved"
        }
        [[ -d ".ctoc/plans/in_progress" ]] && {
            mv .ctoc/plans/in_progress/*.md "$PLANS_DIR/in_progress/" 2>/dev/null || true
            echo "  Moved in_progress → in_progress"
        }
        [[ -d ".ctoc/plans/implemented" ]] && {
            mv .ctoc/plans/implemented/*.md "$PLANS_DIR/done/" 2>/dev/null || true
            echo "  Moved implemented → done"
        }
        [[ -d ".ctoc/plans/superseded" ]] && {
            mv .ctoc/plans/superseded/*.md "$PLANS_DIR/done/" 2>/dev/null || true
            echo "  Moved superseded → done"
        }

        # Clean up old structure
        rm -rf .ctoc/plans
        echo ""
        echo -e "${GREEN}Migration complete!${NC}"
        echo ""
        echo "Plans are now in $PLANS_DIR/ (git-tracked)"
    else
        echo "No old structure found. Nothing to migrate."
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
CTOC Plan Management v1.3.0

Plans follow a lifecycle from idea to implementation to completion.
Naming: YYYY-MM-DD-NNN-module-feature.md

USAGE:
    ctoc plan <command> [options]

LIFECYCLE:
    functional/draft → functional/approved → implementation/draft →
    implementation/approved → todo (Iron Loop injected) → in_progress →
    review → done

COMMANDS:
    new <title> [module]    Create new functional plan in functional/draft/
    propose <id>            Submit for approval (draft → approved)
    approve <id>            Approve plan (for next stage)
    implement <id>          Create implementation plan from functional plan
    start <id>              Inject Iron Loop, move to todo/ (from impl/approved)
    claim <id>              Claim plan from todo/ (git-atomic)
    complete <id>           Move to review/ (from in_progress/)
    accept <id>             Accept and move to done/ (from review/)
    reject <id> [reason]    Return to functional/draft with feedback
    abandon <id>            Release plan back to todo/ (from in_progress/)
    move <id> <stage>       Move plan to any stage
    list [stage]            List plans (or filter by stage)
    status                  Show dashboard
    show <id>               Show plan details
    migrate                 Migrate from old .ctoc/plans structure

STAGES:
    functional/draft        New feature ideas being written
    functional/approved     Business-approved features
    implementation/draft    Technical design in progress
    implementation/approved Technical design approved
    todo                    Ready to work (Iron Loop injected)
    in_progress             Currently being worked on (claimed)
    review                  Awaiting final business review
    done                    Completed

CONCURRENCY:
    Multiple Claude instances can work on different plans safely.
    The 'claim' command uses git push as an atomic lock.
    If someone else claims a plan first, your push will fail.

EXAMPLES:
    ctoc plan new "User authentication" auth
    ctoc plan propose 2026-01-27-001
    ctoc plan approve 2026-01-27-001
    ctoc plan implement 2026-01-27-001
    ctoc plan start 2026-01-27-002
    ctoc plan claim 2026-01-27-002
    ctoc plan complete 2026-01-27-002
    ctoc plan accept 2026-01-27-002
    ctoc plan list todo
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
                echo "Usage: ctoc plan new <title> [module]"
                exit 1
            fi
            create_plan "$1" "${2:-general}"
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
        implement)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan implement <parent-plan-id>"
                exit 1
            fi
            implement_plan "$1"
            ;;
        start)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan start <plan-id>"
                exit 1
            fi
            start_plan "$1"
            ;;
        claim)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan claim <plan-id>"
                exit 1
            fi
            claim_plan "$1"
            ;;
        complete)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan complete <plan-id>"
                exit 1
            fi
            complete_plan "$1"
            ;;
        accept)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan accept <plan-id>"
                exit 1
            fi
            accept_plan "$1"
            ;;
        reject)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan reject <plan-id> [reason]"
                exit 1
            fi
            reject_plan "$1" "${2:-}"
            ;;
        abandon)
            if [[ $# -eq 0 ]]; then
                echo "Usage: ctoc plan abandon <plan-id>"
                exit 1
            fi
            abandon_plan "$1"
            ;;
        move|transition)
            if [[ $# -lt 2 ]]; then
                echo "Usage: ctoc plan move <plan-id> <stage>"
                echo "Stages: ${LIFECYCLE_FOLDERS[*]}"
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
        migrate)
            migrate_plans
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
