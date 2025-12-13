import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['web/**', 'node_modules/**', '.svelte-kit/**'],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
      'wallet-svelte-component': path.resolve(__dirname, './tests/mocks/wallet-svelte-component.ts'),
    },
  },
});