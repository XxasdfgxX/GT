/** Transport limits for the room server: message size, rate, and which pages may connect. */

/** A pose is ~100 bytes. Anything near this is not a game message. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** Steady messages per second, and the burst a socket may spend at once. */
export const MESSAGE_RATE = 60;
export const MESSAGE_BURST = 120;
/** Dropped messages within the window that end the connection. */
export const FLOOD_DROPS = 240;
export const FLOOD_WINDOW = 5;

/** Vite's dev page. `BAIRRO_ORIGINS` adds more, comma separated. */
export const DEFAULT_ORIGINS = ['http://localhost:6969', 'http://127.0.0.1:6969'];

export type Verdict = 'ok' | 'drop' | 'close';

export interface MessageBucket {
  /** `now` is seconds on any steady clock. */
  take(now: number): Verdict;
}

export function createBucket(
  rate = MESSAGE_RATE,
  burst = MESSAGE_BURST,
  floodDrops = FLOOD_DROPS,
  floodWindow = FLOOD_WINDOW,
): MessageBucket {
  let tokens = burst;
  let last: number | null = null;
  let windowStart = 0;
  let drops = 0;
  return {
    take(now) {
      if (last !== null) tokens = Math.min(burst, tokens + (now - last) * rate);
      last = now;
      if (tokens >= 1) {
        tokens -= 1;
        return 'ok';
      }
      if (now - windowStart > floodWindow) {
        windowStart = now;
        drops = 0;
      }
      drops += 1;
      return drops >= floodDrops ? 'close' : 'drop';
    },
  };
}

/**
 * Browsers always send Origin on a WebSocket, so a page the player has open elsewhere
 * cannot join a room. Tools without a browser send none and are let through.
 */
export function originAllowed(origin: string | undefined, extra: string | undefined): boolean {
  if (origin === undefined || origin === '') return true;
  const allowed = [
    ...DEFAULT_ORIGINS,
    ...(extra ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ];
  return allowed.includes(origin);
}
