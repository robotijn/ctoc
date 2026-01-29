#!/bin/bash
# CTOC Kanban - Fast local display
# Usage: ./scripts/kanban.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

# Read version
VERSION=$(cat VERSION 2>/dev/null || echo "?.?.?")

# Count plans (fast file counts)
BACKLOG=$(ls -1 plans/functional/draft/*.md 2>/dev/null | wc -l | tr -d ' ')
FUNC=$(ls -1 plans/functional/approved/*.md 2>/dev/null | wc -l | tr -d ' ')
TECH=$(ls -1 plans/implementation/draft/*.md 2>/dev/null | wc -l | tr -d ' ')
READY=$(ls -1 plans/implementation/approved/*.md 2>/dev/null | wc -l | tr -d ' ')
BUILD=$(ls -1 plans/in_progress/*.md 2>/dev/null | wc -l | tr -d ' ')
REVIEW=$(ls -1 plans/review/*.md 2>/dev/null | wc -l | tr -d ' ')
DONE=$(ls -1 plans/done/*.md 2>/dev/null | wc -l | tr -d ' ')

# Recent commits (cached or quick)
CACHE=".ctoc/.kanban-cache"
if [[ -f "$CACHE" && $(($(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || echo 0))) -lt 300 ]]; then
    RECENT=$(cat "$CACHE")
else
    RECENT=$(git log --oneline -5 --format="%s" 2>/dev/null | grep -E "^(feat|fix):" | head -4)
    echo "$RECENT" > "$CACHE" 2>/dev/null
fi

# Output
cat << EOF
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC KANBAN                                                    v${VERSION}         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${BACKLOG})   │    (${FUNC})   │    (${TECH})   │   (${READY})   │   (${BUILD})   │   (${REVIEW})   │      (${DONE})       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  [1] New feature  [2] Continue  [3] Implement  [4] Review  [5] View all      ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
