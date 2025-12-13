#!/usr/bin/env node

/**
 * Post-build script to fix ESM imports by adding .js extensions
 * 
 * This script walks through the dist directory and adds .js extensions
 * to all relative imports to ensure compatibility with strict Node.js ESM.
 * 
 * Usage: node fix-imports-script.mjs [dist-directory]
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get dist directory from command line argument or use default
const distDir = process.argv[2] || join(__dirname, 'node_modules', 'wallet-svelte-component', 'dist');

console.log(`🔧 Fixing ESM imports in: ${distDir}\n`);

let filesFixed = 0;
let importsFixed = 0;

/**
 * Recursively process all .js files in a directory
 */
async function fixImportsInDirectory(dir) {
  try {
    const files = await readdir(dir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = join(dir, file.name);

      if (file.isDirectory()) {
        await fixImportsInDirectory(fullPath);
      } else if (file.name.endsWith('.js')) {
        await fixImportsInFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${dir}:`, error.message);
  }
}

/**
 * Fix imports in a single JavaScript file
 */
async function fixImportsInFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    const originalContent = content;
    let fileImportCount = 0;

    // Pattern 1: export * from './path'
    content = content.replace(
      /export\s+\*\s+from\s+['"](\.[^'"]+)(?<!\.js|\.svelte|\.json)['"]/g,
      (match, path) => {
        fileImportCount++;
        return `export * from '${path}.js'`;
      }
    );

    // Pattern 2: export { ... } from './path'
    content = content.replace(
      /export\s+{[^}]+}\s+from\s+['"](\.[^'"]+)(?<!\.js|\.svelte|\.json)['"]/g,
      (match, path) => {
        fileImportCount++;
        const quote = match.includes('"') && match.lastIndexOf('"') > match.lastIndexOf("'") ? '"' : "'";
        const exportPart = match.substring(0, match.lastIndexOf(quote));
        return `${exportPart}${quote}${path}.js${quote}`;
      }
    );

    // Pattern 3: import ... from './path'
    content = content.replace(
      /import\s+.*?from\s+['"](\.[^'"]+)(?<!\.js|\.svelte|\.json)['"]/g,
      (match, path) => {
        fileImportCount++;
        const quote = match.includes('"') && match.lastIndexOf('"') > match.lastIndexOf("'") ? '"' : "'";
        const importPart = match.substring(0, match.lastIndexOf(quote));
        return `${importPart}${quote}${path}.js${quote}`;
      }
    );

    // Pattern 4: import './path'
    content = content.replace(
      /import\s+['"](\.[^'"]+)(?<!\.js|\.svelte|\.json)['"]/g,
      (match, path) => {
        fileImportCount++;
        return `import '${path}.js'`;
      }
    );

    // Only write if changes were made
    if (content !== originalContent) {
      await writeFile(filePath, content, 'utf-8');
      filesFixed++;
      importsFixed += fileImportCount;
      console.log(`✅ Fixed ${fileImportCount} imports in: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing file ${filePath}:`, error.message);
  }
}

// Run the script
(async () => {
  try {
    console.log('Starting import fixes...\n');
    await fixImportsInDirectory(distDir);
    console.log(`\n🎉 Complete! Fixed ${importsFixed} imports across ${filesFixed} files.`);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
})();
