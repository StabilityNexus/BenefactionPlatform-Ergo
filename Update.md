# BenefactionPlatform-Ergo

## Overview
A decentralized crowdfunding/fundraising platform built on the Ergo blockchain. This is a 100% client-side DApp that interacts directly with the Ergo blockchain for all data storage and transactions.

### Project Goals
- Enable decentralized fundraising campaigns on Ergo blockchain
- Provide a user-friendly interface for creating and contributing to campaigns
- Maintain full decentralization with no backend servers
- Support multiple wallet connections (Nautilus, SAFEW)

### Current State
The platform is fully functional with the following features:
- Campaign creation with blockchain storage
- Contribution/donation system
- Wallet integration (Nautilus, SAFEW)
- Dark/light theme support
- Discussion system for campaigns

## Recent Changes (November 2025)

### UI/UX Improvements (Issue #42)
1. **Pagination System** - Added client-side pagination to ProjectList with 9 items per page
2. **File Upload Component** - Created FileUpload component with:
   - Image preview
   - Base64 encoding for small images (< 300KB)
   - URL fallback option
   - Drag-and-drop support
3. **Layout Components** - Created PageLayout and Section components for consistent structure
4. **Accessibility Enhancements**:
   - ARIA labels and roles throughout
   - Keyboard navigation support
   - Focus-visible states
   - Reduced motion support
   - High contrast mode support
5. **Rich Text Editor** - Enhanced EasyMDE styling with better dark mode support
6. **CSS Improvements**:
   - Prose class for rendered markdown
   - Skip-link for screen readers
   - Improved scrollbar styling
   - Better focus states

## User Preferences
- TypeScript is used throughout (not JavaScript)
- Maintain 100% client-side architecture (no backend)
- Dark theme as default
- Orange as primary accent color

## Project Architecture

### Tech Stack
- **Framework**: SvelteKit with static adapter
- **Language**: TypeScript
- **Styling**: TailwindCSS with custom theme
- **Blockchain**: Ergo (via Fleet SDK)
- **Rich Text**: EasyMDE (SimpleMDE fork)
- **UI Components**: Custom components based on bits-ui

### Directory Structure
```
src/
├── app.css              # Global styles with accessibility enhancements
├── app.html             # HTML template
├── routes/
│   ├── App.svelte       # Main router component
│   ├── ProjectList.svelte   # Campaign listing with pagination
│   ├── ProjectDetails.svelte # Campaign detail view
│   └── NewProject.svelte    # Campaign creation form
├── lib/
│   ├── common/          # Shared utilities and stores
│   ├── components/ui/   # Reusable UI components
│   │   ├── button/
│   │   ├── card/
│   │   ├── file-upload/ # NEW: FileUpload component
│   │   ├── layout/      # NEW: PageLayout, Section
│   │   ├── pagination/  # NEW: Pagination component
│   │   └── ...
│   ├── ergo/            # Ergo blockchain integration
│   └── wallet/          # Wallet connection management
└── static/              # Static assets
```

### Key Components

#### FileUpload (`src/lib/components/ui/file-upload/`)
- Handles image upload with base64 conversion
- Max file size: 300KB (configurable)
- Supports URL fallback
- Drag-and-drop enabled

#### Pagination (`src/lib/components/ui/pagination/`)
- Client-side pagination
- Configurable items per page
- ARIA-compliant navigation
- Keyboard accessible

#### PageLayout & Section (`src/lib/components/ui/layout/`)
- Consistent page structure
- Configurable max-width and padding
- Responsive design

### Data Flow
1. All campaign data is stored on the Ergo blockchain
2. Client fetches data directly from blockchain explorers
3. Wallet transactions are signed client-side
4. No server-side storage or processing

### Blockchain Constraints
- Box size limit: ~4KB
- Images must be URLs or very small base64
- Campaign content should be optimized

## Development Notes

### Running the Project
```bash
npm install
npm run dev
```

### Building for Production
```bash
npm run build
```

### Environment
- Port: 5000 (required for )
- HMR enabled with proper proxy support

### Testing
```bash
npm run test
```

## Important Files
- `vite.config.ts` - Vite configuration with HMR and proxy settings
- `svelte.config.js` - SvelteKit configuration
- `tailwind.config.js` - TailwindCSS theme configuration
- `src/app.css` - Global styles and accessibility features
