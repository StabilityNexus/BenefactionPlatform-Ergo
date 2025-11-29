// eslint.config.mjs
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

/** @type {import('eslint').Linter.Config[]} */
export default ts.config(
  // 1. Base JS rules
  js.configs.recommended,

  // 2. TypeScript recommended rules
  ...ts.configs.recommended,

  // 3. Svelte recommended rules
  ...svelte.configs.recommended,

  // 4. Svelte "prettier" config – disables rules that fight Prettier
  // (you still run Prettier separately)
  ...svelte.configs.prettier,

  // 5. Global language options
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // useful if you use SvelteKit or Node scripts
      },
    },
  },

  // 6. Extra config specifically for Svelte + TS files
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        // Hook ESLint into your Svelte config (routes, aliases, etc.)
        svelteConfig,
      },
    },
  },
  {
    ignores: [
      '**/.svelte-kit/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**'
    ]
  },

  // 7. Place for your own rule overrides
  {
    rules: {
      // You can tweak things here later, for example:
      '@typescript-eslint/no-explicit-any': 'warn',
      // '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 'no-console': 'warn',
    },
  },
);
