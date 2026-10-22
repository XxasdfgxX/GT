/** What each member sees: snapshots and the state message on the wire. */

import type {
  CarView,
  CorpseView,
  NpcView,
  PickupView,
  PlayerView,
  RosterEntry,
  SelfView,
} from '../protocol';
import { findPlayer } from './roster';
import type { Room } from './types';

export interface RoomSnapshot {
  self: SelfView;
  players: PlayerView[];
  npcs: NpcView[];
  cars: CarView[];
  pickups: PickupView[];
  corpses: CorpseView[];
  roster: RosterEntry[];
}

export type SharedViews = Omit<RoomSnapshot, 'self' | 'players'>;

export function snapshot(room: Room, id: number): RoomSnapshot {
  const { npcs, cars, ...rest } = sharedViews(room);
  return {
    self: selfView(room, id),
    players: otherPlayers(room, id),
    ...nearMember(room, id, npcs, cars),
    ...rest,
  };
}

/** Centimeters: positions on the wire need no more, and 15 digits tripled the message. */
export function cm(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Milliradians, for yaw. */
export function mrad(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Meters around a member inside which walkers and cars are sent. Past it they are specks in the fog. */
export const INTEREST_RADIUS = 220;

/**
 * The state message for each member. Drops, bodies and the roster are encoded once per
 * tick. Walkers and cars go only to members near them, and a car a player drives goes to
 * everyone, since its driver shows up on the radar.
 */
export function encodeStates(room: Room, ids: Iterable<number>): Map<number, string> {
  const { npcs, cars, ...rest } = sharedViews(room);
  const tail = JSON.stringify(rest).slice(1, -1);
  const messages = new Map<number, string>();
  for (const id of ids) {
    const self = JSON.stringify(selfView(room, id));
    const players = JSON.stringify(otherPlayers(room, id));
    const near = nearMember(room, id, npcs, cars);
    const crowd = JSON.stringify(near.npcs);
    const traffic = JSON.stringify(near.cars);
    messages.set(
      id,
      `{"type":"state","self":${self},"players":${players},"npcs":${crowd},"cars":${traffic},${tail}}`,
    );
  }
  return messages;
}

export function nearMember(
  room: Room,
  id: number,
  npcs: SharedViews['npcs'],
  cars: SharedViews['cars'],
): Pick<SharedViews, 'npcs' | 'cars'> {
  const member = findPlayer(room, id);
  if (!member) return { npcs, cars };
  const reach = INTEREST_RADIUS * INTEREST_RADIUS;
  const near = (item: { x: number; z: number }) =>
    (item.x - member.x) ** 2 + (item.z - member.z) ** 2 <= reach;
  return { npcs: npcs.filter(near), cars: cars.filter((car) => car.driver !== 0 || near(car)) };
}

export function selfView(room: Room, id: number): SelfView {
  const player = findPlayer(room, id);
  if (!player) {
    return {
      health: 0,
      cash: 0,
      alive: false,
      placeSerial: 0,
      place: { x: 0, y: 0, z: 0 },
      name: '',
      kills: 0,
      npcKills: 0,
      deaths: 0,
      playerDeaths: 0,
      npcDeaths: 0,
      car: 0,
      down: 0,
    };
  }
  return {
    health: player.health,
    cash: player.cash,
    alive: player.alive,
    placeSerial: player.placeSerial,
    place: { x: cm(player.place.x), y: cm(player.place.y), z: cm(player.place.z) },
    name: player.name,
    kills: player.kills,
    npcKills: player.npcKills,
    deaths: player.deaths,
    playerDeaths: player.playerDeaths,
    npcDeaths: player.npcDeaths,
    car: player.car,
    down: cm(player.down),
  };
}

export function otherPlayers(room: Room, id: number): PlayerView[] {
  return room.players
    .filter((other) => other.id !== id && other.alive)
    .map((other) => ({
      id: other.id,
      name: other.name,
      x: cm(other.x),
      y: cm(other.y),
      z: cm(other.z),
      yaw: mrad(other.yaw),
      swing: other.swing,
      car: other.car,
      health: other.health,
      down: cm(other.down),
    }));
}

export function sharedViews(room: Room): SharedViews {
  return {
    roster: room.players.map((person) => ({
      id: person.id,
      name: person.name,
      kills: person.kills,
      npcKills: person.npcKills,
      deaths: person.deaths,
      playerDeaths: person.playerDeaths,
      npcDeaths: person.npcDeaths,
      alive: person.alive,
    })),
    npcs: room.npcs
      .filter((npc) => npc.alive)
      .map((npc) => ({
        id: npc.id,
        x: cm(npc.x),
        y: cm(npc.y),
        z: cm(npc.z),
        yaw: mrad(npc.yaw),
        health: npc.health,
        down: cm(npc.down),
      })),
    cars: room.cars.map((car) => ({
      id: car.id,
      x: cm(car.x),
      y: cm(car.y),
      z: cm(car.z),
      yaw: mrad(car.yaw),
      variant: car.variant,
      driver: car.driver,
    })),
    pickups: room.drops.map((drop) => ({
      id: drop.id,
      x: cm(drop.x),
      y: cm(drop.y),
      z: cm(drop.z),
      amount: drop.amount,
    })),
    corpses: room.corpses.map((body) => ({
      id: body.id,
      x: cm(body.x),
      y: cm(body.y),
      z: cm(body.z),
      yaw: mrad(body.yaw),
      kind: body.kind,
      variant: body.variant,
    })),
  };
}
