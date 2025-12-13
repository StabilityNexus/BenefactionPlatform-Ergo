# Next Steps: Fixing wallet-svelte-component ESM Import Issue

## Current Status ✅

**Branch created:** `fix/wallet-component-esm-imports`

You're currently on this branch with the following files:
- `WALLET_COMPONENT_FIX.md` - Detailed documentation of the issue and fix
- `fix-imports-script.mjs` - Automated script to fix imports

## What Has Been Done

1. ✅ Created branch `fix/wallet-component-esm-imports`
2. ✅ Documented the ESM import issue
3. ✅ Created automated fix script
4. ✅ Tested the fix locally (it works!)
5. ✅ Committed the documentation

## What You Need to Do Next

Since the issue is in the upstream `wallet-svelte-component` library, you need to fork and fix it separately:

### Step 1: Fork wallet-svelte-component Repository

1. Go to: https://github.com/ergo-basics/wallet-svelte-component
2. Click "Fork" button (top right)
3. This creates a fork under your account: `https://github.com/ankitrraj/wallet-svelte-component`

### Step 2: Clone Your Fork

```bash
cd C:\Users\ANRIT\Desktop
git clone https://github.com/ankitrraj/wallet-svelte-component.git
cd wallet-svelte-component
```

### Step 3: Create a Branch for the Fix

```bash
git checkout -b fix/add-js-extensions-to-esm-imports
```

### Step 4: Copy the Fix Script

Copy the `fix-imports-script.mjs` from BenefactionPlatform-Ergo to wallet-svelte-component:

```bash
Copy-Item ..\BenefactionPlatform-Ergo\fix-imports-script.mjs .\scripts\fix-imports.mjs
```

### Step 5: Update package.json

Edit `package.json` in wallet-svelte-component and update the build scripts:

```json
{
  "scripts": {
    "build": "vite build",
    "package": "svelte-package && node scripts/fix-imports.mjs dist",
    "prepare": "svelte-package && node scripts/fix-imports.mjs dist"
  }
}
```

### Step 6: Create scripts Directory

```bash
mkdir scripts
```

Then move the fix script into it.

### Step 7: Test the Build

```bash
npm install
npm run package
# Check that dist/index.js has .js extensions
cat dist/index.js | Select-String "from './"
```

You should see all imports with `.js` extensions like:
```javascript
export * from './wallet/wallet-manager.js';
```

### Step 8: Commit and Push

```bash
git add .
git commit -m "fix: Add .js extensions to ESM imports for strict Node.js compatibility

Fixes module resolution errors in strict ESM environments (Vitest, etc.) 
by ensuring all relative imports in the build output include .js file extensions.

Changes:
- Added post-build script to automatically fix import paths
- Updated package.json to run the fix script after svelte-package
- Ensures compatibility with Node.js when type: 'module' is set

Resolves: ERR_MODULE_NOT_FOUND errors in consuming projects"

git push origin fix/add-js-extensions-to-esm-imports
```

### Step 9: Create Pull Request

1. Go to your fork: `https://github.com/ankitrraj/wallet-svelte-component`
2. Click "Pull Requests" → "New Pull Request"
3. Select:
   - **base repository:** `ergo-basics/wallet-svelte-component`
   - **base branch:** `main` (or whatever their default is)
   - **head repository:** `ankitrraj/wallet-svelte-component`
   - **compare branch:** `fix/add-js-extensions-to-esm-imports`
4. Title: **"fix: Add .js extensions to ESM imports for strict Node.js compatibility"**
5. Description: Use the content from `WALLET_COMPONENT_FIX.md` sections

### Step 10: Update BenefactionPlatform-Ergo Temporarily

While waiting for the PR to be merged, you can use your fork:

```bash
cd C:\Users\ANRIT\Desktop\BenefactionPlatform-Ergo
```

Edit `package.json` and change:
```json
{
  "dependencies": {
    "wallet-svelte-component": "github:ankitrraj/wallet-svelte-component#fix/add-js-extensions-to-esm-imports"
  }
}
```

Then:
```bash
npm install
npm test  # Verify it works
```

## Alternative: Quick Local Fix

If you just want to fix it locally without a PR right now, you can run:

```bash
node fix-imports-script.mjs
```

This will patch your local `node_modules/wallet-svelte-component` but will be lost on next `npm install`.

## Questions?

Check `WALLET_COMPONENT_FIX.md` for detailed explanations of:
- The root cause of the issue
- Why .js extensions are required in ESM
- Alternative fix approaches
- Testing instructions

## Current Git Status

```bash
# In BenefactionPlatform-Ergo
git branch
# * fix/wallet-component-esm-imports

git log -1 --oneline
# 2b11dc0 docs: Add fix documentation and script for wallet-svelte-component ESM import issue
```

Ready to push to origin and create a PR when the wallet-svelte-component fix is ready!
