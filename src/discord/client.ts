/**
 * Discord client setup and management
 */

import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import type { AgentMessage } from '../types/index.js';
import { agentRegistry as defaultAgentRegistry, type AgentConfig, type AgentRegistry } from '../agents/index.js';

type MessageCallback = (agentType: string, content: string, projectName: string, channelId: string) => void | Promise<void>;

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
  private registry: AgentRegistry;

  constructor(token: string, registry?: AgentRegistry) {
    this.token = token;
    this.registry = registry || defaultAgentRegistry;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('clientReady', () => {
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
        try {
          await this.messageCallback(channelInfo.agentType, message.content, channelInfo.projectName, message.channelId);
        } catch (error) {
          console.error(
            `Discord message handler error [${channelInfo.projectName}/${channelInfo.agentType}] channel=${message.channelId}:`,
            error
          );
        }
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
    const result = this.registry.parseChannelName(channelName);
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

      this.client.once('clientReady', () => {
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

  /**
   * Send a tool approval request to a channel and wait for user reaction
   * @returns true if approved, false if denied
   */
  async sendApprovalRequest(
    channelId: string,
    toolName: string,
    toolInput: any,
    timeoutMs: number = 120000
  ): Promise<boolean> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      console.warn(`Channel ${channelId} is not a text channel, auto-denying`);
      return false;
    }

    const textChannel = channel as TextChannel;

    // Format the approval message
    let inputPreview = '';
    if (toolInput) {
      const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2);
      inputPreview = inputStr.length > 500 ? inputStr.substring(0, 500) + '...' : inputStr;
    }

    const message = await textChannel.send(
      `🔒 **Permission Request**\n` +
      `Tool: \`${toolName}\`\n` +
      `\`\`\`\n${inputPreview}\n\`\`\`\n` +
      `React ✅ to allow, ❌ to deny (${Math.round(timeoutMs / 1000)}s timeout, auto-deny on timeout)`
    );

    await message.react('✅');
    await message.react('❌');

    try {
      const collected = await message.awaitReactions({
        filter: (reaction, user) =>
          ['✅', '❌'].includes(reaction.emoji.name || '') && !user.bot,
        max: 1,
        time: timeoutMs,
      });

      if (collected.size === 0) {
        await message.edit(message.content + '\n\n⏰ **Timed out — auto-denied**');
        return false;
      }

      const approved = collected.first()?.emoji.name === '✅';
      await message.edit(
        message.content + `\n\n${approved ? '✅ **Allowed**' : '❌ **Denied**'}`
      );
      return approved;
    } catch {
      // On error, default to deny for security
      await message.edit(message.content + '\n\n⚠️ **Error — auto-denied**').catch(() => {});
      return false;
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
   * Register channel mappings from external source (e.g., state file)
   */
  registerChannelMappings(mappings: { channelId: string; projectName: string; agentType: string }[]): void {
    for (const m of mappings) {
      this.channelMapping.set(m.channelId, {
        projectName: m.projectName,
        agentType: m.agentType,
      });
      console.log(`Registered channel ${m.channelId} -> ${m.projectName}:${m.agentType}`);
    }
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
   * Delete a Discord channel by ID
   */
  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).delete();
        this.channelMapping.delete(channelId);
        return true;
      }
      return false;
    } catch (error: any) {
      // 10003 = Unknown Channel (already deleted), just log briefly
      if (error?.code === 10003) {
        console.log(`Channel ${channelId} already deleted`);
      } else {
        console.error(`Failed to delete channel ${channelId}:`, error);
      }
      return false;
    }
  }

  /**
   * Send an AskUserQuestion as an embed with interactive buttons.
   * Returns the selected option label, or null on timeout.
   */
  async sendQuestionWithButtons(
    channelId: string,
    questions: Array<{
      question: string;
      header?: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }>,
    timeoutMs: number = 300000
  ): Promise<string | null> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;
    const textChannel = channel as TextChannel;

    const q = questions[0];
    if (!q) return null;

    const embed = new EmbedBuilder()
      .setTitle(`❓ ${q.header || 'Question'}`)
      .setDescription(q.question)
      .setColor(0x5865f2);

    if (q.options.some((o) => o.description)) {
      embed.addFields(
        q.options.map((opt) => ({
          name: opt.label,
          value: opt.description || '\u200b',
          inline: true,
        }))
      );
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < q.options.length; i++) {
      if (i > 0 && i % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`opt_${i}`)
          .setLabel(q.options[i].label.slice(0, 80))
          .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    }
    rows.push(row);

    const message = await textChannel.send({
      embeds: [embed],
      components: rows,
    });

    try {
      const interaction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => !i.user.bot,
        time: timeoutMs,
      });

      const optIndex = parseInt(interaction.customId.split('_')[1]);
      const selected = q.options[optIndex]?.label || '';

      await interaction.update({
        embeds: [embed.setColor(0x57f287).setFooter({ text: `✅ ${selected}` })],
        components: [],
      });

      return selected;
    } catch {
      await message
        .edit({
          embeds: [embed.setColor(0x95a5a6).setFooter({ text: '⏰ Timed out' })],
          components: [],
        })
        .catch(() => {});
      return null;
    }
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
