# Bene: Fundraising Platform

![Logo](static/favicon.png)

## Overview
Bene: Proof-of-Funding Fundraising Platform is a decentralized application (DApp) that enables projects to receive funding in exchange for participation tokens. This DApp allows projects to request ERGs (the native cryptocurrency of the Ergo blockchain) in exchange for participation tokens.

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
- If the block limit is reached before minimum amount of tokens are sold, users have the option to exchange their tokens back for the corresponding ERGs, provided the minimum has not been reached.
- The main box is self-replicating, meaning that anyone can spend the box as long as they re-create it with the same parameters and add ERGs in exchange for a specified amount of tokens.

## Parameters of a Box

- **Block Limit (R4)**: The block height limit until withdrawal or refund is allowed.
- **Minimum Tokens Sold (R5)**: The minimum number of tokens that need to be sold to enable withdrawals or refunds.
- **Token Sold Counter (R6)**: Collection of three Long with: the amount of tokens that have already been sold and the amount of that have already been refunded and the amount of ADP that have been changed per PFT.
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
The Bene: Fundraising Platform supports seven main processes:

1. **Box Creation**: 
   - Allows anyone to create a box with the specified script and parameters.
   - The box represents the project's request for funds in exchange for a specific amount of tokens.
   - The tokens in the box are provided by the box creator, that is, the project owner.

2. **Token Acquisition**: 
   - Users are allowed to exchange ERGs for **Auxiliary Project Tokens (APTs)** (at the R7 exchange rate) until there are no more tokens left, even if the deadline has passed.
   - Users receive APTs in their own boxes, which adhere to token standards, making them visible and transferable through Ergo wallets.

3. **Refund Tokens**: 
   - Users are allowed to exchange APTs for ERGs (at the R7 exchange rate) if and only if the deadline has passed and the minimum number of tokens has not been sold.
   - This ensures that participants can retrieve their contributions if the funding goal is not met.

4. **Withdraw ERGs**: 
   - Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
   - Project owners can only withdraw to the address specified in `owner_addr`.

5. **Withdraw Unsold Tokens**:
   - Project owners are allowed to withdraw unsold PFTs from the contract at any time.
      > Where the PFTs available to amount follows the formula:
      `PFT.amount - sold_counter + refunded_counter`
   - Project owners can only withdraw to the address specified in `owner_addr`.

6. **Add Tokens**:
   - Project owners are allowed to add more APTs to the contract at any time.

7. **Auxiliary Exchange**:
   - Users are allowed to exchange **Auxiliary Project Tokens (APTs)** for **Proof-funding Tokens (PFTs)** if and only if the minimum number of tokens has been sold.


*In addition to the current functionality, a more advanced implementation could include support for other assets beyond ERG. For example, projects could request **GAU** or other tokens on Ergo. This would provide even more flexibility in terms of the types of contributions a project can receive and enable a broader range of funding options for projects and participants.*

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
