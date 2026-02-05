/**
 * TypeScript type definitions
 */

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

export interface HookContext {
  toolName: string;
  output: string;
  exitCode?: number;
  hookSpecificOutput?: {
    additionalContext?: string;
  };
}

export interface BridgeConfig {
  discord: DiscordConfig;
  tmux: {
    sessionPrefix: string;
  };
  hookServerPort?: number;
}

export interface ProjectAgents {
  [agentType: string]: boolean;  // Dynamic agent support
}

export interface ProjectState {
  projectName: string;
  projectPath: string;
  tmuxSession: string;
  discordChannels: {
    [agentType: string]: string | undefined;  // agentType -> channelId
  };
  agents: ProjectAgents;
  createdAt: Date;
  lastActive: Date;
}

export type AgentType = string;
