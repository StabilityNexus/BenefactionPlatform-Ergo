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
      // wallet-svelte-component ships .svelte files and extensionless ESM imports that Node
      // cannot resolve, so vitest dies during collection - before running a single test,
      // including the ones already in the repo. It is pulled in transitively by $lib and no
      // test touches it, so it is stubbed out here.
      'wallet-svelte-component': path.resolve(__dirname, './tests/stubs/wallet-svelte-component.ts'),
    },
  },
});