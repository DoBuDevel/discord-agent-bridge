import { describe, it, expect, beforeEach } from 'vitest';
import { TmuxManager } from '../../src/tmux/manager.js';
import type { ICommandExecutor } from '../../src/types/interfaces.js';

class MockExecutor implements ICommandExecutor {
  calls: { method: string; command: string }[] = [];
  nextResult: string = '';
  shouldThrow: Error | null = null;
  throwOnce: Error | null = null;

  exec(command: string): string {
    this.calls.push({ method: 'exec', command });

    if (this.throwOnce) {
      const error = this.throwOnce;
      this.throwOnce = null;
      throw error;
    }

    if (this.shouldThrow) {
      throw this.shouldThrow;
    }

    return this.nextResult;
  }

  execVoid(command: string, _options?: { stdio?: any }): void {
    this.calls.push({ method: 'execVoid', command });

    if (this.throwOnce) {
      const error = this.throwOnce;
      this.throwOnce = null;
      throw error;
    }

    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
  }

  reset(): void {
    this.calls = [];
    this.nextResult = '';
    this.shouldThrow = null;
    this.throwOnce = null;
  }

  getLastCommand(): string {
    return this.calls[this.calls.length - 1]?.command || '';
  }
}

describe('TmuxManager', () => {
  let executor: MockExecutor;
  let tmux: TmuxManager;

  beforeEach(() => {
    executor = new MockExecutor();
    tmux = new TmuxManager('agent-', executor);
  });

  describe('listSessions', () => {
    it('parses session output correctly', () => {
      executor.nextResult = 'agent-session1|1|3|1704067200\nagent-session2|0|1|1704070800';

      const sessions = tmux.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual({
        name: 'agent-session1',
        attached: true,
        windows: 3,
        created: new Date(1704067200 * 1000),
      });
      expect(sessions[1]).toEqual({
        name: 'agent-session2',
        attached: false,
        windows: 1,
        created: new Date(1704070800 * 1000),
      });
    });

    it('returns empty array when executor throws', () => {
      executor.shouldThrow = new Error('tmux not running');

      const sessions = tmux.listSessions();

      expect(sessions).toEqual([]);
    });

    it('filters by session prefix', () => {
      executor.nextResult = 'agent-session1|1|3|1704067200\nother-session|0|1|1704070800\nagent-session2|0|2|1704074400';

      const sessions = tmux.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].name).toBe('agent-session1');
      expect(sessions[1].name).toBe('agent-session2');
    });
  });

  describe('createSession', () => {
    it('executes correct tmux command with prefix', () => {
      tmux.createSession('test-session');

      const lastCommand = executor.getLastCommand();
      expect(lastCommand).toContain('tmux new-session -d -s');
      expect(lastCommand).toContain('agent-test-session');
    });

    it('escapes session name with single quotes', () => {
      tmux.createSession("test'session");

      const lastCommand = executor.getLastCommand();
      expect(lastCommand).toContain("'agent-test'\\''session'");
    });
  });

  describe('sessionExists', () => {
    it('returns true when execVoid succeeds', () => {
      const exists = tmux.sessionExists('test');

      expect(exists).toBe(true);
      expect(executor.calls[0].method).toBe('execVoid');
      expect(executor.getLastCommand()).toContain('tmux has-session -t');
    });

    it('returns false when execVoid throws', () => {
      executor.shouldThrow = new Error('session not found');

      const exists = tmux.sessionExists('test');

      expect(exists).toBe(false);
    });
  });

  describe('getOrCreateSession', () => {
    it('returns existing session name when exists', () => {
      // sessionExists will succeed (no throw)
      const sessionName = tmux.getOrCreateSession('existing');

      expect(sessionName).toBe('agent-existing');
      // Should only check existence, not create
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].method).toBe('execVoid');
    });

    it('creates session when doesn\'t exist', () => {
      // First call (sessionExists) throws, second call (createSession) succeeds
      executor.throwOnce = new Error('session not found');

      const sessionName = tmux.getOrCreateSession('new');

      expect(sessionName).toBe('agent-new');
      expect(executor.calls).toHaveLength(2);
      expect(executor.calls[0].method).toBe('execVoid'); // sessionExists check
      expect(executor.calls[1].method).toBe('exec'); // createSession
      expect(executor.calls[1].command).toContain('tmux new-session');
    });
  });

  describe('createWindow', () => {
    it('executes correct command with session and window name', () => {
      tmux.createWindow('agent-session', 'my-window');

      const lastCommand = executor.getLastCommand();
      expect(lastCommand).toContain("tmux new-window -t 'agent-session' -n");
      expect(lastCommand).toContain("'my-window'");
    });
  });

  describe('listWindows', () => {
    it('returns parsed window names', () => {
      executor.nextResult = 'window1\nwindow2\nwindow3\n';

      const windows = tmux.listWindows('agent-session');

      expect(windows).toEqual(['window1', 'window2', 'window3']);
      expect(executor.getLastCommand()).toContain("tmux list-windows -t 'agent-session'");
    });
  });

  describe('sendKeysToWindow', () => {
    it('sends keys then Enter as two separate commands', () => {
      tmux.sendKeysToWindow('agent-session', 'window1', 'echo hello');

      expect(executor.calls).toHaveLength(2);
      expect(executor.calls[0].command).toContain("tmux send-keys -t 'agent-session:window1'");
      expect(executor.calls[0].command).toContain('echo hello');
      expect(executor.calls[1].command).toContain("tmux send-keys -t 'agent-session:window1' Enter");
    });

    it('escapes keys with single quotes', () => {
      tmux.sendKeysToWindow('agent-session', 'window1', "echo 'test'");

      const firstCommand = executor.calls[0].command;
      expect(firstCommand).toContain("'echo '\\''test'\\'''");
    });
  });

  describe('typeKeysToWindow', () => {
    it('types keys without sending Enter', () => {
      tmux.typeKeysToWindow('agent-session', 'codex', 'hello');
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].command).toContain("tmux send-keys -t 'agent-session:codex'");
      expect(executor.calls[0].command).toContain('hello');
      expect(executor.calls[0].command).not.toContain(' Enter');
    });
  });

  describe('sendEnterToWindow', () => {
    it('sends Enter to the specified window', () => {
      tmux.sendEnterToWindow('agent-session', 'codex');
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].command).toContain("tmux send-keys -t 'agent-session:codex' Enter");
    });
  });

  describe('capturePaneFromWindow', () => {
    it('returns captured pane content', () => {
      executor.nextResult = 'pane output line 1\npane output line 2';

      const output = tmux.capturePaneFromWindow('agent-session', 'window1');

      expect(output).toBe('pane output line 1\npane output line 2');
      expect(executor.getLastCommand()).toContain("tmux capture-pane -t 'agent-session:window1' -p");
    });
  });

  describe('setSessionEnv', () => {
    it('executes set-environment command with escaped key/value', () => {
      tmux.setSessionEnv('agent-session', 'MY_VAR', 'my value');

      const lastCommand = executor.getLastCommand();
      expect(lastCommand).toContain("tmux set-environment -t 'agent-session'");
      expect(lastCommand).toContain("'MY_VAR'");
      expect(lastCommand).toContain("'my value'");
    });
  });

  describe('startAgentInWindow', () => {
    it('creates window then sends command', () => {
      tmux.startAgentInWindow('agent-session', 'agent-window', 'node agent.js');

      expect(executor.calls.length).toBeGreaterThanOrEqual(3);
      // First call: create window
      expect(executor.calls[0].command).toContain('tmux new-window');
      // Next calls: send keys
      expect(executor.calls[1].command).toContain('tmux send-keys');
      expect(executor.calls[1].command).toContain('node agent.js');
    });

    it('ignores duplicate window error', () => {
      executor.throwOnce = new Error('duplicate window: agent-window');

      // Should not throw
      expect(() => {
        tmux.startAgentInWindow('agent-session', 'agent-window', 'node agent.js');
      }).not.toThrow();

      // Should still send keys after ignoring the duplicate error
      expect(executor.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
