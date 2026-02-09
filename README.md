# Discord Agent Bridge

Bridge AI agent CLIs to Discord for remote monitoring and collaboration.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-129%20passing-brightgreen.svg)](./tests)

## Overview

Discord Agent Bridge connects AI coding assistants (Claude Code, OpenCode, Codex) to Discord, enabling remote monitoring and collaboration. Watch your AI agents work in real-time through Discord channels, share progress with your team, and track multiple projects simultaneously.

The bridge uses a polling-based architecture that captures tmux pane content every 30 seconds, detects state changes, and streams updates to dedicated Discord channels. Each project gets its own channel, and a single global daemon manages all connections efficiently.

## Features

- **Multi-Agent Support**: Works with Claude Code, OpenCode, and Codex
- **Auto-Discovery**: Automatically detects installed AI agents on your system
- **Real-Time Streaming**: Captures tmux output and streams to Discord every 30 seconds
- **Project Isolation**: Each project gets a dedicated Discord channel
- **Single Daemon**: One Discord bot connection manages all projects
- **Session Management**: Persistent tmux sessions survive disconnections
- **YOLO Mode**: Optional `--dangerously-skip-permissions` flag for agent autonomy
- **Rich CLI**: Intuitive commands for setup, control, and monitoring
- **Type-Safe**: Written in TypeScript with dependency injection pattern
- **Well-Tested**: 129 unit tests with Vitest

## Prerequisites

