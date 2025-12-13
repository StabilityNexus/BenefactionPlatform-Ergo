import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['web/**', 'node_modules/**', '.svelte-kit/**'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
      // Mock wallet-svelte-component to avoid ESM resolution issues in tests
      'wallet-svelte-component': path.resolve(__dirname, './tests/__mocks__/wallet-svelte-component.ts'),
    },
  },
});