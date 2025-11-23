# Bene: Fundraising Platform

![Logo](static/favicon.png)

## Overview
Bene: Proof-of-Funding Fundraising Platform is a decentralized application (DApp) that enables projects to receive funding in exchange for participation tokens. This DApp allows projects to request funds (ERGs or any other token) in exchange for participation tokens.

### How it Works

- Each project contains two tokens:
   1. **Auxiliary Project Token (APT)**: This token is minted during the project creation transaction and serves two main purposes:
      - **Project Identifier**: A single unit of the APT remains in the contract to uniquely identify the project.
      - **Contribution Tracking**: Temporarily, contributors receive this token when participating in the project. Once it is confirmed that a refund is no longer possible, contributors can exchange the APT for the **Proof-funding Token (PFT)**.
      - The total supply of APT equals the total issuance of PFT plus one (for the identifier unit).
   2. **Proof-funding Token (PFT)**: Unlike the APT, the PFT is not minted on the contract. It represents the project or its organization and may also reflect proof-funding for similar projects within the same organization. PFTs are distributed only after refund conditions are no longer applicable, ensuring proper tracking. 

>The use of the APT ensures that during refunds, the origin of the token can be reliably traced to the current project. If PFTs were distributed immediately upon purchase, distinguishing whether a token originated from the current project or another related project would not be possible.

- Project owners can create a box that holds an amount of tokens, which may vary, setting a **block limit** as a deadline.
- A minimum amount of tokens must be sold before the project can withdraw funds. This ensures that the project receives sufficient backing.
- If the block limit is reached before minimum amount of tokens are sold, users have the option to exchange their tokens back for the corresponding funds, provided the minimum has not been reached.
- The main box is self-replicating, meaning that anyone can spend the box as long as they re-create it with the same parameters and add funds in exchange for a specified amount of tokens.

## Parameters of a Box

- **Block Limit (R4)**: A tuple `(Boolean, Long)` specifying the deadline. The Boolean indicates the limit type (`false` for Block Height, `true` for Timestamp), and the Long holds the limit value.
- **Minimum Tokens Sold (R5)**: The minimum number of tokens that must be sold to enable withdrawals or refunds.
- **Token Sold Counter (R6)**: Collection of three Longs: tokens sold, tokens refunded, and APTs exchanged for PFTs.
- **Exchange Rate (R7)**: The exchange rate of Base Token per PFT.
- **Contract Constants (R8)**: A collection of byte arrays `Coll[Coll[Byte]]` containing: `[owner_ergotree, dev_fee_contract_bytes_hash, dev_fee, pft_token_id, base_token_id]`.
- **Project Content (R9)**: Contains a JSON-formatted string with details about the project, such as its title, description, and other related information.

### Contract Configuration (Stored in R8)

To avoid hard-coding values and allow the same contract script to be used for multiple projects, the following configuration parameters are stored in register **R8**:

- **Owner Address** (`owner_ergotree`): The ErgoTree bytes of the contract owner.
- **Developer Fee Contract Hash** (`dev_fee_contract_bytes_hash`): Hash of the developer fee contract proposition.
- **Developer Fee** (`dev_fee`): The percentage fee taken by the developer.
- **PFT Token ID** (`pft_token_id`): The unique identifier for the Proof-funding Token.
- **Base Token ID** (`base_token_id`): The identifier of the token used for contributions (empty for ERG).


## Processes
The Bene: Fundraising Platform supports seven main processes:

1. **Box Creation**: 
   - Allows anyone to create a box with the specified script and parameters.
   - The box represents the project's request for funds in exchange for a specific amount of tokens.
   - The tokens in the box are provided by the box creator, that is, the project owner.

2. **Token Acquisition**: 
   - Users are allowed to exchange funds (ERGs or Base Tokens) for **Auxiliary Project Tokens (APTs)** (at the R7 exchange rate) until there are no more tokens left, even if the deadline has passed.
   - Users receive APTs in their own boxes, which adhere to token standards, making them visible and transferable through Ergo wallets.

3. **Refund Tokens**: 
   - Users are allowed to exchange APTs for funds (at the R7 exchange rate) if and only if the deadline has passed and the minimum number of tokens has not been sold.
   - This ensures that participants can retrieve their contributions if the funding goal is not met.

4. **Withdraw Funds**: 
   - Project owners are allowed to withdraw funds if and only if the minimum number of tokens has been sold.
   - Project owners can only withdraw to the address specified in `owner_ergotree`.

5. **Withdraw Unsold Tokens**:
   - Project owners are allowed to withdraw unsold PFTs from the contract at any time.
      > Where the PFTs available to amount follows the formula:
      `PFT.amount - sold_counter + refunded_counter`
   - Project owners can only withdraw to the address specified in `owner_ergotree`.

6. **Add Tokens**:
   - Project owners are allowed to add more APTs to the contract at any time.

7. **Auxiliary Exchange**:
   - Users are allowed to exchange **Auxiliary Project Tokens (APTs)** for **Proof-funding Tokens (PFTs)** if and only if the minimum number of tokens has been sold.


*The platform supports contributions in ERG or any other token on the Ergo blockchain (e.g., GAU), providing flexibility in funding options.*

## Usage

You can interact with the platform using the following webpage:

[BenefactionPlatform-Ergo](https://stabilitynexus.github.io/BenefactionPlatform-Ergo/)

## Installation Steps

1. **Clone the Repository**
Clone the repository URL and navigate to the project folder.
   ```bash
   git clone https://github.com/StabilityNexus/BenefactionPlatform-Ergo
   cd BenefactionPlatform-Ergo
   ```

2. **Set Node Version to 20**
Make sure you have Node Version Manager (nvm) installed. If not, you can install it from the official NVM repository. Once installed, switch to Node.js version 20.
   ```bash
   nvm use 20
   ```

3. **Install Dependencies**
Run the installation command to install the required dependencies for the project.
   ```bash
   npm install
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
