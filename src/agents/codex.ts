/**
 * OpenAI Codex CLI agent adapter
 * https://developers.openai.com/codex/cli/
 */

import { BaseAgentAdapter, HookData, AgentConfig } from './base.js';

const codexConfig: AgentConfig = {
  name: 'codex',
  displayName: 'Codex CLI',
  command: 'codex',
  hookEndpoint: 'codex',
  channelSuffix: 'codex',
};

export class CodexAdapter extends BaseAgentAdapter {
  constructor() {
    super(codexConfig);
  }

  formatHookOutput(hookData: HookData): string {
    const eventType = hookData.type || 'unknown';

    // Handle different Codex event types
    if (eventType === 'agent-turn-complete') {
      const lastMessage = hookData['last-assistant-message'] || hookData.lastAssistantMessage || '';
      const preview = lastMessage.length > 1800
        ? lastMessage.substring(0, 1800) + '\n... (truncated)'
        : lastMessage;

      return `🤖 **Codex Turn Complete**\n\`\`\`\n${preview}\n\`\`\``;
    }

    if (eventType === 'approval-requested') {
      return `⚠️ **Codex Approval Requested**\nCodex is waiting for user approval.`;
    }

    // Generic format for other events
    let output = hookData.output || hookData['last-assistant-message'] || JSON.stringify(hookData, null, 2);

    if (typeof output === 'object') {
      output = JSON.stringify(output, null, 2);
    }

    const maxLength = 1900;
    const truncatedOutput = output.length > maxLength
      ? output.substring(0, maxLength) + '\n... (truncated)'
      : output;

    return `🤖 **${eventType}** (Codex)\n\`\`\`\n${truncatedOutput}\n\`\`\``;
  }

  getHookScript(bridgePort: number): string {
    // Codex passes JSON as CLI argument, not stdin
    return `#!/usr/bin/env bash
# Codex CLI notify hook for discord-agent-bridge
# Codex passes JSON as command-line argument

BRIDGE_PORT="\${AGENT_DISCORD_PORT:-${bridgePort}}"
PROJECT_NAME="\${AGENT_DISCORD_PROJECT:-}"

# JSON is passed as first argument (not stdin)
HOOK_INPUT="\$1"

# Send to bridge if project is configured
if [[ -n "$PROJECT_NAME" ]] && [[ -n "$HOOK_INPUT" ]]; then
  curl -s -X POST \\
    -H "Content-Type: application/json" \\
    -d "$HOOK_INPUT" \\
    "http://127.0.0.1:\${BRIDGE_PORT}/hook/\${PROJECT_NAME}/codex" \\
    --max-time 2 >/dev/null 2>&1 || true
fi
`;
  }

  getHookInstallPath(): string {
    return '~/.codex/config.toml';
  }

  /**
   * Get the config.toml hook configuration for Codex
   * Note: Returns TOML format, not JSON
   */
  getSettingsConfig(hookScriptPath: string): object {
    // Return as object for display, but actual format is TOML
    return {
      _format: 'TOML',
      _example: `notify = ["${hookScriptPath}"]`,
      notify: [hookScriptPath],
    };
  }

  /**
   * Get TOML configuration string
   */
  getTomlConfig(hookScriptPath: string): string {
    return `# Discord Agent Bridge hook
notify = ["${hookScriptPath}"]`;
  }
}

export const codexAdapter = new CodexAdapter();
