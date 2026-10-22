import { addComponent, addEntity } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext, NetLink, NetSnapshot } from '../game/context';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Velocity,
} from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { PICKUP_RETRY, publishNet, resetNet } from '../game/systems/net';

const renderer = new Proxy({}, { get: () => () => 1 }) as unknown as Renderer;
const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

function fakeLink(state: NetSnapshot) {
  const sent = { poses: 0, pickups: 0 };
  const link: NetLink = {
    selfId: 1,
    sendPose: () => {
      sent.poses += 1;
    },
    sendPunch: () => undefined,
    sendPickup: () => {
      sent.pickups += 1;
    },
    sendEnter: () => undefined,
    sendExit: () => undefined,
    state: () => state,
    connected: () => true,
    close: () => undefined,
  };
  return { link, sent };
}

describe('publishing to the room', () => {
  it('asks for each drop in reach once per retry window, and still sends every pose', async () => {
    resetNet();
    const drops = Array.from({ length: 10 }, (_, id) => ({
      id: id + 1,
      x: 0,
      y: 0,
      z: 0,
      amount: 10,
    }));
    const { link, sent } = fakeLink({ pickups: drops } as unknown as NetSnapshot);
    const ctx = createContext({
      input: {} as GameContext['input'],
      physics: await createRapierWorld(0),
      renderer,
      nav: { load: () => undefined, find: () => 0 },
      audio: quiet,
      assets: {} as GameContext['assets'],
      mouseSensitivity: 0.002,
      net: link,
    });
    const world = createGameWorld();
    const eid = addEntity(world);
    for (const part of [
      Player,
      Transform,
      Velocity,
      InputState,
      PhysicsRef,
      RenderRef,
      CameraRig,
    ]) {
      addComponent(world, eid, part);
    }
    Player.health[eid] = 100;

    const seconds = 2;
    const steps = Math.round(seconds / ctx.time.fixedDt);
    for (let n = 0; n < steps; n += 1) publishNet(ctx, world);
    const posesWithDrops = sent.poses;
    expect(sent.pickups).toBeLessThanOrEqual(drops.length * Math.ceil(seconds / PICKUP_RETRY));

    resetNet();
    sent.poses = 0;
    drops.length = 0;
    for (let n = 0; n < steps; n += 1) publishNet(ctx, world);
    expect(posesWithDrops).toBe(sent.poses);
  });
});
