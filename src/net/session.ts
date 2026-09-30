/** Browser socket for one room. The menu waits on the welcome pose. */

import type { NetLink, NetPose, NetPunch, NetSnapshot } from '../engine/core/context';
import { parseServerMessage, type ClientMsg, type StateMsg, type WelcomeMsg } from './protocol';

export interface Connected {
  link: NetLink;
  welcome: WelcomeMsg;
}

export function connectRoom(roomId: string, playerName = ''): Promise<Connected> {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ room: roomId, name: playerName });
  const socket = new WebSocket(`${protocol}//${location.host}/ws?${query}`);
  let latest: StateMsg | null = null;
  let settled = false;

  return new Promise((resolve, reject) => {
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error(message));
    };

    socket.addEventListener('error', () => {
      fail('Não foi possível entrar na sala');
    });
    socket.addEventListener('close', () => {
      fail('Não foi possível entrar na sala');
    });
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === 'error') {
        fail(message.message);
        return;
      }
      if (message.type === 'welcome') {
        if (settled) return;
        settled = true;
        resolve({ link: bind(socket, message.id, () => latest), welcome: message });
        return;
      }
      latest = message;
    });
  });
}

function bind(socket: WebSocket, selfId: number, read: () => StateMsg | null): NetLink {
  const send = (payload: ClientMsg) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  };
  return {
    selfId,
    sendPose(pose: NetPose) {
      send({ type: 'pose', ...pose });
    },
    sendPunch(punch: NetPunch) {
      send({ type: 'punch', ...punch });
    },
    sendPickup(id: number) {
      send({ type: 'pickup', id });
    },
    sendEnter(id: number) {
      send({ type: 'enter', id });
    },
    sendExit() {
      send({ type: 'exit' });
    },
    state(): NetSnapshot | null {
      return read();
    },
    close() {
      socket.close();
    },
  };
}
