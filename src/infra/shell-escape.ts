/**
 * Minimal shell escaping helper (POSIX-ish).
 *
 * We use single-quote wrapping and escape embedded single quotes.
 * Safe for passing as a single argv token via the user's shell.
 */

export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

