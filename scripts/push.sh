#!/bin/bash
# Auto-bump version and push
# Usage: ./scripts/push.sh [git push args]

set -e
cd "$(dirname "$0")/.."

# Get current version
CURRENT=$(cat VERSION)
IFS='.' read -r major minor patch <<< "$CURRENT"
NEW_VERSION="$major.$minor.$((patch + 1))"

# Update VERSION and sync JSON files
echo "$NEW_VERSION" > VERSION
node scripts/release.js

# Commit version bump
git add VERSION .claude-plugin/marketplace.json .claude-plugin/plugin.json
git commit -m "chore: bump version to $NEW_VERSION

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

echo "Bumped: $CURRENT → $NEW_VERSION"

# Push with any additional args
git push "$@"
