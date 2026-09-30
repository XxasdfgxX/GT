/** Three rooms on one process. The browser joins through the Vite proxy. */

import { createServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { buildRoadGraph } from '../src/content/map/roads';
import { bairroSpawns } from '../src/content/spawns';
import { parseClientMessage, type StateMsg } from '../src/net/protocol';
import {
  ROOM_DEFS,
  createRoom,
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

const sockets = new WebSocketServer({ server, path: '/ws' });

sockets.on('connection', (socket, request) => {
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

  socket.on('message', (data) => {
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
    tick(room.sim, STEP);
    for (const [socket, id] of room.members) {
      const state: StateMsg = { type: 'state', ...snapshot(room.sim, id) };
      send(socket, state);
    }
  }
}, STEP * 1000);

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
