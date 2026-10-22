/** Transport limits for the room server: message size, rate, and which pages may connect. */

/** A pose is ~100 bytes. Anything near this is not a game message. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** Steady messages per second, and the burst a socket may spend at once. */
export const MESSAGE_RATE = 60;
export const MESSAGE_BURST = 120;
/** Dropped messages within the window that end the connection. */
export const FLOOD_DROPS = 240;
export const FLOOD_WINDOW = 5;

/** Bytes a socket may leave unread before the server stops sending it state. */
export const MAX_BUFFERED_BYTES = 1_000_000;
/** Seconds a socket may stay over that before it is cut. */
export const SLOW_GRACE = 5;
/** Seconds between pings. A socket that misses one pong is cut. */
export const HEARTBEAT_SECONDS = 10;

/** Open sockets per player address, and for the whole process (three rooms of 16). */
export const MAX_SOCKETS_PER_ADDRESS = 8;
export const MAX_SOCKETS = 64;

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

export interface SocketCounter {
  /** Counts the socket in when there is room for it. */
  admit(address: string): boolean;
  release(address: string): void;
}

export function createSocketCounter(
  perAddress = MAX_SOCKETS_PER_ADDRESS,
  total = MAX_SOCKETS,
): SocketCounter {
  const open = new Map<string, number>();
  let all = 0;
  return {
    admit(address) {
      const mine = open.get(address) ?? 0;
      if (mine >= perAddress || all >= total) return false;
      open.set(address, mine + 1);
      all += 1;
      return true;
    },
    release(address) {
      const mine = open.get(address) ?? 0;
      if (mine <= 0) return;
      if (mine === 1) open.delete(address);
      else open.set(address, mine - 1);
      all -= 1;
    },
  };
}

/**
 * The player's address. Only the local proxy is trusted to name it: anyone else could
 * claim a new address on every socket. The proxy appends, so its entry is the last one.
 */
export function clientAddress(remote: string | undefined, forwarded: string | undefined): string {
  const direct = remote ?? '';
  const loopback = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
  if (!loopback || !forwarded) return direct;
  return forwarded.split(',').pop()?.trim() || direct;
}
