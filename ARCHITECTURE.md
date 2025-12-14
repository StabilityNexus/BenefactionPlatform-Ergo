# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   SvelteKit  │  │  Nautilus    │  │   IPFS Gateway     │    │
│  │   Frontend   │──│   Wallet     │  │   (Documents)      │    │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────┘    │
└─────────┼──────────────────┼────────────────────────────────────┘
          │                  │
          │                  │ Sign Transactions
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Ergo Blockchain                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Campaign   │  │  ErgoScript  │  │   Explorer API     │    │
│  │   Boxes      │──│  Contracts   │  │   (Query Data)     │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Component Hierarchy
```
App (routes/+layout.svelte)
├── HomePage (routes/+page.svelte)
│   ├── ProjectList
│   │   └── ProjectCard (x N campaigns)
│   └── Filters/Search
│
├── NewProject (routes/NewProject.svelte)
│   ├── Step 1: Location Anchoring
│   ├── Step 2: Document Upload
│   ├── Step 3: Community Eligibility
│   ├── Step 4: Staged Release Config
│   ├── Token Selector
│   │   └── CreateTokenModal
│   └── Submit Buttons
│
├── ProjectDetails (routes/ProjectDetails.svelte)
│   ├── Verification Status
│   ├── Document Links
│   ├── Voting Interface
│   ├── Contribution Form
│   └── Withdrawal Stages
│
└── Shared Components
    ├── DirectWalletConnect
    ├── UI Components (shadcn-svelte)
    └── Theme Toggle
```

### State Management (Svelte Stores)

**store.ts:**
```typescript
// Global application state
export const walletConnected = writable<boolean>(false);
export const walletAddress = writable<string | null>(null);
export const projects = writable<Project[]>([]);
export const user_tokens = writable<Token[]>([]);
export const explorer_uri = writable<string>("https://api.ergoplatform.com");
```

### Data Flow

1. **Campaign Creation:**
```
User Input → Validation → Fleet SDK Transaction Builder → 
Nautilus Wallet → Sign → Broadcast → Ergo Blockchain → 
Update Local State
```

2. **Campaign Browsing:**
```
Load Page → Fetch from Explorer API → Parse Box Registers → 
Decode Metadata → Render ProjectCard Components
```

3. **Contribution:**
```
Select Campaign → Enter Amount → Build Transaction → 
Sign with Wallet → Submit → Update Campaign Box → 
Receive APT Tokens
```

## Smart Contract Architecture

### Box Structure

```
Campaign Box:
├── Value: ERG (accumulated donations)
├── Tokens:
│   ├── APT (NFT + supply for tracking)
│   └── PFT (Reward tokens for distribution)
└── Registers:
    ├── R4: Deadline (block height or timestamp)
    ├── R5: Minimum tokens to sell
    ├── R6: [sold, refunded, exchanged] counters
    ├── R7: Exchange rate
    ├── R8: Constants [owner, dev_fee, token_ids]
    └── R9: Project metadata (JSON)
```

### Metadata Schema (R9)

```json
{
  "title": "String",
  "description": "String",
  "image": "URL",
  "link": "URL",
  "emergency": {
    "emergencyType": "Medical|Disaster|Accident",
    "communityType": "Regional|Institutional",
    "communityName": "String",
    "documentHashes": ["IPFS CID or SHA-256"],
    "documentDescription": "String",
    "phase": "pending_verification|verified|fundraising|completed",
    "verificationVotes": {
      "approved": 0,
      "rejected": 0,
      "total": 0,
      "voters": ["address1", "address2"]
    },
    "withdrawalStages": [
      {
        "stageNumber": 1,
        "percentage": 40,
        "amount": 0,
        "status": "pending|released|frozen",
        "timelock": 0,
        "proofHash": "IPFS CID"
      }
    ],
    "totalFundsRaised": 0,
    "currentStage": 0
  }
}
```

## Verification System Architecture

### Phase 1: Pending Verification
```
Creator Submits → Metadata Stored → 
Community Notified → Review Period Starts
```

**Data:**
- `phase: "pending_verification"`
- `verificationVotes.total: 0`
- No funds can be raised yet

### Phase 2: Community Voting
```
Verifiers Review Documents → Cast Vote (Approve/Reject) → 
Update Vote Counters → Check Threshold
```

**Logic:**
```javascript
approval_rate = verificationVotes.approved / verificationVotes.total
if (approval_rate >= 0.60 && verificationVotes.total >= minimumCommunityMembers) {
  phase = "verified"
}
```

### Phase 3: Fundraising
```
Campaign Goes Live → Donors Contribute → 
Track Progress → Check Minimum Goal
```

