import { describe, expect, it } from 'vitest';
import { quatFromYaw } from '../engine/core/math';
import { CITY_FLOOR } from '../content/map/island-shape';
import { STREET_LIFT } from '../content/map/road-mesh';
import {
  aboveStreet,
  chaseCameraYaw,
  compassHeading,
  dampAngle,
  yawFromQuat,
} from '../game/systems/camera-follow';
import { enginePlayback, interactPrompt, speedKmh, stepMission } from '../game/play/feel';
import { PromptCode } from '../game/play/prompt';
import { MissionPhase } from '../game/play/mission';
import { sedanParts } from '../game/features/vehicles/sedan-visual';
import { roadPieces } from '../game/features/world/road';
import { testMap } from '../content/map';

describe('chase camera', () => {
  it('reads a yaw of 0 when the chassis faces +Z', () => {
    expect(yawFromQuat({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0, 5);
  });

  it('reads the same yaw that quatFromYaw wrote', () => {
    const rotation = { x: 0, y: 0, z: 0, w: 1 };
    quatFromYaw(Math.PI / 2, rotation);
    expect(yawFromQuat(rotation)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('parks the camera behind the car, opposite its nose', () => {
    expect(chaseCameraYaw(0)).toBeCloseTo(Math.PI, 5);
    expect(chaseCameraYaw(Math.PI / 2)).toBeCloseTo(Math.PI * 1.5, 5);
  });

  it('reads south at yaw 0 and east when the camera looks along +X', () => {
    expect(compassHeading(0)).toBeCloseTo(180, 5);
    expect(compassHeading(-Math.PI / 2)).toBeCloseTo(90, 5);
  });

  it('lifts a lens that dropped under the street', () => {
    const y = aboveStreet(0, 1, 12);
    expect(y).toBeGreaterThan(CITY_FLOOR + STREET_LIFT);
    expect(aboveStreet(0, 20, 12)).toBe(20);
  });

  it('turns the short way when the heading wraps past the seam', () => {
    const next = dampAngle(0.1, Math.PI * 2 - 0.1, 1);
    expect(next).toBeCloseTo(-0.1, 5);
  });
});

describe('driving feedback', () => {
  it('converts forward speed into kilometers per hour', () => {
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(-10)).toBe(36);
  });

  it('asks to enter only when on foot and close, and to exit while driving', () => {
    expect(interactPrompt(false, 3, 3.2)).toBe(PromptCode.Enter);
    expect(interactPrompt(false, 4, 3.2)).toBe(PromptCode.None);
    expect(interactPrompt(true, 20, 3.2)).toBe(PromptCode.Exit);
  });

  it('keeps the engine quiet on foot and raises the pitch with speed', () => {
    expect(enginePlayback(false, 20, 1).gain).toBe(0);
    const idle = enginePlayback(true, 0, 0);
    const fast = enginePlayback(true, 20, 1);
    expect(idle.gain).toBeGreaterThan(0);
    expect(fast.frequency).toBeGreaterThan(idle.frequency);
    expect(fast.gain).toBeGreaterThan(idle.gain);
  });
});

describe('delivery mission', () => {
  it('picks the package up on foot inside the radius', () => {
    const next = stepMission({ phase: MissionPhase.Pickup, time: 4 }, false, 1, 40, 2.4, 0.5);
    expect(next.phase).toBe(MissionPhase.Deliver);
    expect(next.time).toBe(0);
  });

  it('does not pick the package up from the driver seat', () => {
    const next = stepMission({ phase: MissionPhase.Pickup, time: 0 }, true, 1, 40, 2.4, 0.5);
    expect(next.phase).toBe(MissionPhase.Pickup);
  });

  it('counts time while carrying and completes only if the car reaches the dropoff', () => {
    const walking = stepMission({ phase: MissionPhase.Deliver, time: 3 }, false, 40, 0.2, 2.4, 0.5);
    expect(walking.phase).toBe(MissionPhase.Deliver);
    expect(walking.time).toBeCloseTo(3.5, 5);

    const driving = stepMission({ phase: MissionPhase.Deliver, time: 3 }, true, 40, 1, 2.4, 0.5);
    expect(driving.phase).toBe(MissionPhase.Done);
    expect(driving.time).toBeCloseTo(3.5, 5);
  });
});

describe('blockout readability', () => {
  it('puts headlights ahead of the taillights on the local +Z nose', () => {
    const parts = sedanParts({ x: 0.85, y: 0.36, z: 1.9 }, 0xc4553a);
    const front = parts.filter((part) => part.role === 'headlight');
    const rear = parts.filter((part) => part.role === 'taillight');
    expect(front.length).toBeGreaterThan(0);
    expect(rear.length).toBeGreaterThan(0);
    const nose = Math.min(...front.map((part) => part.position.z));
    const tail = Math.max(...rear.map((part) => part.position.z));
    expect(nose).toBeGreaterThan(0);
    expect(tail).toBeLessThan(0);
  });

  it('lays asphalt down the street with curbs outside it', () => {
    const pieces = roadPieces(testMap.road);
    const asphalt = pieces.find((piece) => piece.role === 'asphalt');
    const curbs = pieces.filter((piece) => piece.role === 'curb');
    expect(asphalt).toBeDefined();
    expect(curbs.length).toBe(2);
    if (!asphalt) return;
    expect(asphalt.x).toBeCloseTo(testMap.road.x, 5);
    expect(asphalt.collide).toBe(false);
    for (const curb of curbs) {
      expect(curb.collide).toBe(true);
      expect(Math.abs(curb.x - asphalt.x)).toBeGreaterThan(asphalt.sx / 2);
    }
  });
});
