/** Shared cash rules. Solo and multiplayer both call these. */

export const NPC_DROP = 10;
export const PICKUP_REACH = 1.5;
export const RESPAWN_DELAY = 1;
/** How long a dead body stays on the ground. */
export const CORPSE_TIME = 60;
/** Seconds an uncollected drop stays on the street. */
export const DROP_LIFETIME = 60;
/** Live drops at once. The oldest goes first. */
export const MAX_DROPS = 64;

export function addCash(balance: number, amount: number): number {
  if (amount <= 0) return balance;
  return balance + amount;
}

export function spendCash(balance: number, cost: number): { ok: boolean; balance: number } {
  if (cost <= 0 || balance < cost) return { ok: false, balance };
  return { ok: true, balance: balance - cost };
}

export function dropCash(balance: number): { dropped: number; balance: number } {
  if (balance <= 0) return { dropped: 0, balance: 0 };
  return { dropped: balance, balance: 0 };
}

export function formatCash(amount: number): string {
  return `$ ${Math.max(0, Math.floor(amount))}`;
}
