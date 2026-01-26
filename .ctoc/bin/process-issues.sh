#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Process Skill Improvement Issues
#  Fetches approved issues for Claude Code to process
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Default repo (can be overridden)
REPO="${CTOC_REPO:-theaiguys/ctoc}"
OUTPUT_FILE="${CTOC_ISSUES_FILE:-/tmp/ctoc-issues-to-process.json}"
LIMIT="${CTOC_ISSUE_LIMIT:-10}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for gh CLI
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is required but not installed.${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check gh auth
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub CLI.${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CTOC - Skill Improvement Issue Processor${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

# Fetch issues with 'ready-to-process' label
echo -e "${YELLOW}Fetching approved skill improvement issues from ${REPO}...${NC}"
echo ""

ISSUES=$(gh issue list --repo "$REPO" \
    --label "ready-to-process" \
    --label "skill-improvement" \
    --state open \
    --json number,title,body,author,labels,reactions,createdAt \
    --limit "$LIMIT" 2>/dev/null || echo "[]")

# Count issues
ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')

if [ "$ISSUE_COUNT" -eq 0 ]; then
    echo -e "${GREEN}No issues ready to process.${NC}"
    echo ""
    echo "Issues need:"
    echo "  1. 'skill-improvement' label"
    echo "  2. 'ready-to-process' label (added after 5+ community votes)"
    echo "  3. To be in 'open' state"
    echo ""
    echo -e "Check pending issues: ${BLUE}gh issue list --repo $REPO --label skill-improvement${NC}"
    exit 0
fi

echo -e "${GREEN}Found ${ISSUE_COUNT} issue(s) ready to process:${NC}"
echo ""

# Display issues
echo "$ISSUES" | jq -r '.[] | "  #\(.number): \(.title)"'
echo ""

# Also show vote counts
echo -e "${YELLOW}Vote counts:${NC}"
echo "$ISSUES" | jq -r '.[] | "  #\(.number): \(.reactions["+1"] // 0) votes"'
echo ""

# Save to file for Claude Code
echo "$ISSUES" > "$OUTPUT_FILE"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Issue data saved to: ${OUTPUT_FILE}${NC}"
echo ""
echo "Claude Code should now:"
echo ""
echo "  1. Read the issues file"
echo "  2. For each issue:"
echo "     a. Parse the skill name and improvement details"
echo "     b. Read the current skill file"
echo "     c. Research current best practices"
echo "     d. Update the skill file"
echo "     e. Commit with message: 'skill: update {name} (fixes #{issue})'"
echo "  3. Create PR(s) for the changes"
echo "  4. Comment on issues linking to the PR"
echo ""
echo -e "${YELLOW}Tip: Review the issues above before processing to skip any suspicious ones.${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
