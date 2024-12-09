# Bene: Fundraising Platform

## Overview
Bene: Fundraising Platform is a decentralized application (DApp) that enables projects to receive funding in exchange for participation tokens. This DApp allows projects to request ERGs (the native cryptocurrency of the Ergo blockchain) in exchange for participation tokens.

### How it Works
- Project owners can create a box that holds an amount of tokens, which may vary, setting a **block limit** as a deadline.
- A minimum amount of tokens must be sold before the project can withdraw funds. This ensures that the project receives sufficient backing.
- If the block limit is reached before minimum amount of tokens are sold, users have the option to exchange their tokens back for the corresponding ERGs, provided the minimum has not been reached.
- The main box is self-replicating, meaning that anyone can spend the box as long as they re-create it with the same parameters and add ERGs in exchange for a specified amount of tokens.

## Parameters of a Box

- **Block Limit (R4)**: The block height limit until withdrawal or refund is allowed.
- **Minimum Tokens Sold (R5)**: The minimum number of tokens that need to be sold to enable withdrawals or refunds.
- **Token Sold Counter (R6)**: Pair with: the amount of tokens that have already been sold and the amount of that have already been refunded.
- **ERG/Token Exchange Rate (R7)**: The exchange rate of ERGs per token.
- **Contract Metadata (R8)**: Contains a JSON-formatted string with the contract owner's base58 address, the developer's base58 address, and the developer fee as a percentage. This information is included to allow rebuilding the contract with constants.
- **Project Content (R9)**: Contains a JSON-formatted string with details about the project, such as its title, description, and other related information.

### Constants

The following constants are defined in the contract:

- **Owner Address** (`owner_addr`): The base58 address of the contract owner.
- **Developer Address** (`dev_addr`): The base58 address of the developer.
- **Developer Fee** (`dev_fee`): The percentage fee taken by the developer (e.g., `5` for 5%).
- **Token ID** (`token_id`): The unique identifier string for the token being distributed.


## Processes
The Bene: Fundraising Platform supports six main processes:

1. **Box Creation**: 
   - Allows anyone to create a box with the specified script and parameters.
   - The box represents the project's request for funds in exchange for a specific amount of tokens.
   - The tokens of the box are provided by the box creator, that is, the project owner.
   
2. **Token Acquisition**: 
   - People should be allowed to exchange ERGs for tokens (at the R7 exchange rate) until there are no more tokens left (even if the deadline has passed).
   - People receive tokens in their own boxes, which can adhere to the standards for tokens, making them visible and transferable through wallets like Nautilus.

3. **Refund tokens**: 
   - People should be allowed to exchange tokens for ERGs (at the R7 exchange rate) if and only if the deadline has passed and the minimum number of tokens has not been sold.
   - This ensures that participants can retrieve their contributions if the funding goal isn't met.

4. **Withdraw ERGs**: 
   - Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
   - Project owners can only withdraw to the address specified in owner_addr.

5. **Withdraw Unsold Tokens**:
   - Project owners may withdraw unsold tokens from the contract at any time.
   - Project owners can only withdraw to the address specified in owner_addr.

6. **Add Tokens**:
   - Project owners may add more tokens to the contract at any time.

In addition to the current functionality, a more advanced implementation could include support for other assets beyond ERG. For example, projects could request **GAU** or other tokens on Ergo. This would provide even more flexibility in terms of the types of contributions a project can receive and enable a broader range of funding options for projects and participants.

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
