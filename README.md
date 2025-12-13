# Bene: Decentralized Fundraising Platform

![Logo](static/favicon.png)

## 🌟 Overview

**Bene** is a decentralized application (DApp) on the Ergo blockchain designed for **Proof-of-Funding** fundraising. Its purpose is to eliminate the need for trust in a counterparty, using smart contracts to ensure that projects can only access funds if they meet a predefined minimum goal.

### 🔒 Serverless Architecture: Sovereignty and Local Execution
A fundamental feature of Bene is its **100% Client-Side** architecture:
* **No Backend:** The platform does not use central servers or private databases. Everything runs locally in your browser.
* **Direct Connection:** You choose which public node or explorer to connect to. The application reads and writes directly to the Ergo blockchain.
* **Censorship Resistance:** By not relying on proprietary servers, the interface is resilient and truly decentralized.
* **The Contract is the Rule:** Business logic and fund custody reside exclusively in the immutable smart contract.

---

## 📖 Guide for Users (Contributors)

This section details the lifecycle of your contribution and the guarantees offered by the contract.

### Key Concepts: The Two Tokens

The platform uses a dual-token system to ensure traceability and internal accounting:

1.  **APT (Auxiliary Project Token):**
    * **Function:** This is your **temporary deposit receipt**. It is used to track and measure your contribution to this specific campaign.
    * **Mechanism:** Upon purchase, you receive APTs. These APTs are your key to the future: you either exchange them for the real token (PFT) or use them to claim your refund.

2.  **PFT (Proof-funding Token):**
    * **Function:** This is the **real project participation token** (governance, shares, utility, etc.).
    * **Distribution:** PFTs are released from the contract and distributed **only after** the campaign is declared successful.

### Detailed Contribution Flow

#### 1. Participation and Fund Locking
* When you contribute (in ERG or Base Token), the contract acts as an *escrow* guarantee deposit.
* The contract receives your funds and issues the corresponding amount of **APTs** based on the price (`R7`).
* **Guarantee:** Both your funds and the project's PFTs remain **locked** in the contract box until the Deadline is met or the Minimum Goal is reached.

#### 2. Campaign Resolution (Outcome Determination)

| Outcome | Unlock Conditions | Required Action (User) |
| :--- | :--- | :--- |
| **Success** | Net Sales **>= Minimum Goal** (`R5`). | **Exchange:** Swap your APTs for PFTs. |
| **Failure** | **Deadline Expired** (`R4`) **AND** Net Sales **< Minimum Goal** (`R5`). | **Guaranteed Refund:** Return your APTs to receive **100%** of your original funds. |

