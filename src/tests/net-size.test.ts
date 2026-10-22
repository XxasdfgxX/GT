import { describe, expect, it } from 'vitest';
import { buildRoadGraph } from '../content/map/roads';
import { bairroSpawns } from '../content/spawns';
import { INTEREST_RADIUS, createRoom, encodeStates, join, tick, type Room } from '../net/room';

/** A full room as the server builds it: 16 players, the default crowd and traffic. */
function fullRoom(): { room: Room; ids: number[] } {
  const graph = buildRoadGraph();
  let seed = 1;
  const room = createRoom({
    id: 'costa-1',
    name: 'Costa 1',
    spawns: bairroSpawns(graph),
    nodes: graph.nodes,
    edges: graph.edges,
    rng: () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    },
  });
  const ids: number[] = [];
  for (let n = 0; n < 16; n += 1) {
    const id = join(room, `Jogador ${n}`, '');
    if (id !== null) ids.push(id);
  }
  for (let step = 0; step < 100; step += 1) tick(room, 1 / 20);
  return { room, ids };
}

function fullRoomMessage(): string {
  const { room, ids } = fullRoom();
  return encodeStates(room, ids).get(ids[0] ?? 0) ?? '';
}

describe('state message size', () => {
  // Was 19 KB before positions were rounded and the crowd was cut to each member's surroundings.
  it('stays under the budget for a full room', () => {
    const bytes = new TextEncoder().encode(fullRoomMessage()).length;
    expect(bytes).toBeLessThan(6_000);
  });

  it('sends walkers only near the member, and every car a player drives', () => {
    const { room, ids } = fullRoom();
    const id = ids[0] ?? 0;
    const me = room.players.find((person) => person.id === id);
    const far = room.cars.find(
      (car) => Math.hypot(car.x - (me?.x ?? 0), car.z - (me?.z ?? 0)) > INTEREST_RADIUS,
    );
    if (far) far.driver = ids[1] ?? 0;
    const state = JSON.parse(encodeStates(room, [id]).get(id) ?? '{}') as {
      npcs: Array<{ x: number; z: number }>;
      cars: Array<{ id: number }>;
    };
    for (const npc of state.npcs) {
      expect(Math.hypot(npc.x - (me?.x ?? 0), npc.z - (me?.z ?? 0))).toBeLessThanOrEqual(
        INTEREST_RADIUS + 0.01,
      );
    }
    expect(state.npcs.length).toBeLessThan(room.npcs.length);
    if (far) expect(state.cars.some((car) => car.id === far.id)).toBe(true);
  });
});
