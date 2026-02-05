#!/usr/bin/env bash
# Install Discord bridge hooks for AI Agent CLIs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔧 Installing Discord Agent Bridge hooks..."

# Make hook scripts executable
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true

# Claude Code
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [[ -d "$HOME/.claude" ]]; then
  echo "  📦 Found Claude Code"

  # Create settings if not exists
  if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
    echo '{}' > "$CLAUDE_SETTINGS"
  fi

  # Backup
  cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.bak.$(date +%s)"

  # Add hook using jq (correct format: matcher as string, not matchers array)
  HOOK_CMD="$SCRIPT_DIR/claude-post-tool.sh"
  jq --arg cmd "$HOOK_CMD" '
    .hooks.PostToolUse //= [] |
    if (.hooks.PostToolUse | map(select(.hooks[]?.command == $cmd)) | length) == 0 then
      .hooks.PostToolUse += [{
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": $cmd
        }]
      }]
    else
      .
    end
  ' "$CLAUDE_SETTINGS" > "$CLAUDE_SETTINGS.tmp" && mv "$CLAUDE_SETTINGS.tmp" "$CLAUDE_SETTINGS"

  echo "  ✅ Claude Code hook installed"
else
  echo "  ⏭️  Claude Code not found, skipping"
fi

# Gemini CLI
GEMINI_SETTINGS="$HOME/.gemini/settings.json"
if command -v gemini &>/dev/null || [[ -d "$HOME/.gemini" ]]; then
  echo "  📦 Found Gemini CLI"

  mkdir -p "$HOME/.gemini"
  if [[ ! -f "$GEMINI_SETTINGS" ]]; then
    echo '{}' > "$GEMINI_SETTINGS"
  fi

  cp "$GEMINI_SETTINGS" "$GEMINI_SETTINGS.bak.$(date +%s)"

  HOOK_CMD="$SCRIPT_DIR/gemini-post-tool.sh"
  jq --arg cmd "$HOOK_CMD" '
    .hooks.post_tool_use //= [] |
    if (.hooks.post_tool_use | map(select(.command == $cmd)) | length) == 0 then
      .hooks.post_tool_use += [{
        "command": $cmd
      }]
    else
      .
    end
  ' "$GEMINI_SETTINGS" > "$GEMINI_SETTINGS.tmp" && mv "$GEMINI_SETTINGS.tmp" "$GEMINI_SETTINGS"

  echo "  ✅ Gemini CLI hook installed"
else
  echo "  ⏭️  Gemini CLI not found, skipping"
fi

# Codex CLI (TOML format)
CODEX_CONFIG="$HOME/.codex/config.toml"
if command -v codex &>/dev/null || [[ -d "$HOME/.codex" ]]; then
  echo "  📦 Found Codex CLI"

  mkdir -p "$HOME/.codex"

  HOOK_CMD="$SCRIPT_DIR/codex-post-tool.sh"

  if [[ -f "$CODEX_CONFIG" ]]; then
    # Backup existing config
    cp "$CODEX_CONFIG" "$CODEX_CONFIG.bak.$(date +%s)"

    # Check if notify is already configured
    if grep -q "^notify" "$CODEX_CONFIG"; then
      echo "  ⚠️  Codex notify already configured. Manual update may be needed."
      echo "     Add to ~/.codex/config.toml:"
      echo "     notify = [\"$HOOK_CMD\"]"
    else
      # Append notify configuration
      echo "" >> "$CODEX_CONFIG"
      echo "# Discord Agent Bridge hook" >> "$CODEX_CONFIG"
      echo "notify = [\"$HOOK_CMD\"]" >> "$CODEX_CONFIG"
      echo "  ✅ Codex CLI hook installed"
    fi
  else
    # Create new config
    cat > "$CODEX_CONFIG" << EOF
# Codex CLI configuration
# https://developers.openai.com/codex/config-reference/

# Discord Agent Bridge hook
notify = ["$HOOK_CMD"]
EOF
    echo "  ✅ Codex CLI hook installed (new config created)"
  fi
else
  echo "  ⏭️  Codex CLI not found, skipping"
fi

echo ""
echo "✅ Hook installation complete!"
echo ""
echo "⚠️  Remember to restart any running agent CLI sessions"
echo "   for hooks to take effect."
echo ""
echo "📝 Don't forget to set environment variables in tmux:"
echo "   export AGENT_DISCORD_PROJECT=\"your-project-name\""
echo "   export AGENT_DISCORD_PORT=\"3847\""
