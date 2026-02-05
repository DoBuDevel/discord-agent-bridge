/**
 * tmux session management
 */

import { execSync } from 'child_process';
import type { TmuxSession } from '../types/index.js';

export class TmuxManager {
  private sessionPrefix: string;

  constructor(sessionPrefix: string = 'agent-') {
    this.sessionPrefix = sessionPrefix;
  }

  listSessions(): TmuxSession[] {
    try {
      const output = execSync('tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}"', {
        encoding: 'utf-8',
      });

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
    execSync(`tmux new-session -d -s ${this.sessionPrefix}${name}`);
  }

  sendKeys(sessionName: string, keys: string): void {
    execSync(`tmux send-keys -t ${this.sessionPrefix}${sessionName} "${keys}" Enter`);
  }

  capturePane(sessionName: string): string {
    return execSync(`tmux capture-pane -t ${this.sessionPrefix}${sessionName} -p`, {
      encoding: 'utf-8',
    });
  }

  sessionExists(name: string): boolean {
    try {
      execSync(`tmux has-session -t ${this.sessionPrefix}${name}`, {
        stdio: 'ignore',
      });
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
    const escapedWindowName = this.escapeShellArg(windowName);

    try {
      execSync(`tmux new-window -t ${sessionName} -n ${escapedWindowName}`, {
        encoding: 'utf-8',
      });
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
      const output = execSync(`tmux list-windows -t ${sessionName} -F "#{window_name}"`, {
        encoding: 'utf-8',
      });

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
    const escapedKeys = this.escapeShellArg(keys);

    try {
      // Send keys and Enter separately for reliability
      execSync(`tmux send-keys -t ${target} ${escapedKeys}`, {
        encoding: 'utf-8',
      });
      execSync(`tmux send-keys -t ${target} Enter`, {
        encoding: 'utf-8',
      });
    } catch (error) {
      throw new Error(`Failed to send keys to window '${windowName}' in session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Capture pane output from a specific window
   * @param sessionName Full session name (already includes prefix)
   */
  capturePaneFromWindow(sessionName: string, windowName: string): string {
    const target = `${sessionName}:${windowName}`;

    try {
      return execSync(`tmux capture-pane -t ${target} -p`, {
        encoding: 'utf-8',
      });
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
    const escapedKey = this.escapeShellArg(key);
    const escapedValue = this.escapeShellArg(value);

    try {
      execSync(`tmux set-environment -t ${sessionName} ${escapedKey} ${escapedValue}`, {
        encoding: 'utf-8',
      });
    } catch (error) {
      throw new Error(
        `Failed to set env ${key} on session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Escape shell arguments to prevent injection
   */
  private escapeShellArg(arg: string): string {
    // Use single quotes and escape any single quotes in the argument
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}
