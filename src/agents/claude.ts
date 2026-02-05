/**
 * Claude Code agent adapter
 */

import { BaseAgentAdapter, HookData, AgentConfig } from './base.js';

const claudeConfig: AgentConfig = {
  name: 'claude',
  displayName: 'Claude Code',
  command: 'claude',
  hookEndpoint: 'claude',
  channelSuffix: 'claude',
};

export class ClaudeAdapter extends BaseAgentAdapter {
  constructor() {
    super(claudeConfig);
  }

  formatHookOutput(hookData: HookData): string {
    const toolName = hookData.tool_name || hookData.toolName || 'unknown';
    let output = hookData.tool_response || hookData.output || '';

    // Convert object to string if needed
    if (typeof output === 'object') {
      output = JSON.stringify(output, null, 2);
    }

    // Truncate long outputs
    const maxLength = 1800;
    const truncatedOutput = output.length > maxLength
      ? output.substring(0, maxLength) + '\n... (truncated)'
      : output;

    return `**Claude** - 🔧 ${toolName}\n\`\`\`\n${truncatedOutput}\n\`\`\``;
  }

  getHookScript(bridgePort: number): string {
    return `#!/usr/bin/env bash
# Claude Code PostToolUse hook for discord-agent-bridge
# This script sends tool outputs to the bridge server

BRIDGE_PORT="\${AGENT_DISCORD_PORT:-${bridgePort}}"
PROJECT_NAME="\${AGENT_DISCORD_PROJECT:-}"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Send to bridge if project is configured
if [[ -n "$PROJECT_NAME" ]]; then
  curl -s -X POST \\
    -H "Content-Type: application/json" \\
    -d "$HOOK_INPUT" \\
    "http://127.0.0.1:\${BRIDGE_PORT}/hook/\${PROJECT_NAME}/claude" \\
    --max-time 2 >/dev/null 2>&1 || true
fi

# Return approval response
cat << 'EOF'
{"decision": "approve", "reason": "Hook processed"}
EOF
`;
  }

  getHookInstallPath(): string {
    return '~/.claude/settings.json';
  }

  /**
   * Get the settings.json hook configuration
   */
  getSettingsConfig(hookScriptPath: string): object {
    return {
      hooks: {
        PostToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: hookScriptPath,
              },
            ],
          },
        ],
      },
    };
  }
}

export const claudeAdapter = new ClaudeAdapter();
