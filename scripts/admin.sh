#!/bin/bash
# CTOC Admin Dashboard - Fast local display with numbered kanban items
# Usage: ./scripts/admin.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

# Read version
VERSION=$(cat VERSION 2>/dev/null || echo "?.?.?")

# Count plans
BACKLOG=$(ls -1 plans/functional/draft/*.md 2>/dev/null | wc -l | tr -d ' ')
FUNC=$(ls -1 plans/functional/approved/*.md 2>/dev/null | wc -l | tr -d ' ')
TECH=$(ls -1 plans/implementation/draft/*.md 2>/dev/null | wc -l | tr -d ' ')
READY=$(ls -1 plans/implementation/approved/*.md 2>/dev/null | wc -l | tr -d ' ')
BUILD=$(ls -1 plans/in_progress/*.md 2>/dev/null | wc -l | tr -d ' ')
REVIEW=$(ls -1 plans/review/*.md 2>/dev/null | wc -l | tr -d ' ')
DONE=$(ls -1 plans/done/*.md 2>/dev/null | wc -l | tr -d ' ')
TOTAL=$((BACKLOG + FUNC + TECH + READY + BUILD + REVIEW + DONE))

# Queue status (fast node call)
QUEUE=$(node -e "const q=require('./scripts/lib/commit-queue');const s=q.getQueueStatus();console.log(s.pending+'|'+s.processing+'|'+s.isLocked)" 2>/dev/null || echo "0|0|false")
Q_PEND=$(echo "$QUEUE" | cut -d'|' -f1)
Q_PROC=$(echo "$QUEUE" | cut -d'|' -f2)
Q_LOCK=$(echo "$QUEUE" | cut -d'|' -f3)
[[ "$Q_LOCK" == "true" ]] && LOCK_STATUS="LOCKED" || LOCK_STATUS="idle"

# Git status (cached)
CACHE=".ctoc/.admin-cache"
if [[ -f "$CACHE" && $(($(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || echo 0))) -lt 60 ]]; then
    source "$CACHE"
else
    MODIFIED=$(git status --short | grep -c "^ M\| M" || echo 0)
    UNTRACKED=$(git status --short | grep -c "^??" || echo 0)
    COMMITS=$(git log --oneline -3 --format="%h %s" 2>/dev/null | head -3)
    echo "MODIFIED=$MODIFIED" > "$CACHE"
    echo "UNTRACKED=$UNTRACKED" >> "$CACHE"
    echo "COMMITS='$COMMITS'" >> "$CACHE"
fi

# Build numbered items list
NUM=1
LEGEND=""

# Helper to add items from directory
add_items() {
    local dir="$1"
    local label="$2"
    local files=$(ls -1 "$dir"/*.md 2>/dev/null)
    if [[ -n "$files" ]]; then
        for f in $files; do
            # Extract name: 2026-01-29-001-name -> name, 2026-01-29-name -> name
            name=$(basename "$f" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-([0-9]+-)?//')
            LEGEND="${LEGEND}  [$NUM] $label: ${name:0:25}\n"
            NUM=$((NUM + 1))
        done
    fi
}

add_items "plans/functional/draft" "Backlog"
add_items "plans/functional/approved" "Functional"
add_items "plans/implementation/draft" "Technical"
add_items "plans/implementation/approved" "Ready"
add_items "plans/in_progress" "Building"
add_items "plans/review" "Review"
add_items "plans/done" "Done"

cat << EOF
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC ADMIN                                                       v${VERSION}       ║
╠═════════╤══════════╤══════════╤═════════╤═════════╤═════════╤════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   ($(printf "%2d" $BACKLOG))  │   ($(printf "%2d" $FUNC))   │   ($(printf "%2d" $TECH))   │  ($(printf "%2d" $READY))   │  ($(printf "%2d" $BUILD))   │  ($(printf "%2d" $REVIEW))   │     ($(printf "%2d" $DONE))       ║
╚═════════╧══════════╧══════════╧═════════╧═════════╧═════════╧════════════════╝

Legend (${TOTAL} items):
$(echo -e "$LEGEND" | head -15)

Queue: ${LOCK_STATUS} | pending: ${Q_PEND} | processing: ${Q_PROC}
Git: ${MODIFIED} modified, ${UNTRACKED} untracked

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #
  [C] Commit         [P] Push              [Q] Queue status
EOF
