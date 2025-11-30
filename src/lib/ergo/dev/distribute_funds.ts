import { OutputBuilder, TransactionBuilder } from "@fleet-sdk/core";
import { get_dev_contract_address } from "./dev_contract";
import { ErgoPlatform } from "../platform";

export async function distributeFunds(
  box: any,
  brunoAddress: string,
  lgdAddress: string,
  jmAddress: string,
  orderAddress: string,
  brunoShare: number,
  lgdShare: number,
  jmShare: number,
  orderShare: number,
  totalAmount: number,
  tokenId?: string
): Promise<string | null> {
  try {
    await new ErgoPlatform().connect();

    const minerFeeAmount = 1100000;
    const isTokenDistribution = !!tokenId;
    const SAFE_MIN_BOX_VALUE = 1000000; // Minimum ERG for token boxes

    // For token distributions we already needed wallet UTXOs to cover ERG for outputs.
    // The executor pays miner fee, so include wallet UTXOs when available for both ERG and token distributions.
    let inputs = [box];
    if (typeof window !== "undefined" && (window as any).ergo) {
      const walletUtxos = await (window as any).ergo!.get_utxos();
      // prepend wallet utxos so that they can cover miner fee / additional ERG if needed
      inputs = [box, ...walletUtxos];
    } else {
      // If token distribution and no wallet available, we cannot provide the extra ERG for outputs
      if (isTokenDistribution) {
        throw new Error(
          "Token distribution requires a connected wallet to provide ERG for outputs and fees."
        );
      }
    }

    // IMPORTANT: Do NOT subtract miner fee from totalAmount.
    // The miner fee will be paid by the executor (wallet) using the extra inputs we added above.

    // Calculate individual shares from the full totalAmount (no fee subtraction)
    const brunoAmount = Math.floor((brunoShare / 100) * totalAmount);
    const lgdAmount = Math.floor((lgdShare / 100) * totalAmount);
    const jmAmount = Math.floor((jmShare / 100) * totalAmount);
    const orderAmount = Math.floor((orderShare / 100) * totalAmount);

    const calculatedTotal = brunoAmount + lgdAmount + jmAmount + orderAmount;

    if (totalAmount !== calculatedTotal) {
      console.log("Invalid shares: The total amount does not match the sum of calculated shares.");
      console.log("Total amount: " + totalAmount);
      console.log("Calculated total: " + calculatedTotal);
      console.log("Bruno amount: " + brunoAmount);
      console.log("LGD amount: " + lgdAmount);
      console.log("JM amount: " + jmAmount);
      console.log("Order amount: " + orderAmount);
      throw new Error(
        `Invalid shares: The total amount (${totalAmount}) does not match the sum of calculated shares (${calculatedTotal}). Details: Bruno (${brunoAmount}), LGD (${lgdAmount}), JM (${jmAmount}), Order (${orderAmount}).`
      );
    }

    // Ensure valid distribution
    if (orderAmount < 0) {
      console.log("Invalid distribution: total shares exceed 100%");
      console.log("Total amount: " + totalAmount);
      console.log("Bruno: " + brunoAmount);
      console.log("LGD: " + lgdAmount);
      console.log("JM: " + jmAmount);
      console.log("Order: " + orderAmount);
      throw new Error("Invalid distribution: total shares exceed 100%");
    }

    // Build outputs for each recipient
    const outputs = [];

    if (isTokenDistribution) {
      // Token distribution - each output needs minimum ERG + tokens
      outputs.push(
        new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), brunoAddress).addTokens({
          tokenId,
          amount: BigInt(brunoAmount),
        })
      );
      outputs.push(
        new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), lgdAddress).addTokens({
          tokenId,
          amount: BigInt(lgdAmount),
        })
      );
      outputs.push(
        new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), jmAddress).addTokens({
          tokenId,
          amount: BigInt(jmAmount),
        })
      );
      outputs.push(
        new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), orderAddress).addTokens({
          tokenId,
          amount: BigInt(orderAmount),
        })
      );
    } else {
      // ERG distribution - outputs are the raw ERG amounts (miner fee NOT subtracted)
      outputs.push(new OutputBuilder(BigInt(brunoAmount), brunoAddress));
      outputs.push(new OutputBuilder(BigInt(lgdAmount), lgdAddress));
      outputs.push(new OutputBuilder(BigInt(jmAmount), jmAddress));
      outputs.push(new OutputBuilder(BigInt(orderAmount), orderAddress));
    }

    // Get wallet address for change. If wallet is present, send change back to wallet (executor pays fee).
    // Otherwise fallback to dev contract address.
    const changeAddress =
      typeof window !== "undefined" && (window as any).ergo
        ? await (window as any).ergo!.get_change_address()
        : get_dev_contract_address();

    // Build and sign the transaction
    const unsignedTransaction = await new TransactionBuilder(
      await (window as any).ergo!.get_current_height()
    )
      .from(inputs)
      .to(outputs)
      .payFee(BigInt(minerFeeAmount))
      .sendChangeTo(changeAddress) // change goes to wallet if available (executor), otherwise dev contract
      .build()
      .toEIP12Object();

    const signedTransaction = await (window as any).ergo!.sign_tx(unsignedTransaction);

    // Submit the transaction
    const transactionId = await (window as any).ergo!.submit_tx(signedTransaction);

    console.log("Transaction ID:", transactionId);
    return transactionId;
  } catch (error) {
    console.error("Error distributing funds:", error);
    return null;
  }
}
