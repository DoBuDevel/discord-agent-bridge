/**
 * Discord client setup and management
 */

import { Client, GatewayIntentBits, TextChannel, ChannelType } from 'discord.js';
import type { AgentMessage } from '../types/index.js';
import { agentRegistry, type AgentConfig } from '../agents/index.js';

type MessageCallback = (agentType: string, content: string, projectName: string, channelId: string) => void;

interface ChannelInfo {
  projectName: string;
  agentType: string;
}

export class DiscordClient {
  private client: Client;
  private token: string;
  private targetChannel?: TextChannel;
  private messageCallback?: MessageCallback;
  private channelMapping: Map<string, ChannelInfo> = new Map();

  constructor(token: string) {
    this.token = token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.scanExistingChannels();
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Only process text channels
      if (!message.channel.isTextBased()) return;

      const channelInfo = this.channelMapping.get(message.channelId);
      if (channelInfo && this.messageCallback) {
        this.messageCallback(channelInfo.agentType, message.content, channelInfo.projectName, message.channelId);
      }
    });
  }

  private scanExistingChannels(): void {
    this.client.guilds.cache.forEach((guild) => {
      guild.channels.cache.forEach((channel) => {
        if (channel.isTextBased() && channel.name) {
          const parsed = this.parseChannelName(channel.name);
          if (parsed) {
            this.channelMapping.set(channel.id, parsed);
            console.log(`Mapped channel ${channel.name} (${channel.id}) -> ${parsed.projectName}:${parsed.agentType}`);
          }
        }
      });
    });
  }

  private parseChannelName(channelName: string): ChannelInfo | null {
    // Use agent registry to parse channel names dynamically
    const result = agentRegistry.parseChannelName(channelName);
    if (result) {
      return {
        projectName: result.projectName,
        agentType: result.agent.config.name,
      };
    }
    return null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Discord login timed out after 30 seconds'));
      }, 30000);

      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.login(this.token).catch((error) => {
        clearTimeout(timeout);
        reject(new Error(`Discord login failed: ${error.message}`));
      });
    });
  }

  async setTargetChannel(channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }
    this.targetChannel = channel as TextChannel;
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    if (!this.targetChannel) {
      console.warn('No target channel set, skipping message');
      return;
    }

    const formatted = this.formatMessage(message);
    await this.targetChannel.send(formatted);
  }

  private formatMessage(message: AgentMessage): string {
    const emoji = this.getEmojiForType(message.type);
    const header = `${emoji} **${message.type}** ${message.agentName ? `(${message.agentName})` : ''}`;

    return `${header}\n\`\`\`\n${message.content}\n\`\`\``;
  }

  private getEmojiForType(type: AgentMessage['type']): string {
    switch (type) {
      case 'tool-output':
        return '🔧';
      case 'agent-output':
        return '🤖';
      case 'error':
        return '❌';
      default:
        return '📝';
    }
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  /**
   * Register a callback to handle incoming messages from Discord channels
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  /**
   * Create agent channels for a project in a guild
   * @param guildId - Discord guild ID
   * @param projectName - Project name
   * @param agentConfigs - Array of agent configurations to create channels for
   * @param customChannelName - Optional custom channel name (e.g., "Claude - 내 프로젝트")
   * @returns Object mapping agent names to channel IDs
   */
  async createAgentChannels(
    guildId: string,
    projectName: string,
    agentConfigs: AgentConfig[],
    customChannelName?: string
  ): Promise<{ [agentName: string]: string }> {
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }

    const result: { [agentName: string]: string } = {};

    for (const config of agentConfigs) {
      // Use custom channel name if provided, otherwise use default format
      const channelName = customChannelName || `${projectName}-${config.channelSuffix}`;

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: `${config.displayName} agent for ${projectName}`,
      });

      // Register in mapping
      this.channelMapping.set(channel.id, {
        projectName,
        agentType: config.name,
      });

      result[config.name] = channel.id;
      console.log(`  - ${config.displayName}: ${channel.name} (${channel.id})`);
    }

    console.log(`Created ${agentConfigs.length} channels for project ${projectName}`);
    return result;
  }

  /**
   * Get list of guilds the bot is in
   */
  getGuilds(): { id: string; name: string }[] {
    return this.client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  }

  /**
   * Get the current channel mapping
   */
  getChannelMapping(): Map<string, ChannelInfo> {
    return new Map(this.channelMapping);
  }

  /**
   * Send a message to a specific channel by ID
   */
  async sendToChannel(channelId: string, content: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        console.warn(`Channel ${channelId} is not a text channel`);
        return;
      }
      await (channel as TextChannel).send(content);
    } catch (error) {
      console.error(`Failed to send message to channel ${channelId}:`, error);
    }
  }
}