#### 3. Community Interaction and Comments
Each project integrates a decentralized discussion forum.
* **Fully On-Chain:** All comments and discussions are recorded directly on the Ergo blockchain, ensuring no one can censor the project discussion.
* **Protocol:** This system is based on the open reputation protocol, ensuring the permanence and transparency of interactions.
* *More information:* [Reputation Systems Forum Protocol](https://github.com/reputation-systems/forum-application)

#### 4. Analytics Dashboard
Each project includes a comprehensive analytics dashboard for tracking campaign performance:
* **Key Metrics:** Real-time tracking of total raised, contributor count, average contribution, and funding progress
* **Visualizations:** Interactive charts for funding progress over time and contribution history
* **Contributor Analysis:** Detailed breakdown of top contributors with bar charts and comprehensive data tables
* **Time-Series Analytics:** Trend analysis through historical data visualization
* **Exportable Reports:** Download analytics data in CSV or JSON format for external analysis

---

## 📊 Analytics Features

The platform includes a powerful analytics system that provides insights into campaign performance:

### Key Metrics Collection
* Real-time data collection from blockchain transactions
* Automatic calculation of funding progress, contributor statistics, and average contributions
* Historical metrics tracking with time-series data points

### Visualization Components
* **Funding Progress Chart:** Line chart showing percentage of funding goal reached over time
* **Contribution History Chart:** Time-series visualization of total contributions
* **Contributor Bar Chart:** Top 10 contributors ranked by contribution amount

### Export Functionality
* **CSV Export:** Structured data export for spreadsheet analysis
* **JSON Export:** Complete analytics data in JSON format for programmatic access
* Reports include metrics summary, time-series data, and detailed contributor information

---


## 🏗️ Guide for Creators (Project Owners)

This section covers setup, costs, and campaign management.

### Requirements and Initial Setup
You only need to prepare **one asset** before launch:
* **Project Token (PFT):** You must have the total amount of tokens you plan to sell already minted and available.
* **APT:** The Auxiliary Token (APT), necessary for contract accounting, is **automatically generated** by the platform when you set up the contract box.

### Costs and Fees
Bene applies a "shared success" model:
* **Developer Fee:** **5%** of the funds raised.
* **Condition:** This fee is **only charged if the campaign is successful** and you withdraw the funds. If the campaign fails and users request a refund, the platform does not charge anything.

### Critical Parameters
When creating the campaign, the following parameters are immutably recorded in the contract:
* **Minimum Goal (`R5`):** The threshold that determines success. If exceeded, fund withdrawal is enabled and refunds are blocked.
* **Deadline (`R4`):** Defines when the "guaranteed refund" period ends. Users can only request a refund if this date has passed and the goal was not met.
* **Base Token:** Flexibility to choose between ERG or a specific token ID for the fundraising (e.g., a stablecoin).

### Fund Management

| Action | Condition | Management Implication |
| :--- | :--- | :--- |
| **Withdraw Funds** | Success (Minimum Goal reached). | The contract automatically executes the fee split: 95% to the owner, 5% to the developer. |
| **Withdraw Unsold Tokens (Stock)** | Available at any time. | Allows the owner to recover the *surplus stock* of PFTs that have not yet been sold, while maintaining the security invariant. |
| **Add Stock (PFT)** | At any time. | Allows increasing the total PFT supply available for sale to extend the campaign or meet higher demand. |

---

## 🛠️ Technology Stack

* **Framework:** SvelteKit with TypeScript
* **Blockchain:** Ergo blockchain with Fleet SDK
* **Styling:** Tailwind CSS with custom UI components
* **Charts:** Custom SVG-based chart generation
* **State Management:** Svelte stores
* **Build Tool:** Vite

---

## ⚙️ Technical Guide (Detailed Architecture)

This section is for developers and auditors who wish to understand the inner workings of the `contract_v2.es`.

### Token Dynamics and Accounting

#### 1. The Dual Nature of the APT
The APT has two roles, reflected in its total supply (`PFT Supply + 1`):
* **NFT Unit:** One unit of APT always remains in the box (`R1`) as a unique identifier (similar to an NFT) associating the contract with the project.
* **Circulating Supply:** The remaining units of APT act as contribution receipts, ensuring traceability.

#### 2. Security Invariant
The core of fund protection is the following invariant: **The contract must always maintain enough PFTs to cover all circulating APTs that have not yet been exchanged.**

* $PFT_{in\_box} \ge APT_{in\_circulation}$
* This invariant is rigorously applied in the **Withdraw Unsold Tokens** logic, ensuring the owner cannot withdraw PFTs if it jeopardizes the contract's ability to redeem users' APTs.

#### 3. Multi-Token Support
The contract handles payment token flexibility using Register `R8`:
* If the `base_token_id` field in `R8` is empty, the contract assumes fundraising is in **ERG**.
* If `base_token_id` contains a token ID, all price calculations (`R7`) and refunds are based on that specific token.

### Complete Register Specification (Registers)

| Register | Type | Functional Description |
| :--- | :--- | :--- |
| **R4** | `(Boolean, Long)` | **Temporal Limit.** Defines the expiration time for refunds (Block Height or Timestamp). |
| **R5** | `Long` | **Success Threshold.** Minimum number of tokens to be sold. |
| **R6** | `Coll[Long]` | **Counters:** [0] Tokens Sold, [1] Tokens Refunded, [2] APTs Exchanged for PFTs. |
| **R7** | `Long` | **Price.** Exchange rate (Base Token per PFT). |
| **R8** | `Coll[Coll[Byte]]` | **Immutable Configuration:** Owner's Script, Fee address Hash, **Fee Percentage (5%)**, PFT ID, and Base Token ID. |
| **R9** | `Coll[Byte]` | **Metadata.** Descriptive project information (JSON). |

---

## 🚀 Installation and Development

As a *client-side* application, you can run it locally without third-party dependencies, connecting to your preferred node.

### Requirements
* Node.js v20+
* npm or yarn
* Git

### Quick Start
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/StabilityNexus/BenefactionPlatform-Ergo
    cd BenefactionPlatform-Ergo
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`

### Available Scripts
* `npm run dev` - Start development server
* `npm run build` - Build for production
* `npm run preview` - Preview production build
* `npm run check` - Run TypeScript type checking
* `npm test` - Run test suite

### Project Structure
```
src/
├── routes/              # SvelteKit routes and pages
│   ├── AnalyticsDashboard.svelte
│   ├── ProjectDetails.svelte
│   └── ...
├── lib/
│   ├── analytics/       # Analytics system
│   │   ├── metrics-collector.ts
│   │   ├── report-generator.ts
│   │   └── chart-components.ts
│   ├── components/      # Reusable components
│   │   └── analytics/   # Analytics visualization components
│   ├── ergo/           # Ergo blockchain integration
│   └── common/         # Shared utilities
└── ...
```

### Live Demo
You can access the deployed version at: [BenefactionPlatform-Ergo](https://stabilitynexus.github.io/BenefactionPlatform-Ergo/)