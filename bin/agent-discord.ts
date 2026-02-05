#!/usr/bin/env node

/**
 * CLI entry point for discord-agent-bridge
 */

import { Command } from 'commander';
import { AgentBridge } from '../src/index.js';
import { stateManager } from '../src/state/index.js';
import { validateConfig, config, saveConfig, getConfigPath } from '../src/config/index.js';
import { TmuxManager } from '../src/tmux/manager.js';
import { agentRegistry } from '../src/agents/index.js';
import { DiscordClient } from '../src/discord/client.js';
import { DaemonManager } from '../src/daemon.js';
import { basename, resolve } from 'path';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import chalk from 'chalk';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const program = new Command();

program
  .name('agent-discord')
  .description('Bridge AI agent CLIs to Discord')
  .version('0.1.0');

// Setup command - one-time setup
program
  .command('setup')
  .description('One-time setup: save token, detect server, install hooks')
  .argument('<token>', 'Discord bot token')
  .action(async (token: string) => {
    try {
      console.log(chalk.cyan('\n🔧 Discord Agent Bridge Setup\n'));

      // 1. Save token
      saveConfig({ token });
      console.log(chalk.green('✅ Bot token saved'));

      // 2. Connect to Discord to detect guilds
      console.log(chalk.gray('   Connecting to Discord...'));
      const client = new DiscordClient(token);
      await client.connect();

      const guilds = client.getGuilds();

      let selectedGuild: { id: string; name: string };

      if (guilds.length === 0) {
        console.error(chalk.red('\n❌ Bot is not in any server.'));
        console.log(chalk.gray('   Invite your bot to a server first:'));
        console.log(chalk.gray('   https://discord.com/developers/applications → OAuth2 → URL Generator'));
        await client.disconnect();
        process.exit(1);
      } else if (guilds.length === 1) {
        selectedGuild = guilds[0];
        console.log(chalk.green(`✅ Server detected: ${selectedGuild.name} (${selectedGuild.id})`));
      } else {
        console.log(chalk.white('\n   Bot is in multiple servers:\n'));
        guilds.forEach((g, i) => {
          console.log(chalk.gray(`   ${i + 1}. ${g.name} (${g.id})`));
        });
        const answer = await prompt(chalk.white(`\n   Select server [1-${guilds.length}]: `));
        const idx = parseInt(answer, 10) - 1;
        if (idx < 0 || idx >= guilds.length) {
          console.error(chalk.red('Invalid selection'));
          await client.disconnect();
          process.exit(1);
        }
        selectedGuild = guilds[idx];
        console.log(chalk.green(`✅ Server selected: ${selectedGuild.name}`));
      }

      // 3. Save guild ID
      stateManager.setGuildId(selectedGuild.id);
      saveConfig({ serverId: selectedGuild.id });

      // 4. Detect installed agents
      const installedAgents = agentRegistry.getAll().filter(a => a.isInstalled());
      console.log(chalk.white('\n🤖 Installed agents:'));
      if (installedAgents.length === 0) {
        console.log(chalk.yellow('   None detected. Install an agent CLI (claude, gemini-cli, codex) first.'));
      } else {
        for (const a of installedAgents) {
          console.log(chalk.green(`   ✓ ${a.config.displayName} (${a.config.command})`));
        }
      }

      // 5. Install hooks
      console.log(chalk.white('\n🪝 Installing hooks...'));
      const hookScript = resolve(import.meta.dirname, '../../hooks/install-hooks.sh');
      try {
        execSync(`bash "${hookScript}"`, { stdio: 'inherit' });
        console.log(chalk.green('✅ Hooks installed'));
      } catch {
        console.log(chalk.yellow('⚠️  Hook installation had issues (you can retry with: agent-discord install-hooks)'));
      }

      // 6. Disconnect
      await client.disconnect();

      // 7. Summary
      console.log(chalk.cyan('\n✨ Setup complete!\n'));
      console.log(chalk.white('Next step:'));
      console.log(chalk.gray(`   cd <your-project>`));
      console.log(chalk.gray(`   agent-discord go\n`));

    } catch (error) {
      console.error(chalk.red('Setup failed:'), error);
      process.exit(1);
    }
  });

