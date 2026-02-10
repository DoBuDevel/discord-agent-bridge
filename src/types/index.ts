/**
 * TypeScript type definitions
 */

export * from './interfaces.js';

export interface DiscordConfig {
  token: string;
  channelId?: string;
  guildId?: string;
}

export interface TmuxSession {
  name: string;
  attached: boolean;
  windows: number;
  created: Date;
}

export interface AgentMessage {
  type: 'tool-output' | 'agent-output' | 'error';
  content: string;
  timestamp: Date;
  sessionName?: string;
  agentName?: string;
}

export interface BridgeConfig {
  discord: DiscordConfig;
  tmux: {
    sessionPrefix: string;
    /**
     * Session naming strategy.
     * - 'per-project' (default): one tmux session per project (current behavior).
     * - 'shared': one shared tmux session, one window per project/agent.
     */
    sessionMode?: 'per-project' | 'shared';
    /**
     * Used when sessionMode === 'shared'. Name without prefix.
     * Full session name becomes `${sessionPrefix}${sharedSessionName}`.
     */
    sharedSessionName?: string;
  };
  hookServerPort?: number;
}

export interface ProjectAgents {
  [agentType: string]: boolean;
}

export interface ProjectState {
  projectName: string;
  projectPath: string;
  tmuxSession: string;
  /**
   * Optional mapping from agentType -> tmux window name.
   * If omitted, agentType is treated as the window name (legacy behavior).
   */
  tmuxWindows?: {
    [agentType: string]: string | undefined;
  };
  discordChannels: {
    [agentType: string]: string | undefined;
  };
  agents: ProjectAgents;
  createdAt: Date;
  lastActive: Date;
}

export type AgentType = string;
