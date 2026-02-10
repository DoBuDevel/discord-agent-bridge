/**
 * Project state management
 * Tracks active projects, their Discord channels, and tmux sessions
 */

import { join } from 'path';
import { homedir } from 'os';
import type { IStorage, IStateManager } from '../types/interfaces.js';
import { FileStorage } from '../infra/storage.js';

export interface ProjectState {
  projectName: string;
  projectPath: string;
  tmuxSession: string;
  tmuxWindows?: {
    [agentType: string]: string | undefined;  // agentType -> window name (optional, legacy default is agentType)
  };
  discordChannels: {
    [agentType: string]: string | undefined;  // agentType -> channel ID
  };
  agents: {
    [agentType: string]: boolean;  // agentType -> enabled
  };
  createdAt: Date;
  lastActive: Date;
}

export interface BridgeState {
  projects: Record<string, ProjectState>;
  guildId?: string;
}


export class StateManager implements IStateManager {
  private state: BridgeState;
  private storage: IStorage;
  private stateDir: string;
  private stateFile: string;

  constructor(storage?: IStorage, stateDir?: string, stateFile?: string) {
    this.storage = storage || new FileStorage();
    this.stateDir = stateDir || join(homedir(), '.discord-agent-bridge');
    this.stateFile = stateFile || join(this.stateDir, 'state.json');
    this.state = this.loadState();
  }

  private loadState(): BridgeState {
    if (!this.storage.exists(this.stateFile)) {
      return { projects: {} };
    }
    try {
      const data = this.storage.readFile(this.stateFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { projects: {} };
    }
  }

  private saveState(): void {
    if (!this.storage.exists(this.stateDir)) {
      this.storage.mkdirp(this.stateDir);
    }
    this.storage.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  reload(): void {
    this.state = this.loadState();
  }

  getProject(projectName: string): ProjectState | undefined {
    return this.state.projects[projectName];
  }

  setProject(project: ProjectState): void {
    this.state.projects[project.projectName] = project;
    this.saveState();
  }

  removeProject(projectName: string): void {
    delete this.state.projects[projectName];
    this.saveState();
  }

  listProjects(): ProjectState[] {
    return Object.values(this.state.projects);
  }

  getGuildId(): string | undefined {
    return this.state.guildId;
  }

  setGuildId(guildId: string): void {
    this.state.guildId = guildId;
    this.saveState();
  }

  updateLastActive(projectName: string): void {
    if (this.state.projects[projectName]) {
      this.state.projects[projectName].lastActive = new Date();
      this.saveState();
    }
  }

  findProjectByChannel(channelId: string): ProjectState | undefined {
    return Object.values(this.state.projects).find(
      p => Object.values(p.discordChannels).includes(channelId)
    );
  }

  getAgentTypeByChannel(channelId: string): string | undefined {
    for (const project of Object.values(this.state.projects)) {
      for (const [agentType, chId] of Object.entries(project.discordChannels)) {
        if (chId === channelId) {
          return agentType;
        }
      }
    }
    return undefined;
  }
}

export const stateManager = new StateManager();
