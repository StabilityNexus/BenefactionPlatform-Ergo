import type { Box } from '@fleet-sdk/core';
import { wait_until_confirmation } from '$lib/ergo/fetch';

// Tracks reserved boxIds used in pending transactions to avoid double-spend attempts
const pendingBoxReservations: Set<string> = new Set();

export function areBoxesReserved(inputs: Box[]): boolean {
  return inputs.some((i) => pendingBoxReservations.has(i.boxId));
}

export function reserveBoxes(inputs: Box[]): boolean {
  if (areBoxesReserved(inputs)) return false;
  for (const i of inputs) pendingBoxReservations.add(i.boxId);
  return true;
}

export function releaseBoxes(inputs: Box[]) {
  for (const i of inputs) pendingBoxReservations.delete(i.boxId);
}

export async function registerPendingTx(transactionId: string, inputs: Box[]) {
  try {
    // Wait for the transaction to be confirmed and then release reserved inputs
    await wait_until_confirmation(transactionId);
  } catch (err) {
    // If waiting fails, still ensure we release the inputs to avoid locking forever
  } finally {
    releaseBoxes(inputs);
  }
}

export function clearAllReservations() {
  pendingBoxReservations.clear();
}

export function getReservedCount(): number {
  return pendingBoxReservations.size;
}
