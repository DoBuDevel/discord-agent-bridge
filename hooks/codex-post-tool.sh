#!/usr/bin/env bash
# Codex CLI notify hook for discord-agent-bridge
# Codex passes JSON as command-line argument (not stdin)
# Config: ~/.codex/config.toml
#   notify = ["/path/to/codex-post-tool.sh"]

BRIDGE_PORT="${AGENT_DISCORD_PORT:-3847}"
PROJECT_NAME="${AGENT_DISCORD_PROJECT:-}"

# JSON is passed as first argument (not stdin like Claude/Gemini)
HOOK_INPUT="$1"

# Debug logging (comment out in production)
# echo "[codex-hook] Received: $HOOK_INPUT" >> /tmp/codex-hook.log

# Send to bridge if project is configured
if [[ -n "$PROJECT_NAME" ]] && [[ -n "$HOOK_INPUT" ]]; then
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$HOOK_INPUT" \
    "http://127.0.0.1:${BRIDGE_PORT}/hook/${PROJECT_NAME}/codex" \
    --max-time 2 >/dev/null 2>&1 || true
fi
