/** Sends walkers home and parks cars as the night empties the streets, and brings them back by day. */

import { trafficShare, walkerShare } from '../../sim/city-life';
import { clockAt } from '../../sim/clock';
import { playerWithin, spawnNpc } from './npc';
import { spawnCar } from './traffic';
import { NPC_RESPAWN_CLEAR, type Room } from './types';

/** Seconds between steps: one walker and one car at most, so nobody sees a crowd vanish. */
const SETTLE_STEP = 0.5;

export function settlePopulation(room: Room): void {
  if (room.now < room.settleAt) return;
  room.settleAt = room.now + SETTLE_STEP;
  const hours = clockAt(room.now) / 60;
  const unseen = (x: number, z: number) => !playerWithin(room, x, z, NPC_RESPAWN_CLEAR);

  // The dead waiting to be replaced count as out: they come back on their own.
  const walking = room.npcs.filter((npc) => npc.alive).length + room.npcDue.length;
  const walkers = Math.round(room.npcCount * walkerShare(hours));
  if (walking > walkers) {
    const home = room.npcs.findIndex(
      (npc) => npc.alive && npc.foe === 0 && npc.down === 0 && unseen(npc.x, npc.z),
    );
    if (home >= 0) room.npcs.splice(home, 1);
  } else if (walking < walkers) {
    spawnNpc(room, NPC_RESPAWN_CLEAR);
  }

  const cars = Math.round(room.carCount * trafficShare(hours));
  if (room.cars.length > cars) {
    const parked = room.cars.findIndex((car) => car.driver === 0 && unseen(car.x, car.z));
    const car = room.cars[parked];
    if (car) {
      room.cars.splice(parked, 1);
      room.carsResting.push(car.id - 1);
    }
  } else if (room.cars.length < cars) {
    const slot = room.carsResting.shift();
    if (slot !== undefined && !spawnCar(room, slot, NPC_RESPAWN_CLEAR)) room.carsResting.push(slot);
  }
}
