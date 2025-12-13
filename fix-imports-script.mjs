#!/usr/bin/env node

/**
 * Post-build script to fix ESM imports by adding .js extensions
 * 
 * This script walks through the dist directory and adds .js extensions
 * to all relative imports to ensure compatibility with strict Node.js ESM.
 * It also handles directory imports by checking if index.js exists.
 * 
 * Usage: node fix-imports-script.mjs [dist-directory]
 */

import { readdir, readFile, writeFile, access } from 'fs/promises';
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
 * Check if a path exists
 */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the correct import path with extension
 */
async function resolveImportPath(importPath, fileDir) {
  // Skip if already has extension
  if (importPath.match(/\.(js|svelte|json)$/)) {
    return importPath;
  }

  // Remove leading './'
  const relativePath = importPath.replace(/^\.\//, '');
  const fullPath = join(fileDir, relativePath);

  // Try path + .js (file)
  if (await pathExists(fullPath + '.js')) {
    return importPath + '.js';
  }

  // Try path + /index.js (directory with index)
  if (await pathExists(join(fullPath, 'index.js'))) {
    return importPath + '/index.js';
  }

  // Default to .js if neither exists
  return importPath + '.js';
}

/**
 * Fix imports in a single JavaScript file
 */
async function fixImportsInFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    const originalContent = content;
    let fileImportCount = 0;
    const fileDir = dirname(filePath);

    // Find all import/export statements that need fixing
    const patterns = [
      // Pattern 1: export * from './path'
      /export\s+\*\s+from\s+(['"])(\.\/[^'"]+)\1/g,
      // Pattern 2: export { ... } from './path'
      /export\s+{[^}]+}\s+from\s+(['"])(\.\/[^'"]+)\1/g,
      // Pattern 3: import ... from './path'
      /import\s+[^'"]+from\s+(['"])(\.\/[^'"]+)\1/g,
      // Pattern 4: import './path'
      /import\s+(['"])(\.\/[^'"]+)\1/g
    ];

    let matches = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const quote = match[1];
        const path = match[2];
        // Skip if already has extension
        if (!path.match(/\.(js|svelte|json)$/)) {
          matches.push({
            fullMatch: match[0],
            quote,
            path,
            index: match.index
          });
        }
      }
    }

    // Sort by index in reverse to replace from end to start
    matches.sort((a, b) => b.index - a.index);

    // Process each match
    for (const { fullMatch, quote, path } of matches) {
      const newPath = await resolveImportPath(path, fileDir);
      const newStatement = fullMatch.replace(path, newPath);
      content = content.replace(fullMatch, newStatement);
      fileImportCount++;
    }

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
