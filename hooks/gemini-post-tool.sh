#!/usr/bin/env bash
# Gemini CLI PostToolUse hook
# Forwards tool outputs to Discord via the bridge HTTP server

set -euo pipefail

# Configuration
BRIDGE_PORT="${AGENT_DISCORD_PORT:-3847}"
PROJECT_NAME="${AGENT_DISCORD_PROJECT:-}"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Only forward if project is configured
if [[ -n "$PROJECT_NAME" ]]; then
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$HOOK_INPUT" \
    "http://127.0.0.1:${BRIDGE_PORT}/hook/${PROJECT_NAME}/gemini" \
    --max-time 2 \
    >/dev/null 2>&1 || true
fi

# Return success for Gemini CLI
cat << 'EOF'
{"decision": "approve"}
EOF
