#!/bin/bash

set -e

# Resolve the directory containing this script and the entrypoint.d modules
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
ENTRYPOINT_D="$SCRIPT_DIR/entrypoint.d"

# Source all numbered setup scripts in order (00-utils, 10-network, ..., 70-banner)
# The glob [0-9]*.sh matches files like 00-utils.sh but excludes the 80-tools/ directory
for script in "$ENTRYPOINT_D"/[0-9]*.sh; do
    [ -f "$script" ] && source "$script"
done

# Build command based on TOOL environment variable
# This is more robust than relying on Cmd array which can be corrupted by bundling
# NVM is already sourced above, so we can exec tools directly
TOOL_SCRIPT="$ENTRYPOINT_D/80-tools/${TOOL:-shell}.sh"
if [ -f "$TOOL_SCRIPT" ]; then
    source "$TOOL_SCRIPT"
else
    # Fallback to passed arguments (for backwards compatibility)
    log "Unknown TOOL '$TOOL', falling back to args: $@"
    exec "$@"
fi
