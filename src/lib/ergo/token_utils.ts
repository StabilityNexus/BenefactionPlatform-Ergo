/**
 * Utility functions for multi-token support in the Benefaction Platform
 */

import { type Project } from "../common/project";
import { fetch_token_details } from "./fetch";

/**
 * Validates if the user has sufficient base tokens for a contribution
 * @param project The project to contribute to
 * @param tokenAmount The amount of PFT tokens to buy
 * @param userBoxes The user's available UTXOs
 * @returns Promise<boolean> indicating if user has sufficient base tokens
 */
export async function validateBaseTokenBalance(
  project: Project,
  tokenAmount: number,
  userBoxes: any[]
): Promise<{ valid: boolean; requiredAmount: number; availableAmount: number }> {
  const isERGBase = !project.base_token_id || project.base_token_id === "";
  const requiredBaseTokenAmount = tokenAmount * project.exchange_rate;

  if (isERGBase) {
    // For ERG, check total ERG value across all boxes
    const totalERG = userBoxes.reduce((sum, box) => sum + box.value, 0);
    return {
      valid: totalERG >= requiredBaseTokenAmount,
      requiredAmount: requiredBaseTokenAmount,
      availableAmount: totalERG,
    };
  } else {
    // For tokens, check specific token balance
    let availableTokenAmount = 0;
    for (const box of userBoxes) {
      for (const asset of box.assets || []) {
        if (asset.tokenId === project.base_token_id) {
          availableTokenAmount += Number(asset.amount);
        }
      }
    }

    return {
      valid: availableTokenAmount >= requiredBaseTokenAmount,
      requiredAmount: requiredBaseTokenAmount,
      availableAmount: availableTokenAmount,
    };
  }
}

/**
 * Gets the display name and symbol for a base token
 * @param baseTokenId The base token ID (empty string for ERG)
 * @returns Promise with token display information
 */
export async function getBaseTokenDisplayInfo(baseTokenId: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
}> {
  if (!baseTokenId || baseTokenId === "") {
    return {
      name: "Ergo",
      symbol: "ERG",
      decimals: 9,
    };
  }

  try {
    const tokenDetails = await fetch_token_details(baseTokenId);
    return {
      name: tokenDetails.name,
      symbol: tokenDetails.name, // Assuming name is used as symbol
      decimals: tokenDetails.decimals,
    };
  } catch (error) {
    console.warn(`Failed to fetch token details for ${baseTokenId}:`, error);
    return {
      name: `Token ${baseTokenId.slice(0, 8)}...`,
      symbol: "TOKEN",
      decimals: 0,
    };
  }
}

/**
 * Formats a base token amount for display
 * @param amount The raw token amount
 * @param decimals The number of decimals for the token
 * @param symbol The token symbol
 * @returns Formatted string for display
 */
export function formatBaseTokenAmount(amount: number, decimals: number, symbol: string): string {
  const displayAmount = amount / Math.pow(10, decimals);
  return `${displayAmount.toLocaleString()} ${symbol}`;
}

/**
 * Calculates the exchange rate display text
 * @param project The project
 * @returns Promise with formatted exchange rate text
 */
export async function getExchangeRateDisplay(project: Project): Promise<string> {
  const baseTokenInfo = await getBaseTokenDisplayInfo(project.base_token_id);
  const baseTokenAmount = formatBaseTokenAmount(
    project.exchange_rate,
    baseTokenInfo.decimals,
    baseTokenInfo.symbol
  );

  return `1 PFT = ${baseTokenAmount}`;
}
