# Benefaction Platform

## Overview
Benefaction Platform is a decentralized application (DApp) that enables projects to receive funding in exchange for participation tokens. This DApp allows projects to request ERGs (the native cryptocurrency of the Ergo blockchain) in exchange for participation tokens.

### How it Works
- Projects can create a box that holds a specific amount of tokens, setting a **block limit** as a deadline.
- A **minimum amount of tokens** must be sold before the project can withdraw funds. This ensures that the project receives sufficient backing.
- If all tokens are "sold" (exchanged for ERGs) before reaching the block limit, the project can withdraw the funds.
- If the block limit is reached before all tokens are sold, users have the option to exchange their tokens back for the corresponding ERGs, provided the minimum has not been reached.
- The main box is self-replicating, meaning that anyone can spend the box as long as they re-create it with the same parameters and add ERGs in exchange for a specified amount of tokens.

## Parameters of a Box
A box created by a project will have the following parameters:

- **Amount of Tokens**: Represents the number of participation tokens available.
- **Block limit (R5)**: The block height limit by which users can purchase tokens.
- **ERGs / Token (R6)**: The exchange rate of ERG per token.
- **Project address (R7)**: The address where the project's funds will be sent if all tokens are sold.
- **Project link (R8)**: A link to the project's information (e.g., GitHub repository).
- **Minimum Tokens Sold (R9)**: The minimum number of tokens that must be sold before the project owners can withdraw funds.

These parameters ensure that the box remains consistent throughout the funding process and allows for transparency in the exchange process.

## Processes
The Benefaction Platform supports four main processes:

1. **Box Creation**: 
   - Allows anyone to create a box with the specified script and parameters.
   - The box represents the project's request for funds in exchange for a specific amount of tokens.
   
2. **Token Acquisition**: 
   - Enables users to obtain tokens by exchanging ERGs with the project.
   - Users receive tokens in their own boxes, which adhere to the standards for tokens, making them visible and transferable through wallets like Nautilus.

3. **Refund tokens**: 
   - If the project fails to sell all tokens before the block limit, users can exchange their tokens back for the equivalent amount of ERG from the main box.
   - This ensures that participants can retrieve their contributions if the funding goal isn't met.

4. **Withdraw ERGs**: 
   - Allows the project to withdraw all ERGs from the main box only if the minimum amount of tokens has been sold.
   - If the block limit hasn't been reached and all tokens have been sold, the funds are sent to the project's address specified in R7, completing the funding process.

5. **Withdraw Unsold Tokens**:
   - Allows project to withdraw unsold tokens after the block limit has passed.

In addition to the current functionality, a more advanced implementation could include support for other assets beyond ERG. For example, projects could request **GAU** or other tokens on Ergo. This would provide even more flexibility in terms of the types of contributions a project can receive and enable a broader range of funding options for projects and participants.
