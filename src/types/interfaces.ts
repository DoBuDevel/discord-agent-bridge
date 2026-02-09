/**
 * Dependency injection interfaces
 * Enables testability by abstracting external dependencies
 */

import type { ProjectState } from './index.js';

/**
 * Abstracts shell command execution (execSync)
 */
export interface ICommandExecutor {
  exec(command: string, options?: { encoding?: string; stdio?: any }): string;
  execVoid(command: string, options?: { stdio?: any }): void;
}

/**
 * Abstracts filesystem operations
 */
export interface IStorage {
  readFile(path: string, encoding: string): string;
  writeFile(path: string, data: string): void;
  chmod(path: string, mode: number): void;
  exists(path: string): boolean;
  mkdirp(path: string): void;
  unlink(path: string): void;
  openSync(path: string, flags: string): number;
}

/**
 * Abstracts environment variables and OS info
 */
export interface IEnvironment {
  get(key: string): string | undefined;
  homedir(): string;
  platform(): string;
}

/**
 * Abstracts state management
 */
export interface IStateManager {
  reload(): void;
  getProject(name: string): ProjectState | undefined;
  setProject(project: ProjectState): void;
  removeProject(name: string): void;
  listProjects(): ProjectState[];
  getGuildId(): string | undefined;
  setGuildId(id: string): void;
  updateLastActive(name: string): void;
  findProjectByChannel(channelId: string): ProjectState | undefined;
  getAgentTypeByChannel(channelId: string): string | undefined;
}

/**
 * Abstracts process management (spawn, TCP probing)
 */
export interface IProcessManager {
  spawn(
    command: string,
    args: string[],
    options: {
      detached?: boolean;
      stdio?: any;
      env?: Record<string, string | undefined>;
    }
  ): { pid?: number; unref(): void };
  createConnection(options: {
    port: number;
    host: string;
  }): { on(event: string, cb: (...args: any[]) => void): any; destroy(): void };
  kill(pid: number, signal: string): void;
}
