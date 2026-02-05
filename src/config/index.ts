/**
 * Configuration management
 */

import { config as loadEnv } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { BridgeConfig } from '../types/index.js';

// Load environment variables as fallback
loadEnv();

const CONFIG_DIR = join(homedir(), '.discord-agent-bridge');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface StoredConfig {
  token?: string;
  serverId?: string;
  hookServerPort?: number;
}

/**
 * Load stored configuration from file
 */
function loadStoredConfig(): StoredConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(updates: Partial<StoredConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const current = loadStoredConfig();
  const newConfig = { ...current, ...updates };
  writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof StoredConfig>(key: K): StoredConfig[K] {
  const stored = loadStoredConfig();
  return stored[key];
}

// Load stored config
const storedConfig = loadStoredConfig();

// Merge: stored config > environment variables > defaults
export const config: BridgeConfig = {
  discord: {
    token: storedConfig.token || process.env.DISCORD_BOT_TOKEN || '',
    channelId: process.env.DISCORD_CHANNEL_ID,
    guildId: storedConfig.serverId || process.env.DISCORD_GUILD_ID,
  },
  tmux: {
    sessionPrefix: process.env.TMUX_SESSION_PREFIX || 'agent-',
  },
  hookServerPort: storedConfig.hookServerPort || (process.env.HOOK_SERVER_PORT ? parseInt(process.env.HOOK_SERVER_PORT, 10) : 3847),
};

export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error(
      'Discord bot token not configured.\n' +
      'Run: agent-discord config --token <your-token>\n' +
      'Or set DISCORD_BOT_TOKEN environment variable'
    );
  }
}

/**
 * Get config file path for display
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
