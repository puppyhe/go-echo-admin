import type { Receipt } from './types';

export function normalizeCC(ids: number[] | undefined): number[] | undefined {
  if (!ids?.length) return undefined;
  if (ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new Error('Select at most 100 users with valid positive IDs');
  return [...new Set(ids)];
}
export function unreadOwnReceipts(receipts: Receipt[] | undefined, userId: number): Receipt[] {
  return (receipts ?? []).filter((receipt) => receipt.userId === userId && !receipt.readAt);
}
