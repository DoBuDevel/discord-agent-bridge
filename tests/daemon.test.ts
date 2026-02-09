/**
 * Tests for DaemonManager class
 */

import { DaemonManager } from '../src/daemon.js';
import type { IStorage, IProcessManager } from '../src/types/interfaces.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(0),
}));

class MockStorage implements IStorage {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();

  readFile(path: string, _encoding: string): string {
    const content = this.files.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  writeFile(path: string, data: string): void {
    this.files.set(path, data);
  }

  chmod(_path: string, _mode: number): void {}

  exists(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  mkdirp(path: string): void {
    this.dirs.add(path);
  }

  unlink(path: string): void {
    this.files.delete(path);
  }

  openSync(_path: string, _flags: string): number {
    return 0;
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  setDir(path: string): void {
    this.dirs.add(path);
  }
}

function createMockProcessManager() {
  const mockChild = { pid: 12345, unref: vi.fn() };
  const mockConn = {
    on: vi.fn((event: string, cb: () => void) => {
      // Store callbacks for manual triggering
      (mockConn as any)[`_${event}`] = cb;
      return mockConn;
    }),
    destroy: vi.fn(),
  };

  return {
    spawn: vi.fn().mockReturnValue(mockChild),
    createConnection: vi.fn().mockReturnValue(mockConn),
    kill: vi.fn(),
    _mockChild: mockChild,
    _mockConn: mockConn,
  };
}

describe('DaemonManager', () => {
  it('getPort() returns configured port', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    expect(dm.getPort()).toBe(9999);
  });

  it('getPort() returns default port (18470) when not specified', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test');

    expect(dm.getPort()).toBe(18470);
  });

  it('getLogFile() returns correct path', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    expect(dm.getLogFile()).toBe('/test/daemon.log');
  });

  it('getPidFile() returns correct path', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    expect(dm.getPidFile()).toBe('/test/daemon.pid');
  });

  it('isRunning() returns true when connection succeeds', async () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const promise = dm.isRunning();

    // Trigger the connect callback
    pm._mockConn._connect();

    expect(await promise).toBe(true);
    expect(pm._mockConn.destroy).toHaveBeenCalled();
  });

  it('isRunning() returns false when connection errors', async () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const promise = dm.isRunning();

    // Trigger the error callback
    pm._mockConn._error();

    expect(await promise).toBe(false);
  });

  it('startDaemon() spawns process and writes PID file', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const pid = dm.startDaemon('/path/to/entry.js');

    expect(pid).toBe(12345);
    expect(pm.spawn).toHaveBeenCalled();
    expect(storage.exists('/test/daemon.pid')).toBe(true);
    expect(storage.readFile('/test/daemon.pid', 'utf-8')).toBe('12345');
  });

  it('startDaemon() throws when no PID assigned', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    pm._mockChild.pid = undefined;
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    expect(() => dm.startDaemon('/path/to/entry.js')).toThrow('Failed to start daemon: no PID assigned');
  });

  it('stopDaemon() reads PID, kills process, removes PID file', () => {
    const storage = new MockStorage();
    storage.setFile('/test/daemon.pid', '12345');
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const result = dm.stopDaemon();

    expect(result).toBe(true);
    expect(pm.kill).toHaveBeenCalledWith(-12345, 'SIGTERM');
    expect(storage.exists('/test/daemon.pid')).toBe(false);
  });

  it('stopDaemon() returns false when no PID file exists', () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const result = dm.stopDaemon();

    expect(result).toBe(false);
    expect(pm.kill).not.toHaveBeenCalled();
  });

  it('stopDaemon() returns false and cleans up PID file when kill fails', () => {
    const storage = new MockStorage();
    storage.setFile('/test/daemon.pid', '12345');
    const pm = createMockProcessManager();
    pm.kill.mockImplementation(() => {
      throw new Error('Process not found');
    });
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    const result = dm.stopDaemon();

    expect(result).toBe(false);
    expect(pm.kill).toHaveBeenCalled();
    expect(storage.exists('/test/daemon.pid')).toBe(false);
  });

  it('waitForReady() returns true when isRunning becomes true', async () => {
    const storage = new MockStorage();
    const pm = createMockProcessManager();
    const dm = new DaemonManager(storage, pm as any, '/test', 9999);

    // Mock isRunning to return true on second call
    let callCount = 0;
    vi.spyOn(dm, 'isRunning').mockImplementation(async () => {
      callCount++;
      return callCount > 1;
    });

    const result = await dm.waitForReady(1000);

    expect(result).toBe(true);
  });
});
