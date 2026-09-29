/** Snapshot the DOM overlay reads. The HUD never touches components itself. */

import type { World } from 'bitecs';
import { CameraRig, Mission, Player, Transform, Vehicle } from '../ecs/components';
import { missions, players } from '../ecs/queries';
import { speedKmh } from './feel';
import { MissionPhase } from './mission';
import { compassHeading } from '../systems/camera-follow';
import { Mode } from '../systems/player-movement';

export interface HudModel {
  prompt: number;
  driving: boolean;
  speedKmh: number;
  missionPhase: number;
  missionTime: number;
  heading: number;
  health: number;
  x: number;
  z: number;
}

export function readHud(world: World): HudModel {
  let prompt = 0;
  let driving = false;
  let speed = 0;
  let heading = 180;
  let health = 100;
  let x = 0;
  let z = 0;
  for (const eid of players(world)) {
    prompt = Player.prompt[eid] ?? 0;
    health = Player.health[eid] ?? 100;
    heading = compassHeading(CameraRig.yaw[eid] ?? 0);
    driving = Player.mode[eid] === Mode.Driving;
    const target = driving ? (Player.vehicle[eid] ?? eid) : eid;
    x = Transform.px[target] ?? 0;
    z = Transform.pz[target] ?? 0;
    if (!driving) continue;
    speed = speedKmh(Vehicle.speed[target] ?? 0);
  }
  let missionPhase: number = MissionPhase.Pickup;
  let missionTime = 0;
  for (const mid of missions(world)) {
    missionPhase = Mission.phase[mid] ?? MissionPhase.Pickup;
    missionTime = Mission.time[mid] ?? 0;
  }
  return { prompt, driving, speedKmh: speed, missionPhase, missionTime, heading, health, x, z };
}
