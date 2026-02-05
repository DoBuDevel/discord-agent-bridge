/**
 * Discord message handlers
 */

import type { Message } from 'discord.js';

export class MessageHandler {
  async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Handle commands
    if (message.content.startsWith('!agent')) {
      await this.handleAgentCommand(message);
    }
  }

  private async handleAgentCommand(message: Message): Promise<void> {
    const args = message.content.split(' ').slice(1);
    const command = args[0];

    switch (command) {
      case 'status':
        await this.handleStatus(message);
        break;
      case 'help':
        await this.handleHelp(message);
        break;
      default:
        await message.reply('Unknown command. Try `!agent help`');
    }
  }

  private async handleStatus(message: Message): Promise<void> {
    await message.reply('Agent bridge is running');
  }

  private async handleHelp(message: Message): Promise<void> {
    const helpText = `
**Discord Agent Bridge Commands**

\`!agent status\` - Check bridge status
\`!agent help\` - Show this help message
    `.trim();

    await message.reply(helpText);
  }
}
