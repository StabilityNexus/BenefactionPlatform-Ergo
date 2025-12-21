# 🚀 Local Setup Guide - BenefactionPlatform-Ergo

## Overview

This guide explains how to run the Bene platform (https://ergo.bene.stability.nexus/) locally on your machine.

**Tech Stack**:
- Framework: SvelteKit
- Language: TypeScript
- Blockchain: Ergo
- Architecture: 100% Client-Side (No backend needed!)

---

## ✅ Prerequisites

Make sure you have installed:
- **Node.js** v16+ (check: `node --version`)
- **npm** or **pnpm** or **yarn**
- **Git**

---

## 📦 Installation Steps

### 1. Navigate to Project Directory
```bash
cd "/Users/viclkykumar/Library/CloudStorage/GoogleDrive-vickyiitbombay2@gmail.com/My Drive/business/lnmiit/BenefactionPlatform-Ergo"
```

### 2. Install Dependencies
```bash
npm install
```

**Note**: You already have `node_modules/` so this should be quick!

### 3. Start Development Server
```bash
npm run dev
```

This will start the Vite development server.

---

## 🌐 Access the Application

After running `npm run dev`, you should see output like:

```
  VITE v4.5.2  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Open in browser**: http://localhost:5173/

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Type-check with svelte-check |

---

## 🔧 Configuration

### Port Configuration

If you want to use a different port (e.g., 3000 instead of 5173):

**Option 1: Command line**
```bash
npm run dev -- --port 3000
```

**Option 2: Update vite.config.ts**
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: 3000
  }
});
```

### Host Configuration (Access from Other Devices)

To access from other devices on your network:
```bash
npm run dev -- --host
```

Then access via: `http://YOUR_LOCAL_IP:5173/`

---

## 🌍 Network Configuration

Since this is a **client-side DApp**, you can configure which Ergo node/explorer to connect to:

### Default Configuration
The app likely connects to:
- **Mainnet Explorer**: https://api.ergoplatform.com/
- **Testnet Explorer**: https://api-testnet.ergoplatform.com/

### Check Current Configuration
Look in these files:
```
src/lib/config/
src/lib/services/
```

---

## 🐛 Testing Your Issue #78 Fix Locally

Since you found a bug in `contracts/bene_contract/contract_v2.es`, here's how to test locally:

### 1. Run Your Test
```bash
npm test double_counting_bug.test.ts
```

### 2. Make the Fix (After PR is approved)
Edit `contracts/bene_contract/contract_v2.es` line 100:
```ergoscript
// BEFORE (BUGGY):
val calculation = proof_funding_token_amount - sold + refunded + exchanged

// AFTER (FIXED):
val calculation = proof_funding_token_amount - sold + refunded - exchanged
```

### 3. Recompile Contracts
If the platform has a contract compilation step:
```bash
npm run compile:contracts
# or check package.json for the correct script
```

### 4. Test Again
```bash
npm test double_counting_bug.test.ts
```

The test should now show the correct calculation!

---

## 📁 Project Structure

```
BenefactionPlatform-Ergo/
├── contracts/               # Ergo smart contracts
│   └── bene_contract/
│       └── contract_v2.es  # Main fundraising contract (Issue #78 bug here!)
├── src/
│   ├── lib/                # Reusable components & utilities
│   ├── routes/             # SvelteKit routes (pages)
│   └── app.html            # HTML template
├── static/                 # Static assets (images, favicon)
├── tests/                  # Test files
│   └── contracts/
│       └── double_counting_bug.test.ts  # Your Issue #78 test!
├── package.json            # Dependencies & scripts
├── svelte.config.js        # SvelteKit config
└── vite.config.ts          # Vite config
```

---

## 🔍 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use a different port
npm run dev -- --port 3000
```

### Node Memory Issues
The build script already uses increased memory:
```json
"build": "node --max-old-space-size=4096 node_modules/vite/bin/vite.js build"
```

If you get memory errors during dev:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

### Dependencies Issues
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors
```bash
# Run type-check
npm run check
```

---

## 🚀 Production Build & Preview

### Build for Production
```bash
npm run build
```

This creates optimized static files in the `build/` directory.

### Preview Production Build Locally
```bash
npm run preview
```

This serves the production build locally so you can test it before deployment.

---

## 🌐 Accessing the Live Site vs Local

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Live Site** | https://ergo.bene.stability.nexus/ | Production version |
| **Local Dev** | http://localhost:5173/ | Your development version |
| **Local Preview** | http://localhost:4173/ | Test production build locally |

---

## 🎯 Next Steps After Local Setup

1. ✅ **Run the app**: `npm run dev`
2. ✅ **Test Issue #78**: `npm test double_counting_bug.test.ts`
3. ✅ **Explore the UI**: Navigate to http://localhost:5173/
4. ✅ **Create a test campaign**: See how the platform works
5. ✅ **Wait for PR approval**: Then implement the fix in contract_v2.es
6. ✅ **Test the fix**: Verify bug is resolved

---

## 📞 Support

**Hackathon Team**: algsoch  
**Event**: Unstoppable Hackathon 2025 @ LNMIIT Jaipur  
**Repository**: https://github.com/StabilityNexus/BenefactionPlatform-Ergo  
**Your Fork**: https://github.com/algsoch/BenefactionPlatform-Ergo  

---

## 🎉 Quick Start (TL;DR)

```bash
cd "/Users/viclkykumar/Library/CloudStorage/GoogleDrive-vickyiitbombay2@gmail.com/My Drive/business/lnmiit/BenefactionPlatform-Ergo"
npm install
npm run dev
# Open: http://localhost:5173/
```

**That's it!** 🚀