**Smart Contract Check:**
```scala
val minimumGoalMet = selfSoldCounter >= selfMinimumTokensSold
```

### Phase 4: Staged Withdrawal

**Stage 1 (40%):**
```
Check: verificationVotes.approved / total >= 0.60
Action: Release 40% to creator's wallet
Update: withdrawalStages[0].status = "released"
```

**Stage 2 (30%):**
```
Check: Creator uploads hospital admission proof (IPFS hash)
Verification: Community validates proof
Action: Release 30% to creator's wallet
Update: withdrawalStages[1].status = "released"
```

**Stage 3 (30%):**
```
Check: Creator uploads final discharge report
Verification: Community validates completion
Action: Release remaining 30%
Update: phase = "completed"
```

## Security Architecture

### Threat Model

| Threat | Mitigation | Implementation Status |
|--------|------------|----------------------|
| Fake emergency claims | 4-layer verification | ✅ UI, ⚠️ Contract |
| Document forgery | IPFS cryptographic hashes | ✅ Implemented |
| Voting manipulation | Regional voting restriction | ⚠️ Planned |
| Fund theft | Smart contract custody | ✅ Implemented |
| Collusion (creator + voters) | Staged release + proof | ⚠️ Partial |
| Sybil attacks | Community size threshold | ✅ Implemented |

### Access Control

**Campaign Creation:**
- ✅ Requires wallet connection
- ✅ Requires minimum ERG balance (~0.002)
- ✅ Validates all form inputs

**Voting:**
- ⚠️ (Planned) Requires verified community membership
- ⚠️ (Planned) One vote per address
- ⚠️ (Planned) Regional restriction check

**Withdrawal:**
- ✅ Only owner ErgoTree can withdraw
- ✅ Requires minimum goal met
- ⚠️ (Planned) Stage-by-stage release enforcement

### Smart Contract Security

**Current (v2.0):**
- ✅ Minimum goal threshold
- ✅ Refund protection
- ✅ Developer fee handling
- ✅ Multi-token support
- ❌ No voting logic yet
- ❌ No staged release enforcement

**Planned Enhancements:**
- Oracle integration for off-chain voting
- Time-locked withdrawals
- Multi-signature release approval
- Document hash verification on-chain

## Performance Considerations

### Frontend Optimization
- Lazy loading for campaign images
- Pagination for campaign list (20 per page)
- Debounced search inputs
- Cached wallet balance

### Blockchain Efficiency
- Batch transaction building
- Minimal box creation (single box per campaign)
- Efficient register usage (9 registers max)
- Gas-optimized ErgoScript

### IPFS Performance
- Use public gateways for document access
- Client-side hashing before upload
- Fallback to Google Drive links

## Scalability

### Current Limits
- **Campaigns:** Unlimited (on-chain storage)
- **Voters per campaign:** ~1000 (metadata size limit)
- **Documents per campaign:** ~50 IPFS hashes
- **Withdrawal stages:** 3 (hardcoded)

### Future Scaling
- Voting stored in separate oracle box
- Document references in external storage
- Configurable stage count
- Layer 2 for micropayments

## Testing Architecture

### Unit Tests
```
tests/contracts/
├── contract_creation.test.ts    # Campaign box creation
├── buy_tokens.test.ts            # Contribution flow
├── refund_tokens.test.ts         # Refund logic
└── withdraw_funds.test.ts        # Withdrawal validation
```

### Test Coverage
- ✅ Contract compilation
- ✅ Box creation
- ✅ Token exchange
- ✅ Refund scenarios
- ⚠️ Voting logic (pending)
- ⚠️ Staged release (pending)

### Integration Tests
- Wallet connection flow
- End-to-end campaign creation
- Contribution + refund cycle
- Token minting

## Deployment Architecture

### Development
```
localhost:5173 → Vite Dev Server → 
Mainnet Ergo Blockchain (read-only)
```

### Production
```
GitHub → GitHub Actions → Build → 
Static Files → GitHub Pages → 
CDN → Users
```

### Environment Configuration
```typescript
// src/lib/ergo/envs.ts
export const network_id = "mainnet"  // or "testnet"
export const explorer_url = "https://api.ergoplatform.com"
export const node_url = "https://node.ergoplatform.com"
```

## Monitoring & Logging

### Frontend Logging
```javascript
console.log("💰 Wallet balance:", balance)
console.log("✅ Transaction submitted:", txId)
console.error("❌ Submission failed:", error)
```

### Contract Events
- Transaction broadcast
- Box state changes
- Token transfers
- Voting updates

### Analytics (Planned)
- Campaign success rate
- Average verification time
- Donor retention
- Platform usage metrics
