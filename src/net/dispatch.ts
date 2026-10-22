/** Admits one socket to a room and routes its messages. The ws server wires it; tests use fakes. */

import { createBucket, type SocketCounter } from './limits';
import { parseClientMessage } from './protocol';
import {
  join,
  leave,
  pushEnter,
  pushExit,
  pushPickup,
  pushPose,
  pushPunch,
  snapshot,
  type Room,
} from './room';

/** What the room server needs from a socket. */
export interface PlayerSocket {
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

export interface LiveRoom<S> {
  sim: Room;
  members: Map<S, number>;
}

export interface Arrival {
  /** Request path with query: `/ws?room=...&name=...&spawn=...`. */
  url: string;
  /** The player's address, as `clientAddress` resolved it. */
  address: string;
}

export interface Session {
  /** One text frame from the socket. */
  message(text: string): void;
  /** The socket closed or failed. Safe to call more than once. */
  closed(): void;
}

/**
 * Lets the socket in, or tells it why not and closes it (null). `now` is seconds on a
 * steady clock, for the message bucket.
 */
export function connect<S extends PlayerSocket>(
  socket: S,
  arrival: Arrival,
  rooms: ReadonlyMap<string, LiveRoom<S>>,
  counter: SocketCounter,
  now: () => number,
): Session | null {
  const refuse = (message: string) => {
    socket.send(JSON.stringify({ type: 'error', message }));
    socket.close();
    return null;
  };
  if (!counter.admit(arrival.address)) return refuse('Conexões demais');
  let counted = true;
  const release = () => {
    if (!counted) return;
    counted = false;
    counter.release(arrival.address);
  };

  const url = new URL(arrival.url, 'http://127.0.0.1');
  const room = rooms.get(url.searchParams.get('room') ?? '');
  if (!room) {
    release();
    return refuse('Sala desconhecida');
  }
  const id = join(
    room.sim,
    url.searchParams.get('name') ?? '',
    url.searchParams.get('spawn') ?? '',
  );
  if (id === null) {
    release();
    return refuse('Sala cheia');
  }
  room.members.set(socket, id);
  const spawned = snapshot(room.sim, id).self;
  socket.send(
    JSON.stringify({
      type: 'welcome',
      id,
      x: spawned.place.x,
      y: spawned.place.y,
      z: spawned.place.z,
      placeSerial: spawned.placeSerial,
    }),
  );

  const bucket = createBucket();
  return {
    message(text) {
      const verdict = bucket.take(now());
      if (verdict === 'close') {
        socket.close(1008, 'Mensagens demais');
        return;
      }
      if (verdict === 'drop') return;
      const message = parseClientMessage(text);
      if (!message) return;
      if (message.type === 'pose') pushPose(room.sim, id, message);
      else if (message.type === 'punch') pushPunch(room.sim, id, message);
      else if (message.type === 'pickup') pushPickup(room.sim, id, message.id);
      else if (message.type === 'enter') pushEnter(room.sim, id, message.id);
      else pushExit(room.sim, id);
    },
    closed() {
      release();
      if (!room.members.delete(socket)) return;
      leave(room.sim, id);
    },
  };
}
