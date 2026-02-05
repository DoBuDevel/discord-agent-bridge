/**
 * Agent adapters registry
 */

export * from './base.js';
export { claudeAdapter, ClaudeAdapter } from './claude.js';
export { geminiAdapter, GeminiAdapter } from './gemini.js';
export { codexAdapter, CodexAdapter } from './codex.js';

import { agentRegistry } from './base.js';
import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { codexAdapter } from './codex.js';

// Register all available agents
agentRegistry.register(claudeAdapter);
agentRegistry.register(geminiAdapter);
agentRegistry.register(codexAdapter);

export { agentRegistry };
