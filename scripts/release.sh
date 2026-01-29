#!/bin/bash
# CTOC Release Script - Sequential Commit Queue
# Usage: ./scripts/release.sh "commit message"
#
# This script uses the commit queue for sequential version bumping,
# preventing race conditions when multiple agents commit in parallel.
#
# The script:
# 1. Acquires an exclusive lock
# 2. Bumps the patch version atomically
# 3. Stages all changes
# 4. Commits with auto-generated version suffix
# 5. Releases the lock

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTOC_ROOT="$(dirname "$SCRIPT_DIR")"

MESSAGE="${1:-}"
if [[ -z "$MESSAGE" ]]; then
    echo "Usage: ./scripts/release.sh \"commit message\""
    echo ""
    echo "Examples:"
    echo "  ./scripts/release.sh \"feat: add startup banner\""
    echo "  ./scripts/release.sh \"fix: resolve hook timing issue\""
    exit 1
fi

cd "$CTOC_ROOT"

# Use Node.js commit queue for atomic operations
RESULT=$(node -e "
const queue = require('./scripts/lib/commit-queue.js');
const result = queue.directCommit('$MESSAGE');
if (result.success) {
    console.log('SUCCESS:' + result.version + ':' + (result.previousVersion || ''));
} else {
    console.error('ERROR:' + result.error);
    process.exit(1);
}
")

# Parse result
if [[ "$RESULT" == SUCCESS:* ]]; then
    VERSION=$(echo "$RESULT" | cut -d: -f2)
    PREV_VERSION=$(echo "$RESULT" | cut -d: -f3)

    echo ""
    echo "Released v${VERSION}"
    if [[ -n "$PREV_VERSION" ]]; then
        echo "  (bumped from v${PREV_VERSION})"
    fi
    echo ""
    echo "To push: git push origin main"
else
    echo "Release failed: $RESULT"
    exit 1
fi
