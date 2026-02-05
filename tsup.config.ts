import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'bin/agent-discord.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
});
