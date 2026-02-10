/**
 * tmux session management
 */

import type { TmuxSession } from '../types/index.js';
import type { ICommandExecutor } from '../types/interfaces.js';
import { ShellCommandExecutor } from '../infra/shell.js';
import { escapeShellArg } from '../infra/shell-escape.js';

export class TmuxManager {
  private sessionPrefix: string;
  private executor: ICommandExecutor;

  constructor(sessionPrefix: string = 'agent-', executor?: ICommandExecutor) {
    this.sessionPrefix = sessionPrefix;
    this.executor = executor || new ShellCommandExecutor();
  }

  listSessions(): TmuxSession[] {
    try {
      const output = this.executor.exec('tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}"');

      return output
        .trim()
        .split('\n')
        .filter((line) => line.startsWith(this.sessionPrefix))
        .map((line) => {
          const [name, attached, windows, created] = line.split('|');
          return {
            name,
            attached: attached === '1',
            windows: parseInt(windows, 10),
            created: new Date(parseInt(created, 10) * 1000),
          };
        });
    } catch (error) {
      // No sessions or tmux not running
      return [];
    }
  }

  createSession(name: string): void {
    const escapedName = escapeShellArg(`${this.sessionPrefix}${name}`);
    this.executor.exec(`tmux new-session -d -s ${escapedName}`);
  }

  sendKeys(sessionName: string, keys: string): void {
    const escapedTarget = escapeShellArg(`${this.sessionPrefix}${sessionName}`);
    const escapedKeys = escapeShellArg(keys);
    this.executor.exec(`tmux send-keys -t ${escapedTarget} ${escapedKeys}`);
    this.executor.exec(`tmux send-keys -t ${escapedTarget} Enter`);
  }

  capturePane(sessionName: string): string {
    const escapedTarget = escapeShellArg(`${this.sessionPrefix}${sessionName}`);
    return this.executor.exec(`tmux capture-pane -t ${escapedTarget} -p`);
  }

  sessionExists(name: string): boolean {
    try {
      const escapedTarget = escapeShellArg(`${this.sessionPrefix}${name}`);
      this.executor.execVoid(`tmux has-session -t ${escapedTarget}`, {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for an existing tmux session using the full session name.
   * Useful when session names are not derived from the prefix + projectName.
   */
  sessionExistsFull(fullSessionName: string): boolean {
    try {
      const escapedTarget = escapeShellArg(fullSessionName);
      this.executor.execVoid(`tmux has-session -t ${escapedTarget}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get existing session or create a new one
   * @returns Full session name with prefix
   */
  getOrCreateSession(projectName: string): string {
    const fullSessionName = `${this.sessionPrefix}${projectName}`;

    if (!this.sessionExists(projectName)) {
      try {
        this.createSession(projectName);
      } catch (error) {
        throw new Error(`Failed to create tmux session '${fullSessionName}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return fullSessionName;
  }

  /**
   * Create a new window within a session
   * @param sessionName Full session name (already includes prefix)
   */
  createWindow(sessionName: string, windowName: string): void {
    const escapedSession = escapeShellArg(sessionName);
    const escapedWindowName = escapeShellArg(windowName);

    try {
      this.executor.exec(`tmux new-window -t ${escapedSession} -n ${escapedWindowName}`);
    } catch (error) {
      throw new Error(`Failed to create window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all windows in a session
   * @param sessionName Full session name (already includes prefix)
   */
  listWindows(sessionName: string): string[] {
    try {
      const escapedSession = escapeShellArg(sessionName);
      const output = this.executor.exec(`tmux list-windows -t ${escapedSession} -F "#{window_name}"`);

      return output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
    } catch (error) {
      throw new Error(`Failed to list windows in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send keys to a specific window
   * @param sessionName Full session name (already includes prefix)
   */
  sendKeysToWindow(sessionName: string, windowName: string, keys: string): void {
    const target = `${sessionName}:${windowName}`;
    const escapedTarget = escapeShellArg(target);
    const escapedKeys = escapeShellArg(keys);

    try {
      // Send keys and Enter separately for reliability
      this.executor.exec(`tmux send-keys -t ${escapedTarget} ${escapedKeys}`);
      this.executor.exec(`tmux send-keys -t ${escapedTarget} Enter`);
    } catch (error) {
      throw new Error(`Failed to send keys to window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Type keys into a specific window without pressing Enter.
   * Useful when we want to control submission separately (e.g., Codex retries).
   */
  typeKeysToWindow(sessionName: string, windowName: string, keys: string): void {
    const target = `${sessionName}:${windowName}`;
    const escapedTarget = escapeShellArg(target);
    const escapedKeys = escapeShellArg(keys);

    try {
      this.executor.exec(`tmux send-keys -t ${escapedTarget} ${escapedKeys}`);
    } catch (error) {
      throw new Error(`Failed to type keys to window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send an Enter keypress to a specific window.
   * Useful for TUIs that may drop a submit when busy.
   */
  sendEnterToWindow(sessionName: string, windowName: string): void {
    const target = `${sessionName}:${windowName}`;
    const escapedTarget = escapeShellArg(target);
    try {
      this.executor.exec(`tmux send-keys -t ${escapedTarget} Enter`);
    } catch (error) {
      throw new Error(`Failed to send Enter to window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Capture pane output from a specific window
   * @param sessionName Full session name (already includes prefix)
   */
  capturePaneFromWindow(sessionName: string, windowName: string): string {
    const target = `${sessionName}:${windowName}`;
    const escapedTarget = escapeShellArg(target);

    try {
      return this.executor.exec(`tmux capture-pane -t ${escapedTarget} -p`);
    } catch (error) {
      throw new Error(`Failed to capture pane from window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Start an agent in a specific window
   */
  startAgentInWindow(sessionName: string, windowName: string, agentCommand: string): void {
    // Create window if it doesn't exist
    try {
      this.createWindow(sessionName, windowName);
    } catch (error) {
      // Window might already exist, which is fine
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('duplicate window')) {
        throw error;
      }
    }

    // Send the agent command to the window
    this.sendKeysToWindow(sessionName, windowName, agentCommand);
  }

  /**
   * Set an environment variable on a tmux session
   * New windows/processes in that session will inherit it
   */
  setSessionEnv(sessionName: string, key: string, value: string): void {
    const escapedSession = escapeShellArg(sessionName);
    const escapedKey = escapeShellArg(key);
    const escapedValue = escapeShellArg(value);

    try {
      this.executor.exec(`tmux set-environment -t ${escapedSession} ${escapedKey} ${escapedValue}`);
    } catch (error) {
      throw new Error(
        `Failed to set env ${key} on session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Kill a specific window within a session.
   */
  killWindow(sessionName: string, windowName: string): void {
    const target = `${sessionName}:${windowName}`;
    const escapedTarget = escapeShellArg(target);
    this.executor.execVoid(`tmux kill-window -t ${escapedTarget}`, { stdio: 'ignore' });
  }

  /**
   * @deprecated Use escapeShellArg() from src/infra/shell-escape.ts instead.
   */
}
