import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()], // Add Svelte plugin to handle .svelte files
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