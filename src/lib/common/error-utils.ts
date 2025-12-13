
export function formatTransactionError(error: any): string {
    const errorMessage = error?.message || String(error);

    // Common patterns for double spending or box spent errors in Ergo/FleetSDK
    const doubleSpendKeywords = [
        "Input box already spent",
        "Double spend",
        "Box not found", // Sometimes happens if box is spent and indexer hasn't caught up
        "Inputs are not valid"
    ];

    const pendingReservationKeywords = [
        "Input box already reserved",
        "reserved by a pending transaction",
    ];

    const isDoubleSpend = doubleSpendKeywords.some(keyword =>
        errorMessage.includes(keyword)
    );

    if (isDoubleSpend) {
        return "Transaction failed due to double spending (someone else might have interacted with the box at the same time). Please try again.";
    }

    const isReserved = pendingReservationKeywords.some(keyword => errorMessage.includes(keyword));
    if (isReserved) {
        return "This action uses inputs that are part of a pending transaction. Wait for the previous transaction to confirm or refresh your balances and try again.";
    }

    return `An unexpected error occurred. Please try again or contact the community/developers on Discord or Telegram for assistance. Error details: ${errorMessage}`;
}
