/**
 * Daemon manager for running bridge server in background
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DAEMON_DIR = join(homedir(), '.discord-agent-bridge');
const PID_FILE = join(DAEMON_DIR, 'bridge.pid');
const LOG_FILE = join(DAEMON_DIR, 'bridge.log');

export class DaemonManager {
  /**
   * Check if something is listening on the given port
   */
  static isRunning(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const conn = createConnection({ port, host: '127.0.0.1' });
      conn.on('connect', () => {
        conn.destroy();
        resolve(true);
      });
      conn.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Start the bridge server as a detached background process
   */
  static startDaemon(entryPoint: string): number {
    if (!existsSync(DAEMON_DIR)) {
      mkdirSync(DAEMON_DIR, { recursive: true });
    }

    const { openSync } = require('fs') as typeof import('fs');
    const out = openSync(LOG_FILE, 'a');
    const err = openSync(LOG_FILE, 'a');

    const child = spawn('node', [entryPoint], {
      detached: true,
      stdio: ['ignore', out, err],
      env: { ...process.env },
    });

    child.unref();

    const pid = child.pid!;
    writeFileSync(PID_FILE, String(pid));

    return pid;
  }

  /**
   * Stop the daemon by reading PID file and sending SIGTERM
   */
  static stopDaemon(): boolean {
    if (!existsSync(PID_FILE)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      unlinkSync(PID_FILE);
      return true;
    } catch {
      // Process might already be dead
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
      return false;
    }
  }

  /**
   * Wait for the daemon to start listening on a port
   */
  static async waitForReady(port: number, timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await DaemonManager.isRunning(port)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }

  static getLogFile(): string {
    return LOG_FILE;
  }

  static getPidFile(): string {
    return PID_FILE;
  }
}