// Start command - starts the bridge server
program
  .command('start')
  .description('Start the Discord bridge server')
  .option('-p, --project <name>', 'Start for specific project only')
  .option('-a, --attach', 'Attach to tmux session after starting (requires --project)')
  .action(async (options) => {
    try {
      validateConfig();

      const projects = stateManager.listProjects();

      if (projects.length === 0) {
        console.log(chalk.yellow('⚠️  No projects configured.'));
        console.log(chalk.gray('   Run `agent-discord init` in a project directory first.'));
        process.exit(1);
      }

      // Filter by project if specified
      const activeProjects = options.project
        ? projects.filter(p => p.projectName === options.project)
        : projects;

      if (activeProjects.length === 0) {
        console.log(chalk.red(`Project "${options.project}" not found.`));
        process.exit(1);
      }

      // --attach requires --project
      if (options.attach && !options.project) {
        console.log(chalk.red('--attach requires --project option'));
        console.log(chalk.gray('Example: agent-discord start -p myproject --attach'));
        process.exit(1);
      }

      console.log(chalk.cyan('\n🚀 Starting Discord Agent Bridge\n'));
      console.log(chalk.white('Configuration:'));
      console.log(chalk.gray(`   Config file: ${getConfigPath()}`));
      console.log(chalk.gray(`   Server ID: ${stateManager.getGuildId()}`));
      console.log(chalk.gray(`   Hook port: ${config.hookServerPort || 3847}`));

      console.log(chalk.white('\nProjects to bridge:'));
      for (const project of activeProjects) {
        const agentName = Object.entries(project.agents)
          .find(([_, enabled]) => enabled)?.[0];
        const adapter = agentName ? agentRegistry.get(agentName) : null;

        console.log(chalk.green(`   ✓ ${project.projectName}`));
        console.log(chalk.gray(`     Agent: ${adapter?.config.displayName || agentName || 'none'}`));
        console.log(chalk.gray(`     Channel: #${project.projectName}-${adapter?.config.channelSuffix || agentName}`));
        console.log(chalk.gray(`     Path: ${project.projectPath}`));
      }
      console.log('');

      const bridge = new AgentBridge();

      // If --attach, start bridge in background and attach to tmux
      if (options.attach) {
        const project = activeProjects[0];
        const sessionName = `agent-${project.projectName}`;

        // Start bridge, then attach
        await bridge.start();
        console.log(chalk.cyan(`\n📺 Attaching to ${sessionName}...\n`));
        execSync(`tmux attach-session -t ${sessionName}`, { stdio: 'inherit' });
      } else {
        await bridge.start();
      }
    } catch (error) {
      console.error(chalk.red('Error starting bridge:'), error);
      process.exit(1);
    }
  });

// Init command - initialize a project in current directory
program
  .command('init')
  .description('Initialize Discord bridge for current project')
  .argument('<agent>', 'Agent to use (claude, gemini, or codex)')
  .argument('<description>', 'Channel description (e.g., "내 프로젝트 작업")')
  .option('-n, --name <name>', 'Project name (defaults to directory name)')
  .action(async (agentName: string, description: string, options) => {
    try {
      validateConfig();

      // Check server ID
      if (!stateManager.getGuildId()) {
        console.error(chalk.red('Server ID not configured.'));
        console.log(chalk.gray('Run: agent-discord config --server <your-server-id>'));
        process.exit(1);
      }

      // Validate agent
      const adapter = agentRegistry.get(agentName.toLowerCase());
      if (!adapter) {
        console.error(chalk.red(`Unknown agent: ${agentName}`));
        console.log(chalk.gray('Available agents:'));
        for (const a of agentRegistry.getAll()) {
          console.log(chalk.gray(`  - ${a.config.name} (${a.config.displayName})`));
        }
        process.exit(1);
      }

      const projectPath = process.cwd();
      const projectName = options.name || basename(projectPath);

      // Channel name format: "Agent - description"
      const channelDisplayName = `${adapter.config.displayName} - ${description}`;

      console.log(chalk.cyan(`\n📦 Initializing project: ${projectName}\n`));

      const bridge = new AgentBridge();
      console.log(chalk.gray('   Connecting to Discord...'));
      await bridge.connect();

      // Only enable the selected agent
      const agents = { [adapter.config.name]: true };
      const result = await bridge.setupProject(projectName, projectPath, agents, channelDisplayName);

      console.log(chalk.green('\n✅ Project initialized!\n'));

      console.log(chalk.white('📋 Setup Summary:'));
      console.log(chalk.gray(`   Project:    ${projectName}`));
      console.log(chalk.gray(`   Path:       ${projectPath}`));
      console.log(chalk.gray(`   Agent:      ${result.agentName}`));
      console.log(chalk.cyan(`   Channel:    #${result.channelName}`));
      console.log(chalk.gray(`   tmux:       ${result.tmuxSession}`));

      console.log(chalk.green('✅ Environment variables auto-configured in tmux session'));

      console.log(chalk.white('\n🚀 Next step:\n'));
      console.log(chalk.gray(`   agent-discord go`));
      console.log(chalk.cyan(`   Then send messages in Discord #${result.channelName}\n`));

      await bridge.stop();
    } catch (error) {
      console.error(chalk.red('Error initializing project:'), error);
      process.exit(1);
    }
  });

