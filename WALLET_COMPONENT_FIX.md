# Wallet Svelte Component - ESM Import Fix

## Issue Description

The `wallet-svelte-component` library fails in strict Node.js ESM environments (such as Vitest tests) due to missing `.js` file extensions on relative imports in the distribution files.

### Error Details

**Location:** `node_modules/wallet-svelte-component/dist/index.js`

**Problematic imports:**
```javascript
export * from './wallet/wallet-manager';      // ❌ Missing .js extension
export * from './wallet/types';               // ❌ Missing .js extension
export * from './wallet/adapters/base';       // ❌ Missing .js extension
export * from './wallet/adapters/nautilus';   // ❌ Missing .js extension
export * from './wallet/adapters/safew';      // ❌ Missing .js extension
export * from './wallet/config';              // ❌ Missing .js extension
export * from './wallet/wallet-utils';        // ❌ Missing .js extension
export * from './components/ui/button';       // ❌ Missing .js extension
export * from './components/ui/badge';        // ❌ Missing .js extension
export * from './components/ui/dialog';       // ❌ Missing .js extension
export * from './components/ui/dropdown-menu'; // ❌ Missing .js extension
export * from './components/ui/alert';        // ❌ Missing .js extension
```

**Error message:**
```
Error: Cannot find module '.../node_modules/wallet-svelte-component/dist/wallet/wallet-manager' imported from .../node_modules/wallet-svelte-component/dist/index.js
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND', url: 'file:///.../dist/wallet/wallet-manager' }
```

## Root Cause

In strict ESM mode (Node.js with `"type": "module"`), all relative imports MUST include the file extension. The wallet-svelte-component package uses `@sveltejs/package` for building, which currently doesn't add `.js` extensions to the generated distribution files.

## Solution

The fix needs to be applied in the **upstream repository**: `ergo-basics/wallet-svelte-component`

### Required Changes

1. **Update build configuration** to ensure `.js` extensions are added to imports
2. **Modify vite/svelte-package configuration** to handle ESM imports correctly

### Fix Implementation Steps

#### Step 1: Fork and Clone wallet-svelte-component

```bash
# Fork the repository on GitHub: https://github.com/ergo-basics/wallet-svelte-component
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/wallet-svelte-component.git
cd wallet-svelte-component
```

#### Step 2: Fix the Build Configuration

The issue is in how `@sveltejs/package` generates the output. We need to add a post-build script or modify the package configuration.

**Option A: Add a post-build script**

Create `scripts/fix-imports.js`:
```javascript
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

async function fixImports(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const path = join(dir, file.name);
    
    if (file.isDirectory()) {
      await fixImports(path);
    } else if (file.name.endsWith('.js')) {
      let content = await readFile(path, 'utf-8');
      
      // Fix relative imports - add .js extension
      content = content.replace(
        /from\s+['"](\.[^'"]+)(?<!\.js)['"]/g,
        "from '$1.js'"
      );
      content = content.replace(
        /import\s+['"](\.[^'"]+)(?<!\.js)['"]/g,
        "import '$1.js'"
      );
      
      await writeFile(path, content, 'utf-8');
    }
  }
}

fixImports(distDir).catch(console.error);
```

Update `package.json`:
```json
{
  "scripts": {
    "build": "vite build",
    "package": "svelte-package && node scripts/fix-imports.js",
    "prepare": "svelte-package && node scripts/fix-imports.js"
  }
}
```

**Option B: Use rollup plugin**

Install `@rollup/plugin-replace` or similar plugin to modify the output during build.

#### Step 3: Test the Fix

```bash
npm install
npm run package
# Verify that dist/index.js now has .js extensions
cat dist/index.js | grep "from './"
```

All imports should now look like:
```javascript
export * from './wallet/wallet-manager.js';  // ✅ Has .js extension
```

#### Step 4: Create Pull Request

```bash
git add .
git commit -m "fix: Add .js extensions to ESM imports for strict Node.js compatibility

Fixes module resolution in strict ESM environments (Vitest, etc.)
by ensuring all relative imports include .js file extensions."
git push origin main
```

Create a PR to `ergo-basics/wallet-svelte-component` explaining the issue and fix.

### Step 5: Update BenefactionPlatform-Ergo

Once your fork has the fix, update this repository's `package.json`:

```json
{
  "dependencies": {
    "wallet-svelte-component": "github:YOUR_USERNAME/wallet-svelte-component"
  }
}
```

Then:
```bash
npm install
npm test  # Verify tests pass
```

## Testing the Fix

After applying the fix, verify it works:

```bash
npm test
# Or run specific test that was failing
npm run test:watch
```

## References

- [ES Modules: A cartoon deep-dive](https://hacks.mozilla.org/2018/03/es-modules-a-cartoon-deep-dive/)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [Vitest Configuration](https://vitest.dev/config/)

## Branch Information

- **Branch name:** `fix/wallet-component-esm-imports`
- **Issue:** Module resolution failure in strict ESM environments
- **Target:** Submit PR to `ergo-basics/wallet-svelte-component`
