import { defineConfig } from 'vitest/config';
import path from 'path';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['web/**', 'node_modules/**', '.svelte-kit/**'],
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['wallet-svelte-component', 'forum-application'],
      },
    },
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
  },
});