/** Three rooms on one process. The browser joins through the Vite proxy. */

import { createServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { buildRoadGraph } from '../src/content/map/roads';
import { bairroSpawns } from '../src/content/spawns';
import {
  HEARTBEAT_SECONDS,
  MAX_BUFFERED_BYTES,
  MAX_MESSAGE_BYTES,
  SLOW_GRACE,
  clientAddress,
  createSocketCounter,
  originAllowed,
} from '../src/net/limits';
import { connect, type LiveRoom } from '../src/net/dispatch';
import { ROOM_DEFS, createRoom, encodeStates, listing, tick } from '../src/net/room';

const PORT = 8787;
const STEP = 1 / 20;

const graph = buildRoadGraph();
const spawns = bairroSpawns(graph);

const rooms = new Map<string, LiveRoom<WebSocket>>();
for (const def of ROOM_DEFS) {
  rooms.set(def.id, {
    sim: createRoom({
      id: def.id,
      name: def.name,
      spawns,
      nodes: graph.nodes,
      edges: graph.edges,
      rng: Math.random,
    }),
    members: new Map(),
  });
}

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0];
  if (req.method === 'GET' && path === '/rooms') {
    const body = JSON.stringify([...rooms.values()].map((room) => listing(room.sim)));
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});

const sockets = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: MAX_MESSAGE_BYTES,
  verifyClient: ({ origin }: { origin?: string }) =>
    originAllowed(origin, process.env['BAIRRO_ORIGINS']),
});

const counter = createSocketCounter();
/** Cleared on each ping, set again by the pong. */
const answered = new WeakMap<WebSocket, boolean>();
/** When a socket first fell behind on reading its state, in seconds. */
const slowSince = new WeakMap<WebSocket, number>();

sockets.on('connection', (socket, request) => {
  const forwarded = request.headers['x-forwarded-for'];
  const address = clientAddress(
    request.socket.remoteAddress,
    Array.isArray(forwarded) ? forwarded.join(',') : forwarded,
  );
  const session = connect(
    socket,
    { url: request.url ?? '/', address },
    rooms,
    counter,
    () => performance.now() / 1000,
  );
  if (!session) return;
  answered.set(socket, true);
  socket.on('pong', () => {
    answered.set(socket, true);
  });
  socket.on('message', (data) => {
    session.message(textOf(data));
  });
  const closed = () => {
    session.closed();
  };
  socket.on('close', closed);
  socket.on('error', closed);
});

setInterval(() => {
  for (const room of rooms.values()) {
    // Nobody to see it: the crowd and traffic wait until someone joins.
    if (room.members.size === 0) continue;
    tick(room.sim, STEP);
    const states = encodeStates(room.sim, room.members.values());
    const now = performance.now() / 1000;
    for (const [socket, id] of room.members) {
      const state = states.get(id);
      if (state === undefined || socket.readyState !== WebSocket.OPEN) continue;
      // A client that stops reading would grow this buffer without end.
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        const since = slowSince.get(socket) ?? now;
        slowSince.set(socket, since);
        if (now - since > SLOW_GRACE) socket.terminate();
        continue;
      }
      slowSince.delete(socket);
      socket.send(state);
    }
  }
}, STEP * 1000);

// A half-open socket never fires close. Without a pong it would hold its slot forever.
const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (answered.get(socket) === false) {
      socket.terminate();
      continue;
    }
    answered.set(socket, false);
    socket.ping();
  }
}, HEARTBEAT_SECONDS * 1000);
sockets.on('close', () => {
  clearInterval(heartbeat);
});

server.listen(PORT, '127.0.0.1', () => {
  console.info(`[bairro] salas em http://127.0.0.1:${PORT}`);
});

function textOf(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