// Go command - quick start for a project
program
  .command('go')
  .description('Quick start: launch daemon, setup project, attach tmux')
  .argument('[agent]', 'Agent to use (claude, gemini, codex)')
  .option('-n, --name <name>', 'Project name (defaults to directory name)')
  .option('--no-attach', 'Do not attach to tmux session')
  .action(async (agentArg: string | undefined, options) => {
    try {
      validateConfig();

      if (!stateManager.getGuildId()) {
        console.error(chalk.red('Not set up yet. Run: agent-discord setup <token>'));
        process.exit(1);
      }

      const projectPath = process.cwd();
      const projectName = options.name || basename(projectPath);
      const port = config.hookServerPort || 3847;

      console.log(chalk.cyan(`\n🚀 agent-discord go — ${projectName}\n`));

      // Determine agent
      let agentName: string;
      const existingProject = stateManager.getProject(projectName);

      if (agentArg) {
        // Explicitly specified
        const adapter = agentRegistry.get(agentArg.toLowerCase());
        if (!adapter) {
          console.error(chalk.red(`Unknown agent: ${agentArg}`));
          process.exit(1);
        }
        agentName = adapter.config.name;
      } else if (existingProject) {
        // Reuse existing project's agent
        const existing = Object.entries(existingProject.agents).find(([_, enabled]) => enabled)?.[0];
        if (!existing) {
          console.error(chalk.red('Existing project has no agent configured'));
          process.exit(1);
        }
        agentName = existing;
        console.log(chalk.gray(`   Reusing existing agent: ${agentName}`));
      } else {
        // Auto-detect installed agents
        const installed = agentRegistry.getAll().filter(a => a.isInstalled());
        if (installed.length === 0) {
          console.error(chalk.red('No agent CLIs found. Install one first (claude, gemini-cli, codex).'));
          process.exit(1);
        } else if (installed.length === 1) {
          agentName = installed[0].config.name;
          console.log(chalk.gray(`   Auto-selected agent: ${installed[0].config.displayName}`));
        } else {
          console.log(chalk.white('   Multiple agents installed:\n'));
          installed.forEach((a, i) => {
            console.log(chalk.gray(`   ${i + 1}. ${a.config.displayName} (${a.config.command})`));
          });
          const answer = await prompt(chalk.white(`\n   Select agent [1-${installed.length}]: `));
          const idx = parseInt(answer, 10) - 1;
          if (idx < 0 || idx >= installed.length) {
            console.error(chalk.red('Invalid selection'));
            process.exit(1);
          }
          agentName = installed[idx].config.name;
        }
      }

      // Ensure daemon is running
      const running = await DaemonManager.isRunning(port);
      if (!running) {
        console.log(chalk.gray('   Starting bridge daemon...'));
        const entryPoint = resolve(import.meta.dirname, '../src/daemon-entry.js');
        DaemonManager.startDaemon(entryPoint);
        const ready = await DaemonManager.waitForReady(port);
        if (ready) {
          console.log(chalk.green(`✅ Bridge daemon started (port ${port})`));
        } else {
          console.log(chalk.yellow(`⚠️  Daemon may not be ready yet. Check logs: ${DaemonManager.getLogFile()}`));
        }
      } else {
        console.log(chalk.green(`✅ Bridge daemon already running (port ${port})`));
      }

      const tmux = new TmuxManager('agent-');

      if (!existingProject) {
        // New project: full setup via bridge
        console.log(chalk.gray('   Setting up new project...'));
        const bridge = new AgentBridge();
        await bridge.connect();

        const adapter = agentRegistry.get(agentName)!;
        const channelDisplayName = `${adapter.config.displayName} - ${projectName}`;
        const agents = { [agentName]: true };
        const result = await bridge.setupProject(projectName, projectPath, agents, channelDisplayName);

        console.log(chalk.green(`✅ Project created`));
        console.log(chalk.cyan(`   Channel: #${result.channelName}`));

        await bridge.stop();
      } else {
        // Existing project: just ensure tmux session exists
        const tmuxSession = tmux.getOrCreateSession(projectName);
        // Set env vars on existing session too
        tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_PROJECT', projectName);
        tmux.setSessionEnv(tmuxSession, 'AGENT_DISCORD_PORT', String(port));
        console.log(chalk.green(`✅ Existing project resumed`));
      }

      // Summary
      const sessionName = `agent-${projectName}`;
      console.log(chalk.cyan('\n✨ Ready!\n'));
      console.log(chalk.gray(`   Project:  ${projectName}`));
      console.log(chalk.gray(`   Session:  ${sessionName}`));
      console.log(chalk.gray(`   Agent:    ${agentName}`));
      console.log(chalk.gray(`   Port:     ${port}`));

      // Attach
      if (options.attach !== false) {
        console.log(chalk.cyan(`\n📺 Attaching to ${sessionName}...\n`));
        execSync(`tmux attach-session -t ${sessionName}`, { stdio: 'inherit' });
      } else {
        console.log(chalk.gray(`\n   To attach later: agent-discord attach ${projectName}\n`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Config command - configure global settings
program
  .command('config')
  .description('Configure Discord bridge settings')
  .option('-s, --server <id>', 'Set Discord server ID')
  .option('-t, --token <token>', 'Set Discord bot token')
  .option('-p, --port <port>', 'Set hook server port')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    if (options.show) {
      console.log(chalk.cyan('\n📋 Current configuration:\n'));
      console.log(chalk.gray(`   Config file: ${getConfigPath()}`));
      console.log(chalk.gray(`   Server ID: ${stateManager.getGuildId() || '(not set)'}`));
      console.log(chalk.gray(`   Token: ${config.discord.token ? '****' + config.discord.token.slice(-4) : '(not set)'}`));
      console.log(chalk.gray(`   Hook Port: ${config.hookServerPort || 3847}`));
      console.log(chalk.cyan('\n🤖 Registered Agents:\n'));
      for (const adapter of agentRegistry.getAll()) {
        console.log(chalk.gray(`   - ${adapter.config.displayName} (${adapter.config.name})`));
      }
      console.log('');
      return;
    }

    let updated = false;

    if (options.server) {
      stateManager.setGuildId(options.server);
      saveConfig({ serverId: options.server });
      console.log(chalk.green(`✅ Server ID saved: ${options.server}`));
      updated = true;
    }

    if (options.token) {
      saveConfig({ token: options.token });
      console.log(chalk.green(`✅ Bot token saved (****${options.token.slice(-4)})`));
      updated = true;
    }

    if (options.port) {
      const port = parseInt(options.port, 10);
      saveConfig({ hookServerPort: port });
      console.log(chalk.green(`✅ Hook port saved: ${port}`));
      updated = true;
    }

    if (!updated) {
      console.log(chalk.yellow('No options provided. Use --help to see available options.'));
      console.log(chalk.gray('\nExample:'));
      console.log(chalk.gray('  agent-discord config --token YOUR_BOT_TOKEN'));
      console.log(chalk.gray('  agent-discord config --server YOUR_SERVER_ID'));
      console.log(chalk.gray('  agent-discord config --show'));
    }
  });

// Status command - show current status
program
  .command('status')
  .description('Show bridge and project status')
  .action(() => {
    const projects = stateManager.listProjects();
    const tmux = new TmuxManager('agent-');
    const sessions = tmux.listSessions();

    console.log(chalk.cyan('\n📊 Discord Agent Bridge Status\n'));

    console.log(chalk.white('Configuration:'));
    console.log(chalk.gray(`   Config file: ${getConfigPath()}`));
    console.log(chalk.gray(`   Server ID: ${stateManager.getGuildId() || '(not configured)'}`));
    console.log(chalk.gray(`   Token: ${config.discord.token ? '****' + config.discord.token.slice(-4) : '(not set)'}`));
    console.log(chalk.gray(`   Hook Port: ${config.hookServerPort || 3847}`));

    console.log(chalk.cyan('\n🤖 Registered Agents:\n'));
    for (const adapter of agentRegistry.getAll()) {
      console.log(chalk.gray(`   ${adapter.config.displayName} (${adapter.config.command})`));
    }

    console.log(chalk.cyan('\n📂 Projects:\n'));

    if (projects.length === 0) {
      console.log(chalk.gray('   No projects configured. Run `agent-discord init` in a project directory.'));
    } else {
      for (const project of projects) {
        const sessionActive = sessions.some(s => s.name === project.tmuxSession);
        const status = sessionActive ? chalk.green('● active') : chalk.gray('○ inactive');

        console.log(chalk.white(`   ${project.projectName}`), status);
        console.log(chalk.gray(`     Path: ${project.projectPath}`));

        // Show the single agent
        const agentName = Object.entries(project.agents)
          .find(([_, enabled]) => enabled)?.[0];
        const adapter = agentName ? agentRegistry.get(agentName) : null;
        console.log(chalk.gray(`     Agent: ${adapter?.config.displayName || agentName || 'none'}`));
        console.log('');
      }
    }

    console.log(chalk.cyan('📺 tmux Sessions:\n'));
    if (sessions.length === 0) {
      console.log(chalk.gray('   No active sessions'));
    } else {
      for (const session of sessions) {
        console.log(chalk.white(`   ${session.name}`), chalk.gray(`(${session.windows} windows)`));
      }
    }
    console.log('');
  });

// List command - list all projects
program
  .command('list')
  .alias('ls')
  .description('List all configured projects')
  .action(() => {
    const projects = stateManager.listProjects();

    if (projects.length === 0) {
      console.log(chalk.gray('No projects configured.'));
      return;
    }

    console.log(chalk.cyan('\n📂 Configured Projects:\n'));
    for (const project of projects) {
      const agentName = Object.entries(project.agents)
        .find(([_, enabled]) => enabled)?.[0];
      const adapter = agentName ? agentRegistry.get(agentName) : null;

      console.log(chalk.white(`  • ${project.projectName}`));
      console.log(chalk.gray(`    Agent: ${adapter?.config.displayName || agentName || 'none'}`));
      console.log(chalk.gray(`    Path: ${project.projectPath}`));
    }
    console.log('');
  });

// Agents command - list available agents
program
  .command('agents')
  .description('List available AI agent adapters')
  .action(() => {
    console.log(chalk.cyan('\n🤖 Available Agent Adapters:\n'));
    for (const adapter of agentRegistry.getAll()) {
      console.log(chalk.white(`  ${adapter.config.displayName}`));
      console.log(chalk.gray(`    Name: ${adapter.config.name}`));
      console.log(chalk.gray(`    Command: ${adapter.config.command}`));
      console.log(chalk.gray(`    Hook config: ${adapter.getHookInstallPath()}`));
      console.log('');
    }
  });

// Attach command - attach to a project's tmux session
program
  .command('attach [project]')
  .description('Attach to a project tmux session')
  .action((projectName?: string) => {
    const tmux = new TmuxManager('agent-');

    if (!projectName) {
      // Use current directory name
      projectName = basename(process.cwd());
    }

    const sessionName = `agent-${projectName}`;

    if (!tmux.sessionExists(projectName)) {
      console.error(chalk.red(`Session ${sessionName} not found`));
      console.log(chalk.gray('Available sessions:'));
      const sessions = tmux.listSessions();
      for (const s of sessions) {
        console.log(chalk.gray(`  - ${s.name}`));
      }
      process.exit(1);
    }

    // Replace current process with tmux attach
    execSync(`tmux attach-session -t ${sessionName}`, { stdio: 'inherit' });
  });

// Stop command - stop a project
program
  .command('stop [project]')
  .description('Stop a project (kills tmux session)')
  .action((projectName?: string) => {
    if (!projectName) {
      projectName = basename(process.cwd());
    }

    const sessionName = `agent-${projectName}`;

    try {
      execSync(`tmux kill-session -t ${sessionName}`, { stdio: 'ignore' });
      console.log(chalk.green(`✅ Stopped session: ${sessionName}`));
    } catch {
      console.log(chalk.yellow(`Session ${sessionName} not running`));
    }
  });

// Install hooks command
program
  .command('install-hooks')
  .description('Install hooks for all registered agents')
  .option('-a, --agent <name>', 'Install hooks for specific agent only')
  .action((options) => {
    if (options.agent) {
      const adapter = agentRegistry.get(options.agent);
      if (!adapter) {
        console.error(chalk.red(`Unknown agent: ${options.agent}`));
        console.log(chalk.gray('Available agents:'), agentRegistry.getAll().map(a => a.config.name).join(', '));
        process.exit(1);
      }
      console.log(chalk.cyan(`Installing hooks for ${adapter.config.displayName}...`));
      console.log(chalk.gray(`Config path: ${adapter.getHookInstallPath()}`));
      console.log(chalk.yellow('\nManual installation required. Add the following hook configuration:'));
      console.log(chalk.gray(JSON.stringify(adapter.getSettingsConfig(
        resolve(import.meta.dirname, `../../hooks/${adapter.config.name}-post-tool.sh`)
      ), null, 2)));
    } else {
      const hookScript = resolve(import.meta.dirname, '../../hooks/install-hooks.sh');
      try {
        execSync(`bash "${hookScript}"`, { stdio: 'inherit' });
      } catch (error) {
        console.error(chalk.red('Failed to install hooks'));
        process.exit(1);
      }
    }
  });

program.parse();
