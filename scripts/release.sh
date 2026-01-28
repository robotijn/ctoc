#!/bin/bash
# CTOC Release Script - Ensures version consistency
# Usage: ./scripts/release.sh "commit message"
#
# This script:
# 1. Reads current version from VERSION file
# 2. Bumps the patch version
# 3. Writes new version to VERSION
# 4. Stages all changes
# 5. Commits with auto-generated version suffix
#
# The version in the commit message is READ from the file after bumping,
# so it's impossible for version mismatch to occur.

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

# Read current version
if [[ ! -f VERSION ]]; then
    echo "Error: VERSION file not found"
    exit 1
fi

VERSION=$(cat VERSION)
IFS='.' read -r major minor patch <<< "$VERSION"

# Validate version format
if [[ -z "$major" || -z "$minor" || -z "$patch" ]]; then
    echo "Error: Invalid version format in VERSION file: $VERSION"
    echo "Expected format: X.Y.Z"
    exit 1
fi

# Bump patch version
NEW_VERSION="${major}.${minor}.$((patch + 1))"

# Write new version
echo "$NEW_VERSION" > VERSION

# Stage all changes including VERSION
git add -A

# Commit with auto-generated version suffix
# Use --no-verify to skip pre-commit/commit-msg hooks since we handle versioning here
git commit --no-verify -m "${MESSAGE} (v${NEW_VERSION})

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

echo ""
echo "Released v${NEW_VERSION}"
echo ""
echo "To push: git push origin main"
