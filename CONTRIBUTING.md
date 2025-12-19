# Contributing to Emergency Fundraising Platform

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher
- Git
- Nautilus Wallet extension
- Basic knowledge of TypeScript/Svelte
- (Optional) ErgoScript knowledge for smart contract work

### Development Setup

1. **Fork & Clone**
```bash
git clone https://github.com/YourUsername/emergency-fundraising-ergo.git
cd emergency-fundraising-ergo
```

2. **Install Dependencies**
```bash
npm install
```

3. **Run Development Server**
```bash
npm run dev
```

4. **Run Tests**
```bash
npm test
```

## 🎯 How Can I Contribute?

### Reporting Bugs

**Before submitting a bug report:**
- Check if the bug has already been reported in [Issues](https://github.com/YourUsername/emergency-fundraising-ergo/issues)
- Make sure you're using the latest version
- Test with a fresh wallet/browser

**How to submit a good bug report:**
1. Use a clear and descriptive title
2. Describe the exact steps to reproduce
3. Provide specific examples
4. Describe the behavior you observed
5. Explain what behavior you expected
6. Include screenshots if applicable
7. Include browser console logs

**Template:**
```markdown
**Bug Description:**
Clear description of the bug

**Steps to Reproduce:**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior:**
What you expected to happen

**Actual Behavior:**
What actually happened

**Screenshots/Logs:**
[If applicable]

**Environment:**
- Browser: Chrome 120
- Wallet: Nautilus 1.3.1
- Network: Mainnet/Testnet
```

### Suggesting Features

**Before submitting a feature request:**
- Check if it's already been suggested
- Make sure it aligns with project goals
- Consider if it's useful for most users

**Template:**
```markdown
**Problem Statement:**
What problem does this solve?

**Proposed Solution:**
How should it work?

**Alternatives Considered:**
What other options did you think about?

**Additional Context:**
Any mockups, examples, or references
```

### Code Contributions

#### Areas We Need Help

**🔴 High Priority:**
- [ ] ErgoScript voting mechanism implementation
- [ ] Oracle integration for off-chain data
- [ ] Smart contract security audit preparation
- [ ] Unit test coverage (currently 45%, target 80%)

**🟡 Medium Priority:**
- [ ] Mobile wallet support (Ergo Mobile Wallet)
- [ ] Document upload to IPFS (currently only links)
- [ ] Community member verification system
- [ ] Notification system for campaign updates

**🟢 Low Priority:**
- [ ] UI/UX improvements
- [ ] Accessibility enhancements
- [ ] Multi-language support
- [ ] Dark mode refinements

#### Development Workflow

1. **Create a Branch**
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `test/` - Test additions/updates
- `refactor/` - Code refactoring

2. **Make Your Changes**
- Follow the code style guide (below)
- Write/update tests
- Update documentation
- Keep commits atomic and meaningful

3. **Commit Your Changes**
```bash
git add .
git commit -m "feat: add voting mechanism to smart contract"
```

Commit message format:
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

4. **Push & Create PR**
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 📝 Code Style Guide

### TypeScript/JavaScript

**Formatting:**
```typescript
// Use 4 spaces for indentation
function submitCampaign(data: CampaignData): Promise<string> {
    // Use descriptive variable names
    const emergencyType = data.emergencyType;
    
    // Use early returns
    if (!data.title) {
        throw new Error("Title is required");
    }
    
    // Prefer const over let
    const metadata = JSON.stringify(data);
    
    return sendTransaction(metadata);
}
```

**Naming Conventions:**
```typescript
// PascalCase for types/interfaces
interface CampaignData {
    title: string;
    emergencyType: string;
}

// camelCase for variables/functions
const campaignTitle = "Emergency Medical";
function getCampaignById(id: string) { }

// UPPER_SNAKE_CASE for constants
const MAX_WITHDRAWAL_STAGES = 3;
const DEFAULT_VOTING_THRESHOLD = 60;
```

**Async/Await:**
```typescript
// ✅ Good
async function loadCampaigns() {
    try {
        const campaigns = await fetchFromBlockchain();
        return campaigns;
    } catch (error) {
        console.error("Failed to load campaigns:", error);
        throw error;
    }
}

// ❌ Avoid
function loadCampaigns() {
    return fetchFromBlockchain()
        .then(c => c)
        .catch(e => console.error(e));
}
```

### Svelte Components

**Component Structure:**
```svelte
<script lang="ts">
    // 1. Imports
    import { walletConnected } from '$lib/common/store';
    import Button from '$lib/components/ui/button.svelte';
    
    // 2. Props
    export let campaignId: string;
    export let title: string = "Default Title";
    
    // 3. State
    let isLoading = false;
    let errorMessage: string | null = null;
    
    // 4. Reactive Declarations
    $: isValid = title.length > 0;
    
    // 5. Functions
    async function handleSubmit() {
        // Implementation
    }
    
    // 6. Lifecycle
    onMount(() => {
        loadData();
    });
</script>

<!-- 7. Template -->
<div class="container">
    {#if isLoading}
        <p>Loading...</p>
    {:else}
        <h1>{title}</h1>
    {/if}
</div>

<!-- 8. Styles (if needed) -->
<style>
    .container {
        padding: 1rem;
    }
</style>
```

**Class Names (TailwindCSS):**
```svelte
<!-- ✅ Good: Semantic, readable -->
<div class="flex flex-col gap-4 p-6 bg-background rounded-lg">
    <h1 class="text-2xl font-bold text-foreground">Title</h1>
</div>

<!-- ❌ Avoid: Too long, unclear -->
<div class="flex flex-col gap-4 p-6 bg-slate-900 rounded-lg shadow-lg border border-slate-700">
```

### ErgoScript

**Formatting:**
```scala
// Use descriptive variable names
val minimumTokensSold = SELF.R5[Long].get
val totalVoters = SELF.R6[Long].get(0)
val approvalRate = approvedVotes / totalVoters

// Add comments for complex logic
// Check if voting threshold is met (60% approval required)
val votingThresholdMet = approvalRate >= 60L

// Use helper functions for readability
def isVerified(box: Box): Boolean = {
    val votes = box.R6[Coll[Long]].get
    votes(0) >= 60L // Approval percentage
}
```

## 🧪 Testing Guidelines

### Writing Tests

**Unit Tests:**
```typescript
describe('Campaign Validation', () => {
    it('should require a title', () => {
        const campaign = { description: 'Test' };
        expect(validateCampaign(campaign)).toBe(false);
    });
    
    it('should accept valid emergency type', () => {
        const campaign = {
            title: 'Test',
            emergencyType: 'Medical Emergency'
        };
        expect(validateCampaign(campaign)).toBe(true);
    });
});
```

**Contract Tests:**
```typescript
describe('Smart Contract', () => {
    it('should create campaign box with correct registers', async () => {
        const tx = await submitProject(campaignData);
        const box = tx.outputs[0];
        
        expect(box.R4).toBeDefined(); // Deadline
        expect(box.R5).toBeDefined(); // Min tokens
        expect(box.R9).toContain('emergency'); // Metadata
    });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Specific file
npm test -- campaign.test.ts
```

## 📚 Documentation

### Code Comments

**When to comment:**
```typescript
// ✅ Good: Explains WHY, not WHAT
// Community voting requires 60% approval to prevent fraud
const VOTING_THRESHOLD = 0.60;

// ✅ Good: Complex business logic
// Calculate staged release: 40% after approval, 30% after proof, 30% final
function calculateStageAmount(totalFunds: number, stage: number): number {
    const percentages = [0.40, 0.30, 0.30];
    return totalFunds * percentages[stage - 1];
}

// ❌ Avoid: Obvious comments
// Set title to campaign title
const title = campaign.title;
```

### Documentation Updates

When adding features, update:
1. **README.md** - User-facing features
2. **ARCHITECTURE.md** - Technical details
3. **Code comments** - Complex logic
4. **Type definitions** - New interfaces

## 🔄 Pull Request Process

### Before Submitting

**Checklist:**
- [ ] Code follows style guide
- [ ] Tests pass (`npm test`)
- [ ] Type check passes (`npm run check`)
- [ ] No console.log statements (use proper logging)
- [ ] Documentation updated
- [ ] Commits are clean and meaningful
- [ ] Branch is up to date with main

### PR Description Template

```markdown
## What does this PR do?
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123

## Screenshots
[If applicable]

## Testing
How did you test this?

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Code follows style guide
```

### Review Process

1. **Automated Checks:** GitHub Actions will run tests
2. **Code Review:** Maintainer reviews code quality
3. **Testing:** Reviewer tests functionality
4. **Approval:** Maintainer approves and merges

**Review Timeline:**
- Small fixes: 1-2 days
- Features: 3-7 days
- Breaking changes: 1-2 weeks

## 🎨 UI/UX Contributions

### Design Principles

1. **Clarity:** Emergency situations need clear, simple interfaces
2. **Trust:** Visual indicators for verification status
3. **Accessibility:** WCAG 2.1 AA compliance
4. **Mobile-First:** Responsive design for all screen sizes

### Component Guidelines

**Colors:**
- Success: Green (`bg-green-500`)
- Warning: Yellow (`bg-yellow-500`)
- Danger: Red (`bg-red-500`)
- Info: Blue (`bg-blue-500`)

**Typography:**
- Headings: `text-2xl font-bold`
- Body: `text-base text-muted-foreground`
- Labels: `text-sm font-medium`

**Spacing:**
- Container: `p-6`
- Section gaps: `gap-4`
- Component margins: `mt-4`

## 🔐 Security

### Reporting Security Issues

**Do NOT open public issues for security vulnerabilities.**

Instead:
1. Email: security@emergency-fundraising.io
2. Provide detailed description
3. Include steps to reproduce
4. Wait for acknowledgment (48 hours)

### Security Best Practices

When contributing:
- Never commit private keys or mnemonics
- Validate all user inputs
- Use TypeScript for type safety
- Follow principle of least privilege
- Audit dependencies regularly

## 📞 Getting Help

**Questions?**
- GitHub Discussions (preferred)
- Discord: [Join our server](#)
- Email: dev@emergency-fundraising.io

**Stuck?**
- Check existing issues/PRs
- Read ARCHITECTURE.md
- Review code comments
- Ask in discussions

## 🙏 Recognition

Contributors will be:
- Listed in README.md
- Credited in release notes
- Invited to contributor calls
- Eligible for bounties (future)

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to emergency relief technology! 🚑❤️**
