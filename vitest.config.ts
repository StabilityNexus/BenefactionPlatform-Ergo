import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()], // Use SvelteKit plugin (already installed)
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['web/**', 'node_modules/**', '.svelte-kit/**'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
    extensions: ['.js', '.ts', '.svelte', '.json'], // Explicit extensions for ESM resolution
  },
  ssr: {
    noExternal: ['wallet-svelte-component'], // Force bundling to handle missing .js extensions
  },
});