/**
 * Gemini CLI agent adapter
 */

import { BaseAgentAdapter, HookData, AgentConfig } from './base.js';

const geminiConfig: AgentConfig = {
  name: 'gemini',
  displayName: 'Gemini CLI',
  command: 'gemini',
  hookEndpoint: 'gemini',
  channelSuffix: 'gemini',
};

export class GeminiAdapter extends BaseAgentAdapter {
  constructor() {
    super(geminiConfig);
  }

  formatHookOutput(hookData: HookData): string {
    const toolName = hookData.tool_name || hookData.toolName || hookData.function_name || 'unknown';
    let output = hookData.tool_response || hookData.output || hookData.result || '';

    // Convert object to string if needed
    if (typeof output === 'object') {
      output = JSON.stringify(output, null, 2);
    }

    // Truncate long outputs
    const maxLength = 1800;
    const truncatedOutput = output.length > maxLength
      ? output.substring(0, maxLength) + '\n... (truncated)'
      : output;

    return `**Gemini** - 💎 ${toolName}\n\`\`\`\n${truncatedOutput}\n\`\`\``;
  }

  getHookScript(bridgePort: number): string {
    return `#!/usr/bin/env bash
# Gemini CLI PostToolUse hook for discord-agent-bridge
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
    "http://127.0.0.1:\${BRIDGE_PORT}/hook/\${PROJECT_NAME}/gemini" \\
    --max-time 2 >/dev/null 2>&1 || true
fi

# Return approval response (Gemini format)
echo '{"status": "ok"}'
`;
  }

  getHookInstallPath(): string {
    return '~/.gemini/settings.json';
  }

  /**
   * Get the settings.json hook configuration for Gemini
   */
  getSettingsConfig(hookScriptPath: string): object {
    return {
      hooks: {
        post_tool_use: [
          {
            command: hookScriptPath,
          },
        ],
      },
    };
  }
}

export const geminiAdapter = new GeminiAdapter();
