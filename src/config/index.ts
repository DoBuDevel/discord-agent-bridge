/**
 * Configuration management
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import type { BridgeConfig } from '../types/index.js';
import type { IStorage, IEnvironment } from '../types/interfaces.js';
import { FileStorage } from '../infra/storage.js';
import { SystemEnvironment } from '../infra/environment.js';

export interface StoredConfig {
  token?: string;
  serverId?: string;
  hookServerPort?: number;
}

export class ConfigManager {
  private storage: IStorage;
  private env: IEnvironment;
  private configDir: string;
  private configFile: string;
  private _config?: BridgeConfig;
  private envLoaded = false;

  constructor(storage?: IStorage, env?: IEnvironment, configDir?: string) {
    this.storage = storage || new FileStorage();
    this.env = env || new SystemEnvironment();
    this.configDir = configDir || join(this.env.homedir(), '.discord-agent-bridge');
    this.configFile = join(this.configDir, 'config.json');
  }

  get config(): BridgeConfig {
    if (!this._config) {
      // Lazy load environment variables only once
      if (!this.envLoaded) {
        loadEnv();
        this.envLoaded = true;
      }

      const storedConfig = this.loadStoredConfig();

      // Merge: stored config > environment variables > defaults
      const sessionModeRaw = this.env.get('TMUX_SESSION_MODE');
      const sessionMode =
        sessionModeRaw === 'shared' || sessionModeRaw === 'per-project'
          ? sessionModeRaw
          : undefined;

      this._config = {
        discord: {
          token: storedConfig.token || this.env.get('DISCORD_BOT_TOKEN') || '',
          channelId: this.env.get('DISCORD_CHANNEL_ID'),
          guildId: storedConfig.serverId || this.env.get('DISCORD_GUILD_ID'),
        },
        tmux: {
          sessionPrefix: this.env.get('TMUX_SESSION_PREFIX') || 'agent-',
          sessionMode: sessionMode,
          sharedSessionName: this.env.get('TMUX_SHARED_SESSION_NAME') || 'bridge',
        },
        hookServerPort: storedConfig.hookServerPort ||
          (this.env.get('HOOK_SERVER_PORT') ? parseInt(this.env.get('HOOK_SERVER_PORT')!, 10) : 18470),
      };
    }
    return this._config;
  }

  loadStoredConfig(): StoredConfig {
    if (!this.storage.exists(this.configFile)) {
      return {};
    }
    try {
      const data = this.storage.readFile(this.configFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  saveConfig(updates: Partial<StoredConfig>): void {
    if (!this.storage.exists(this.configDir)) {
      this.storage.mkdirp(this.configDir);
    }
    const current = this.loadStoredConfig();
    const newConfig = { ...current, ...updates };
    this.storage.writeFile(this.configFile, JSON.stringify(newConfig, null, 2));
    this.storage.chmod(this.configFile, 0o600);

    // Invalidate cached config
    this._config = undefined;
  }

  getConfigValue<K extends keyof StoredConfig>(key: K): StoredConfig[K] {
    const stored = this.loadStoredConfig();
    return stored[key];
  }

  validateConfig(): void {
    if (!this.config.discord.token) {
      throw new Error(
        'Discord bot token not configured.\n' +
        'Run: agent-discord config --token <your-token>\n' +
        'Or set DISCORD_BOT_TOKEN environment variable'
      );
    }
  }

  getConfigPath(): string {
    return this.configFile;
  }

  resetConfig(): void {
    this._config = undefined;
    this.envLoaded = false;
  }
}

// Default instance for backward compatibility
const defaultConfigManager = new ConfigManager();

// Backward-compatible exports using Proxy for lazy initialization
export const config: BridgeConfig = new Proxy({} as BridgeConfig, {
  get(_target, prop) {
    return (defaultConfigManager.config as any)[prop];
  }
});

export function saveConfig(updates: Partial<StoredConfig>): void {
  defaultConfigManager.saveConfig(updates);
}

export function getConfigValue<K extends keyof StoredConfig>(key: K): StoredConfig[K] {
  return defaultConfigManager.getConfigValue(key);
}

export function validateConfig(): void {
  defaultConfigManager.validateConfig();
}

export function getConfigPath(): string {
  return defaultConfigManager.getConfigPath();
}
