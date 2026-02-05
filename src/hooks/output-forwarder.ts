/**
 * Hook script for forwarding Claude Code output to Discord
 */

import type { HookContext, AgentMessage } from '../types/index.js';

export class OutputForwarder {
  async processHookOutput(context: HookContext): Promise<AgentMessage> {
    return {
      type: 'tool-output',
      content: this.extractContent(context),
      timestamp: new Date(),
      agentName: this.extractAgentName(context),
    };
  }

  private extractContent(context: HookContext): string {
    // Try hook-specific output first
    if (context.hookSpecificOutput?.additionalContext) {
      return context.hookSpecificOutput.additionalContext;
    }

    // Fallback to standard output
    return context.output || 'No output';
  }

  private extractAgentName(context: HookContext): string | undefined {
    // Extract agent name from tool name or context
    // This can be enhanced based on actual hook output format
    return context.toolName;
  }

  formatForDiscord(message: AgentMessage): string {
    const lines = [
      `[${message.timestamp.toISOString()}]`,
      `Type: ${message.type}`,
    ];

    if (message.agentName) {
      lines.push(`Agent: ${message.agentName}`);
    }

    lines.push('', message.content);

    return lines.join('\n');
  }
}
