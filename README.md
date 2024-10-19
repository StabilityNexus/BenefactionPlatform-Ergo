# Benefaction Platform

## Overview
Benefaction Platform is a decentralized application (DApp) that enables projects to receive funding in exchange for participation tokens. This DApp allows projects to request ERGs (the native cryptocurrency of the Ergo blockchain) in exchange for participation tokens.

### How it Works
- Project owners can create a box that holds an amount of tokens, la cual puede variar, setting a **block limit** as a deadline.
- A minimum amount of tokens must be sold before the project can withdraw funds. This ensures that the project receives sufficient backing.
- If the block limit is reached before minimum amount of tokens are sold, users have the option to exchange their tokens back for the corresponding ERGs, provided the minimum has not been reached.
- The main box is self-replicating, meaning that anyone can spend the box as long as they re-create it with the same parameters and add ERGs in exchange for a specified amount of tokens.

## Parameters of a Box
A box created by a project will have the following parameters:

- **Amount of Tokens**: Represents the number of participation tokens available.
- **Block Limit (R4)**: The block height limit until which withdrawal or refund is allowed.
- **Minimum Tokens Sold (R5)**: A tuple representing the minimum amount of tokens that must be sold as required by the contract to enable withdrawals, along with a token sale counter.
- **ERGs / Token (R6)**: The exchange rate of ERG per token.
- **Withdrawal Address (R7)**: The address where the funds can be withdrawn if the conditions are met, specified by the SHA-256 hash of the proposition bytes.
- **Developer Fee (R8)**: A tuple representing the percentage fee for the developers and the address to which it will be sent, specified by its proposition bytes.
- **Project Link/Hash (R9)**: A link or hash containing the project's information (e.g., GitHub repository).

These parameters ensure that the box remains consistent throughout the funding process and allows for transparency in the exchange process.

## Processes
The Benefaction Platform supports six main processes:

1. **Box Creation**: 
   - Allows anyone to create a box with the specified script and parameters.
   - The box represents the project's request for funds in exchange for a specific amount of tokens.
   - The tokens of the box are provided by the box creator, that is, the project owner.
   
2. **Token Acquisition**: 
   - People should be allowed to exchange ERGs for tokens (at the R6 exchange rate) until there are no more tokens left (even if the deadline has passed).
   - People receive tokens in their own boxes, which adhere to the standards for tokens, making them visible and transferable through wallets like Nautilus.

3. **Refund tokens**: 
   - People should be allowed to exchange tokens for ERGs (at the R6 exchange rate) if and only if the deadline has passed and the minimum number of tokens has not been sold.
   - This ensures that participants can retrieve their contributions if the funding goal isn't met.

4. **Withdraw ERGs**: 
   - Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
   - Project owners can only withdraw to the address specified in R7.

5. **Withdraw Unsold Tokens**:
   - Project owners may withdraw unsold tokens from the contract at any time.
   - Project owners can only withdraw to the address specified in R7.

6. **Add Tokens**:
   - Project owners may add more tokens to the contract at any time.


In addition to the current functionality, a more advanced implementation could include support for other assets beyond ERG. For example, projects could request **GAU** or other tokens on Ergo. This would provide even more flexibility in terms of the types of contributions a project can receive and enable a broader range of funding options for projects and participants.