/** Authoritative room: roster, punches, npc brawls, cash, traffic and respawn. The parts live in ./room/. */

export {
  AGGRO_RANGE,
  CAR_SPEED_MARGIN,
  FIGHT_REACH,
  FOOT_SPEED_LIMIT,
  MAX_AIR,
  MAX_PLAYERS,
  NPC_RESPAWN,
  NPC_RESPAWN_CLEAR,
  PUNCH_REACH,
  REACH_BURST,
  ROOM_CARS,
  ROOM_DEFS,
  ROOM_NPCS,
  SNAP_EXCESS,
} from './room/types';
export type { Pose, Punch, Room, WalkEdge, WalkNode } from './room/types';
export { chooseName, createRoom, join, leave, listing } from './room/roster';
export { pushPose } from './room/movement';
export { pushPickup, pushPunch } from './room/combat';
export { pushEnter, pushExit } from './room/traffic';
export { encodeStates, INTEREST_RADIUS, snapshot } from './room/encode';
export type { RoomSnapshot } from './room/encode';
export { tick } from './room/tick';
export { DROP_LIFETIME, MAX_DROPS } from '../sim/wallet';
