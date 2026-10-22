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
  createBucket,
  createSocketCounter,
  originAllowed,
} from '../src/net/limits';
import { parseClientMessage } from '../src/net/protocol';
import {
  ROOM_DEFS,
  createRoom,
  encodeStates,
  join,
  leave,
  listing,
  pushEnter,
  pushExit,
  pushPickup,
  pushPose,
  pushPunch,
  snapshot,
  tick,
  type Room,
} from '../src/net/room';

const PORT = 8787;
const STEP = 1 / 20;

const graph = buildRoadGraph();
const spawns = bairroSpawns(graph);

interface LiveRoom {
  sim: Room;
  members: Map<WebSocket, number>;
}

const rooms = new Map<string, LiveRoom>();
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
  if (!counter.admit(address)) {
    send(socket, { type: 'error', message: 'Conexões demais' });
    socket.close();
    return;
  }
  socket.on('close', () => {
    counter.release(address);
  });
  answered.set(socket, true);
  socket.on('pong', () => {
    answered.set(socket, true);
  });

  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const roomId = url.searchParams.get('room') ?? '';
  const room = rooms.get(roomId);
  if (!room) {
    send(socket, { type: 'error', message: 'Sala desconhecida' });
    socket.close();
    return;
  }
  const id = join(
    room.sim,
    url.searchParams.get('name') ?? '',
    url.searchParams.get('spawn') ?? '',
  );
  if (id === null) {
    send(socket, { type: 'error', message: 'Sala cheia' });
    socket.close();
    return;
  }
  room.members.set(socket, id);
  const spawned = snapshot(room.sim, id).self;
  send(socket, {
    type: 'welcome',
    id,
    x: spawned.place.x,
    y: spawned.place.y,
    z: spawned.place.z,
    placeSerial: spawned.placeSerial,
  });

  const bucket = createBucket();
  socket.on('message', (data) => {
    const verdict = bucket.take(performance.now() / 1000);
    if (verdict === 'close') {
      socket.close(1008, 'Mensagens demais');
      return;
    }
    if (verdict === 'drop') return;
    const message = parseClientMessage(textOf(data));
    if (!message) return;
    if (message.type === 'pose') pushPose(room.sim, id, message);
    else if (message.type === 'punch') pushPunch(room.sim, id, message);
    else if (message.type === 'pickup') pushPickup(room.sim, id, message.id);
    else if (message.type === 'enter') pushEnter(room.sim, id, message.id);
    else pushExit(room.sim, id);
  });

  const drop = () => {
    if (!room.members.delete(socket)) return;
    leave(room.sim, id);
  };
  socket.on('close', drop);
  socket.on('error', drop);
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

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function textOf(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
