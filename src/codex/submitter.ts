/**
 * Codex submission helper.
 *
 * Codex is a full-screen TUI. When we inject input via tmux `send-keys`, the
 * immediate Enter can be dropped depending on Codex busy/render state.
 *
 * Strategy:
 * - Type the prompt into the `codex` tmux window.
 * - Wait a short delay.
 * - Press Enter.
 * - Verify submission via tmux capture.
 *   - Normal prompts: look for an echoed `› <prompt>` line (prefix match).
 *   - Slash commands (/command): Codex may not echo a `›` line. In that case,
 *     treat it as submitted once the typed input disappears from the pane.
 * - If verification fails, retry by pressing Enter again (without re-typing).
 */

import { cleanCapture } from '../capture/parser.js';
import type { TmuxManager } from '../tmux/manager.js';

type ITmux = Pick<TmuxManager, 'typeKeysToWindow' | 'sendEnterToWindow' | 'capturePaneFromWindow'>;

export class CodexSubmitter {
  constructor(private tmux: ITmux) {}

  private async sleep(ms: number): Promise<void> {
    if (!ms || ms <= 0) return;
    await new Promise((r) => setTimeout(r, ms));
  }

  private getEnvInt(name: string, defaultValue: number): number {
    const raw = process.env[name];
    if (!raw) return defaultValue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return defaultValue;
    return Math.trunc(n);
  }

  private isSlashCommand(prompt: string): boolean {
    return prompt.trimStart().startsWith('/');
  }

  private promptPrefix(prompt: string): string {
    // Survive wrapping and truncation: normalize whitespace and use a prefix.
    return prompt.trim().replace(/\s+/g, ' ').slice(0, 32);
  }

  private tailLines(capture: string, minLines: number): string[] {
    const lines = cleanCapture(capture).split('\n');
    const configured = this.getEnvInt('AGENT_DISCORD_SUBMIT_CHECK_LINES', 120);
    const n = Math.max(minLines, configured);
    return lines.slice(-n);
  }

  private captureShowsSubmittedPrompt(capture: string, prompt: string): boolean {
    const prefix = this.promptPrefix(prompt);
    const tail = this.tailLines(capture, 20);
    return tail.some((line) => {
      const l = line.trimStart();
      return l.startsWith('›') && l.includes(prefix);
    });
  }

  private captureContainsNeedle(capture: string, prompt: string): boolean {
    const needle = this.promptPrefix(prompt);
    if (!needle) return false;
    const tail = this.tailLines(capture, 20);
    return tail.some((line) => line.includes(needle));
  }

  /**
   * Submit a prompt to Codex via tmux.
   * @returns true if the submit was verified, false otherwise.
   */
  async submit(tmuxSession: string, windowName: string, prompt: string): Promise<boolean> {
    const trimmed = prompt.trimEnd();
    const isSlash = this.isSlashCommand(trimmed);

    const submitDelayMs = this.getEnvInt('AGENT_DISCORD_SUBMIT_DELAY_MS', 75);
    const checkDelayMs = this.getEnvInt('AGENT_DISCORD_SUBMIT_CHECK_DELAY_MS', 150);
    const retryDelayMs = this.getEnvInt('AGENT_DISCORD_SUBMIT_RETRY_DELAY_MS', 250);
    const retries = this.getEnvInt('AGENT_DISCORD_SUBMIT_RETRIES', 4);

    // Type first so retries can be Enter-only (avoid duplicating text).
    this.tmux.typeKeysToWindow(tmuxSession, windowName, trimmed);
    await this.sleep(submitDelayMs);

    // For slash commands, record a capture after typing so we can detect disappearance.
    let typedCapture = '';
    if (isSlash) {
      typedCapture = this.tmux.capturePaneFromWindow(tmuxSession, windowName);
    }

    this.tmux.sendEnterToWindow(tmuxSession, windowName);
    await this.sleep(checkDelayMs);

    let after = this.tmux.capturePaneFromWindow(tmuxSession, windowName);
    if (isSlash) {
      const typedHad = typedCapture ? this.captureContainsNeedle(typedCapture, trimmed) : false;
      const afterHas = this.captureContainsNeedle(after, trimmed);
      if ((typedHad && !afterHas) || (!afterHas)) {
        return true;
      }
    } else {
      if (this.captureShowsSubmittedPrompt(after, trimmed)) {
        return true;
      }
    }

    // Retry: only press Enter again (no re-typing).
    for (let i = 0; i < Math.max(0, retries); i++) {
      this.tmux.sendEnterToWindow(tmuxSession, windowName);
      await this.sleep(retryDelayMs);
      after = this.tmux.capturePaneFromWindow(tmuxSession, windowName);

      if (isSlash) {
        const afterHas = this.captureContainsNeedle(after, trimmed);
        if (!afterHas) return true;
      } else {
        if (this.captureShowsSubmittedPrompt(after, trimmed)) return true;
      }
    }

    return false;
  }
}
