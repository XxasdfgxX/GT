import { describe, expect, it } from 'vitest';
import { connect, type LiveRoom, type PlayerSocket } from '../net/dispatch';
import { MESSAGE_BURST, createSocketCounter } from '../net/limits';
import { createRoom } from '../net/room';

class FakeSocket implements PlayerSocket {
  sent: Array<{ type: string; message?: string }> = [];
  closedWith: number | null = null;
  send(text: string): void {
    this.sent.push(JSON.parse(text) as { type: string; message?: string });
  }
  close(code = 1000): void {
    this.closedWith = code;
  }
}

function rooms(maxPlayers = 4): Map<string, LiveRoom<FakeSocket>> {
  const sim = createRoom({
    id: 'costa-1',
    name: 'Costa 1',
    spawns: [{ name: 'centro', x: 0, y: 2, z: 0 }],
    nodes: [],
    edges: [],
    rng: () => 0.5,
    npcCount: 0,
    carCount: 0,
    maxPlayers,
  });
  return new Map([['costa-1', { sim, members: new Map() }]]);
}

const arrival = (room: string, address = '203.0.113.9') => ({
  url: `/ws?room=${room}&name=Ana`,
  address,
});

describe('connecting to the room server', () => {
  it('welcomes a player into a room it knows', () => {
    const live = rooms();
    const socket = new FakeSocket();
    const session = connect(socket, arrival('costa-1'), live, createSocketCounter(), () => 0);
    expect(session).not.toBeNull();
    expect(socket.sent[0]?.type).toBe('welcome');
    expect(live.get('costa-1')?.members.size).toBe(1);
  });

  it('turns away an unknown room and a full one, and gives their slots back', () => {
    const live = rooms(1);
    const counter = createSocketCounter(2, 10);
    const lost = new FakeSocket();
    expect(connect(lost, arrival('nowhere'), live, counter, () => 0)).toBeNull();
    expect(lost.sent[0]?.message).toBe('Sala desconhecida');
    expect(lost.closedWith).not.toBeNull();
    connect(new FakeSocket(), arrival('costa-1'), live, counter, () => 0);
    const late = new FakeSocket();
    expect(connect(late, arrival('costa-1'), live, counter, () => 0)).toBeNull();
    expect(late.sent[0]?.message).toBe('Sala cheia');
    // Both refusals released their count: the address still has a slot.
    expect(counter.admit('203.0.113.9')).toBe(true);
  });

  it('caps sockets per address', () => {
    const live = rooms(8);
    const counter = createSocketCounter(2, 10);
    connect(new FakeSocket(), arrival('costa-1'), live, counter, () => 0);
    connect(new FakeSocket(), arrival('costa-1'), live, counter, () => 0);
    const third = new FakeSocket();
    expect(connect(third, arrival('costa-1'), live, counter, () => 0)).toBeNull();
    expect(third.sent[0]?.message).toBe('Conexões demais');
    const elsewhere = new FakeSocket();
    expect(
      connect(elsewhere, arrival('costa-1', '198.51.100.4'), live, counter, () => 0),
    ).not.toBeNull();
  });

  it('closes a socket that floods, and leaves the room on close', () => {
    const live = rooms();
    const counter = createSocketCounter(1, 10);
    const socket = new FakeSocket();
    const session = connect(socket, arrival('costa-1'), live, counter, () => 0);
    for (let n = 0; n < MESSAGE_BURST + 400 && socket.closedWith === null; n += 1) {
      session?.message('{"type":"exit"}');
    }
    expect(socket.closedWith).toBe(1008);
    session?.closed();
    session?.closed();
    expect(live.get('costa-1')?.members.size).toBe(0);
    expect(live.get('costa-1')?.sim.players).toHaveLength(0);
    expect(counter.admit('203.0.113.9')).toBe(true);
  });
});
