#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Update Checker
#  Checks for updates once per day
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/../VERSION"
LAST_CHECK_FILE="$HOME/.ctoc-last-update-check"
REPO="${CTOC_REPO:-theaiguys/ctoc}"
BRANCH="${CTOC_BRANCH:-main}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

get_local_version() {
    if [[ -f "$VERSION_FILE" ]]; then
        cat "$VERSION_FILE" | tr -d '[:space:]'
    elif [[ -f "$SCRIPT_DIR/../../VERSION" ]]; then
        cat "$SCRIPT_DIR/../../VERSION" | tr -d '[:space:]'
    else
        echo "0.0.0"
    fi
}

get_remote_version() {
    local url="https://raw.githubusercontent.com/${REPO}/${BRANCH}/VERSION"
    curl -sf --connect-timeout 5 "$url" 2>/dev/null | tr -d '[:space:]' || echo ""
}

version_gt() {
    # Returns 0 if $1 > $2
    local v1="$1"
    local v2="$2"

    # Split versions into components
    IFS='.' read -ra V1_PARTS <<< "$v1"
    IFS='.' read -ra V2_PARTS <<< "$v2"

    for i in 0 1 2; do
        local p1="${V1_PARTS[$i]:-0}"
        local p2="${V2_PARTS[$i]:-0}"

        if (( p1 > p2 )); then
            return 0
        elif (( p1 < p2 )); then
            return 1
        fi
    done

    return 1  # Equal, not greater
}

should_check() {
    # Check if we should run the update check (once per day)
    if [[ ! -f "$LAST_CHECK_FILE" ]]; then
        return 0
    fi

    local last_check
    last_check=$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo "0")
    local now
    now=$(date +%s)
    local diff=$((now - last_check))

    # 86400 seconds = 24 hours
    if (( diff > 86400 )); then
        return 0
    fi

    return 1
}

update_last_check() {
    date +%s > "$LAST_CHECK_FILE"
}

prompt_update() {
    local remote_version="$1"
    local local_version="$2"

    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║               CTOC Update Available!                           ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Current version: ${YELLOW}$local_version${NC}"
    echo -e "  New version:     ${GREEN}$remote_version${NC}"
    echo ""

    # Check if we're in interactive mode
    if [[ -t 0 ]]; then
        read -rp "  Would you like to update now? [y/N] " response
        case "$response" in
            [yY]|[yY][eE][sS])
                echo ""
                echo -e "${GREEN}Starting update...${NC}"
                run_update
                ;;
            *)
                echo ""
                echo "  Skipping update. Run 'ctoc update' later to update."
                ;;
        esac
    else
        echo "  Run 'ctoc update' to install the new version."
    fi
    echo ""
}

run_update() {
    local install_url="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh"

    if command -v bash &>/dev/null; then
        curl -fsSL "$install_url" | bash
    else
        echo "Error: bash is required to run the installer"
        exit 1
    fi
}

check_for_updates() {
    # Skip if CTOC_SKIP_UPDATE_CHECK is set
    if [[ -n "${CTOC_SKIP_UPDATE_CHECK:-}" ]]; then
        return 0
    fi

    # Skip if not time for check
    if ! should_check; then
        return 0
    fi

    # Update timestamp
    update_last_check

    local local_version
    local_version=$(get_local_version)

    local remote_version
    remote_version=$(get_remote_version)

    if [[ -z "$remote_version" ]]; then
        # Couldn't reach GitHub, skip silently
        return 0
    fi

    if version_gt "$remote_version" "$local_version"; then
        prompt_update "$remote_version" "$local_version"
    fi
}

# Main - run check unless sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_for_updates
fi
