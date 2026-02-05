/**
 * tmux command wrappers
 */

import { execSync } from 'child_process';

export class TmuxCommands {
  static exec(command: string): string {
    return execSync(command, { encoding: 'utf-8' });
  }

  static newSession(name: string, command?: string): void {
    const cmd = command ? `tmux new-session -d -s ${name} "${command}"` : `tmux new-session -d -s ${name}`;
    TmuxCommands.exec(cmd);
  }

  static killSession(name: string): void {
    TmuxCommands.exec(`tmux kill-session -t ${name}`);
  }

  static sendKeys(target: string, keys: string): void {
    TmuxCommands.exec(`tmux send-keys -t ${target} "${keys}" Enter`);
  }

  static capturePane(target: string, start?: number, end?: number): string {
    const range = start !== undefined && end !== undefined ? `-S ${start} -E ${end}` : '';
    return TmuxCommands.exec(`tmux capture-pane -t ${target} ${range} -p`);
  }

  static listPanes(target: string): string[] {
    const output = TmuxCommands.exec(`tmux list-panes -t ${target} -F "#{pane_id}"`);
    return output.trim().split('\n');
  }
}
