/** One room step. */

import { provoked, ram, replaceFallen, revive } from './combat';
import { chase, walk } from './npc';
import { driveCar } from './traffic';
import type { Room } from './types';

export function tick(room: Room, dt: number): void {
  room.now += dt;
  room.corpses = room.corpses.filter((body) => {
    body.left -= dt;
    return body.left > 0;
  });
  if (room.drops.some((drop) => drop.expires <= room.now)) {
    room.drops = room.drops.filter((drop) => drop.expires > room.now);
  }
  replaceFallen(room);
  for (const player of room.players) {
    player.down = Math.max(0, player.down - dt);
    if (player.alive) continue;
    player.respawn -= dt;
    if (player.respawn <= 0) revive(room, player);
  }
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    npc.cool = Math.max(0, npc.cool - dt);
    npc.down = Math.max(0, npc.down - dt);
    if (npc.down > 0) continue;
    const quarry = provoked(room, npc);
    if (quarry) chase(room, npc, quarry, dt);
    else walk(room, npc, dt);
  }
  for (const car of room.cars) {
    driveCar(room, car, dt);
    ram(room, car, dt);
    car.prevX = car.x;
    car.prevZ = car.z;
  }
}