- **Node.js**: Version 18 or higher
- **tmux**: Version 3.0 or higher
- **Discord Bot**: Create a bot at [Discord Developer Portal](https://discord.com/developers/applications)
  - Required permissions: Send Messages, Manage Channels, Read Message History
  - Required intents: Guilds, GuildMessages, MessageContent
- **AI Agent**: At least one of:
  - [Claude Code](https://claude.ai/claude-code) (requires API key)
  - [OpenCode](https://github.com/OpenCodeAI/opencode) (requires API key)
  - [Codex](https://github.com/codexai/codex) (requires API key)

## Installation

### From npm

```bash
npm install -g discord-agent-bridge
```

### From source

```bash
git clone https://github.com/yourusername/discord-agent-bridge.git
cd discord-agent-bridge
npm install
npm run build
npm link
```

## Quick Start

### 1. Setup Discord Bot

```bash
# One-time setup with your Discord bot token
agent-discord setup YOUR_DISCORD_BOT_TOKEN
```

### 2. Initialize a Project

```bash
# Navigate to your project directory
cd ~/projects/my-app

# Initialize with Claude Code (or 'opencode', 'codex')
agent-discord init claude "My awesome application"
```

### 3. Start Working

```bash
# Quick start: daemon + project + attach in one command
agent-discord go

# Or step-by-step:
agent-discord daemon start    # Start global daemon
agent-discord start          # Start this project
agent-discord attach         # Attach to tmux session
```

Your AI agent is now running in tmux, with output streaming to Discord every 30 seconds.

## CLI Reference

### Global Commands

#### `setup <token>`

Configure Discord bot token (one-time setup).

```bash
agent-discord setup YOUR_BOT_TOKEN
```

#### `daemon <action>`

Control the global daemon process.

```bash
agent-discord daemon start    # Start daemon
agent-discord daemon stop     # Stop daemon
agent-discord daemon restart  # Restart daemon
agent-discord daemon status   # Check daemon status
```

#### `list`

List all registered projects.

```bash
agent-discord list
```

#### `agents`

List available AI agents detected on your system.

```bash
agent-discord agents
```

#### `config <action> [key] [value]`

Manage global configuration.

```bash
agent-discord config set pollingInterval 45000
agent-discord config get pollingInterval
agent-discord config list
agent-discord config reset
```

### Project Commands

Run these commands from your project directory after `init`.

#### `init <agent> <description>`

Initialize current directory as a project.

```bash
agent-discord init claude "Full-stack web application"
agent-discord init opencode "Data pipeline project"
```

#### `start [options]`

Start the AI agent for this project.

```bash
agent-discord start                    # Normal mode
agent-discord start --yolo            # YOLO mode (skip permissions)
agent-discord start --dangerously-skip-permissions  # Same as --yolo
```

#### `stop`

Stop the AI agent for this project.

```bash
agent-discord stop
```

#### `status`

Show project status.

```bash
agent-discord status
```

#### `attach`

Attach to the tmux session for this project.

```bash
agent-discord attach
```

Press `Ctrl-b d` to detach from tmux without stopping the agent.

#### `go [options]`

Quick start: start daemon, start project, and attach.

```bash
agent-discord go              # Normal mode
agent-discord go --yolo      # YOLO mode
```

## How It Works

### Architecture

```
┌─────────────────┐
│  AI Agent CLI   │  (Claude, OpenCode, Codex)
│  Running in     │
│  tmux session   │
└────────┬────────┘
         │
         │ tmux capture-pane (every 30s)
         │
    ┌────▼─────────────┐
    │  CapturePoller   │  Detects state changes
    └────┬─────────────┘
         │
         │ Discord.js
         │
    ┌────▼──────────────┐
    │  Discord Channel  │  #project-name
    └───────────────────┘
```

### Components

- **Daemon Manager**: Single global process managing Discord connection
- **Capture Poller**: Polls tmux panes every 30s, detects changes, sends to Discord
- **Agent Registry**: Factory pattern for multi-agent support (Claude, OpenCode, Codex)
- **State Manager**: Tracks project state, sessions, and channels
- **Dependency Injection**: Interfaces for storage, execution, environment (testable, mockable)

### Polling Model

The bridge uses a **polling-based** architecture instead of hooks:

1. Every 30 seconds (configurable), the poller runs `tmux capture-pane`
2. Compares captured content with previous snapshot
3. If changes detected, sends new content to Discord
4. Handles multi-line output, ANSI codes, and rate limiting

This approach is simpler and more reliable than hook-based systems, with minimal performance impact.

### Project Lifecycle

1. **Init**: Creates `.agent-discord.json` with project metadata
2. **Start**: Launches AI agent in a named tmux session
3. **Polling**: Daemon captures tmux output and streams to Discord
4. **Stop**: Terminates tmux session and cleans up
5. **Attach**: User can join tmux session to interact directly

## Supported Agents

| Agent | Binary | Auto-Detect | YOLO Support | Notes |
|-------|--------|-------------|--------------|-------|
| **Claude Code** | `claude-code` | Yes | Yes | Official Anthropic CLI |
| **OpenCode** | `opencode` | Yes | Yes | Open-source alternative |
| **Codex** | `codex` | Yes | Yes | Legacy agent support |

### Agent Detection

The CLI automatically detects installed agents using `which <binary>`. Run `agent-discord agents` to see available agents on your system.

### Adding Custom Agents

To add a new agent, implement the `AgentAdapter` interface in `src/agents/`:

```typescript
export interface AgentAdapter {
  name: string;
  detect(): Promise<boolean>;
  getCommand(projectPath: string, yolo: boolean): string[];
}
```

Register your adapter in `src/agents/index.ts`.

## Configuration

### Global Config

Stored in `~/.agent-discord/config.json`:

```json
{
  "discordToken": "YOUR_BOT_TOKEN",
  "pollingInterval": 30000,
  "maxMessageLength": 1900
}
```

Edit via:

```bash
agent-discord config set pollingInterval 45000
agent-discord config get pollingInterval
```

### Project Config

Stored in `.agent-discord.json` (per project):

```json
{
  "agent": "claude",
  "description": "My project description",
  "channelId": "1234567890",
  "sessionName": "agent-discord-my-project-abc123"
}
```

**Do not commit** `.agent-discord.json` to version control (add to `.gitignore`).

### Environment Variables

Override config with environment variables:

```bash
AGENT_DISCORD_TOKEN=token agent-discord daemon start
AGENT_DISCORD_POLLING_INTERVAL=60000 agent-discord go
```

## Development

### Building

```bash
npm install
npm run build          # Compile TypeScript
npm run build:watch    # Watch mode
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Test suite includes 129 tests covering:
- Agent adapters
- State management
- Discord client
- Capture polling
- CLI commands
- Storage and execution mocks

### Project Structure

```
discord-agent-bridge/
├── src/
│   ├── agents/           # Agent adapters (Claude, OpenCode, Codex)
│   ├── core/             # Core logic (daemon, poller, state)
│   ├── infra/            # Infrastructure (storage, shell, env)
│   ├── types/            # TypeScript interfaces
│   ├── cli/              # CLI commands
│   └── bin/              # Entry points
├── tests/                # Vitest test suite
├── package.json
└── tsconfig.json
```

### Dependency Injection

The codebase uses constructor injection with interfaces for testability:

```typescript
// Interfaces
interface IStorage { readFile, writeFile, exists, unlink }
interface ICommandExecutor { execute }
interface IEnvironment { getEnv, getCwd, getHomeDir }

// Usage
class DaemonManager {
  constructor(
    private storage: IStorage = new FileStorage(),
    private executor: ICommandExecutor = new ShellExecutor()
  ) {}
}

// Testing
const mockStorage = new MockStorage();
const daemon = new DaemonManager(mockStorage);
```

### Code Quality

- TypeScript strict mode enabled
- ESM modules with `.js` extensions in imports
- Vitest with 129 passing tests
- No unused locals/parameters (enforced by `tsconfig.json`)

## Troubleshooting

### Bot not connecting

1. Verify token: `agent-discord config get discordToken`
2. Check bot permissions in Discord Developer Portal
3. Ensure MessageContent intent is enabled
4. Restart daemon: `agent-discord daemon restart`

### Agent not detected

1. Run `agent-discord agents` to see available agents
2. Verify agent binary is in PATH: `which claude-code`
3. Install missing agent and retry

### tmux session issues

1. Check session exists: `tmux ls`
2. Kill stale session: `tmux kill-session -t <session-name>`
3. Restart project: `agent-discord stop && agent-discord start`

### No messages in Discord

1. Check daemon status: `agent-discord daemon status`
2. Verify polling interval: `agent-discord config get pollingInterval`
3. Check Discord channel permissions (bot needs Send Messages)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines

- Add tests for new features
- Maintain TypeScript strict mode compliance
- Follow existing code style
- Update documentation as needed

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Powered by [Claude Code](https://claude.ai/claude-code), [OpenCode](https://github.com/OpenCodeAI/opencode), and [Codex](https://github.com/codexai/codex)
- Inspired by the need for remote AI agent monitoring and collaboration

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/discord-agent-bridge/issues)
- Discussions: [GitHub Discussions](https://github.com/yourusername/discord-agent-bridge/discussions)
- Documentation: [Wiki](https://github.com/yourusername/discord-agent-bridge/wiki)

---

**Made with ❤️ for the AI coding community**
