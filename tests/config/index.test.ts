/**
 * Tests for ConfigManager
 */

import { ConfigManager, type StoredConfig } from '../../src/config/index.js';
import type { IStorage, IEnvironment } from '../../src/types/interfaces.js';

// Mock storage implementation for testing
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

  // Test helper
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }
}

// Mock environment implementation for testing
class MockEnvironment implements IEnvironment {
  private vars: Map<string, string> = new Map();

  get(key: string): string | undefined {
    return this.vars.get(key);
  }

  homedir(): string {
    return '/mock/home';
  }

  platform(): string {
    return 'linux';
  }

  // Test helper
  set(key: string, value: string): void {
    this.vars.set(key, value);
  }
}

describe('ConfigManager', () => {
  const configDir = '/test/config';
  const configFile = '/test/config/config.json';

  describe('initialization and defaults', () => {
    it('returns default config when no file and no env vars', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const manager = new ConfigManager(storage, env, configDir);

      const config = manager.config;

      expect(config.discord.token).toBe('');
      expect(config.discord.channelId).toBeUndefined();
      expect(config.discord.guildId).toBeUndefined();
      expect(config.tmux.sessionPrefix).toBe('agent-');
      expect(config.hookServerPort).toBe(18470);
    });

    it('loads token from stored config file', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const storedConfig: StoredConfig = {
        token: 'stored-token-123',
        serverId: 'stored-guild-456',
        hookServerPort: 9999,
      };
      storage.setFile(configFile, JSON.stringify(storedConfig));

      const manager = new ConfigManager(storage, env, configDir);
      const config = manager.config;

      expect(config.discord.token).toBe('stored-token-123');
      expect(config.discord.guildId).toBe('stored-guild-456');
      expect(config.hookServerPort).toBe(9999);
    });

    it('falls back to env var when no stored config', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      env.set('DISCORD_BOT_TOKEN', 'env-token-789');
      env.set('DISCORD_GUILD_ID', 'env-guild-abc');
      env.set('HOOK_SERVER_PORT', '7777');

      const manager = new ConfigManager(storage, env, configDir);
      const config = manager.config;

      expect(config.discord.token).toBe('env-token-789');
      expect(config.discord.guildId).toBe('env-guild-abc');
      expect(config.hookServerPort).toBe(7777);
    });

    it('stored config takes priority over env vars', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();

      // Set env vars
      env.set('DISCORD_BOT_TOKEN', 'env-token');
      env.set('DISCORD_GUILD_ID', 'env-guild');

      // Set stored config (should win)
      const storedConfig: StoredConfig = {
        token: 'stored-token-wins',
        serverId: 'stored-guild-wins',
      };
      storage.setFile(configFile, JSON.stringify(storedConfig));

      const manager = new ConfigManager(storage, env, configDir);
      const config = manager.config;

      expect(config.discord.token).toBe('stored-token-wins');
      expect(config.discord.guildId).toBe('stored-guild-wins');
    });
  });

  describe('config persistence', () => {
    it('saveConfig writes to storage and invalidates cache', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const manager = new ConfigManager(storage, env, configDir);

      // Initial config has no token
      expect(manager.config.discord.token).toBe('');

      // Save a new token
      manager.saveConfig({ token: 'new-saved-token' });

      // Config should be invalidated and reloaded with new token
      expect(manager.config.discord.token).toBe('new-saved-token');

      // Verify it was persisted
      const savedData = storage.readFile(configFile, 'utf-8');
      const savedConfig = JSON.parse(savedData);
      expect(savedConfig.token).toBe('new-saved-token');
    });

    it('getConfigValue reads specific key', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const storedConfig: StoredConfig = {
        token: 'my-token',
        serverId: 'my-server',
        hookServerPort: 8888,
      };
      storage.setFile(configFile, JSON.stringify(storedConfig));

      const manager = new ConfigManager(storage, env, configDir);

      expect(manager.getConfigValue('token')).toBe('my-token');
      expect(manager.getConfigValue('serverId')).toBe('my-server');
      expect(manager.getConfigValue('hookServerPort')).toBe(8888);
    });
  });

  describe('validation', () => {
    it('validateConfig throws when no token', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const manager = new ConfigManager(storage, env, configDir);

      expect(() => manager.validateConfig()).toThrow(/Discord bot token not configured/);
    });

    it('validateConfig passes when token exists', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      env.set('DISCORD_BOT_TOKEN', 'valid-token');

      const manager = new ConfigManager(storage, env, configDir);

      expect(() => manager.validateConfig()).not.toThrow();
    });
  });

  describe('utilities', () => {
    it('resetConfig clears cached config', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const manager = new ConfigManager(storage, env, configDir);

      // Access config to cache it
      expect(manager.config.discord.token).toBe('');

      // Set env var
      env.set('DISCORD_BOT_TOKEN', 'new-token-after-reset');

      // Without reset, cached config would still have empty token
      // With reset, it should re-read from env
      manager.resetConfig();

      expect(manager.config.discord.token).toBe('new-token-after-reset');
    });

    it('getConfigPath returns correct path', () => {
      const storage = new MockStorage();
      const env = new MockEnvironment();
      const manager = new ConfigManager(storage, env, configDir);

      expect(manager.getConfigPath()).toBe(configFile);
    });
  });
});
