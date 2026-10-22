import { addComponent, addEntity } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { buildCostaVerde } from '../content/city';
import { Pedestrian, RenderRef, Transform, writePose } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { TALL_BOX, tallBoxesNear } from '../sim/collider-grid';
import { bucketCrowd, crowdNear } from '../game/play/crowd-grid';
import { mulberry32 } from '../content/map/rng';

describe('collider grid', () => {
  const boxes = buildCostaVerde().colliders;

  it('returns every tall box that can touch the circle, and no short ones', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 300; n += 1) {
      const x = -250 + rng() * 500;
      const z = -600 + rng() * 1300;
      const reach = rng() * 4;
      const near = new Set(tallBoxesNear(boxes, x, z, reach));
      for (const box of boxes) {
        const touches =
          box.hy >= TALL_BOX &&
          Math.hypot(box.x - x, box.z - z) <= reach + Math.hypot(box.hx, box.hz);
        if (touches) expect(near.has(box)).toBe(true);
      }
      for (const box of near) expect(box.hy).toBeGreaterThanOrEqual(TALL_BOX);
    }
  });

  it('returns each box once even when it spans several cells', () => {
    const near = tallBoxesNear(boxes, 0, 0, 60);
    expect(new Set(near).size).toBe(near.length);
  });
});

describe('crowd grid', () => {
  it('finds every active walker in reach, after a tick of drift', () => {
    const world = createGameWorld();
    const rng = mulberry32(11);
    const walkers: number[] = [];
    for (let n = 0; n < 120; n += 1) {
      const eid = addEntity(world);
      addComponent(world, eid, Pedestrian);
      addComponent(world, eid, Transform);
      addComponent(world, eid, RenderRef);
      writePose(eid, -40 + rng() * 80, 0, -40 + rng() * 80);
      Pedestrian.active[eid] = 1;
      Pedestrian.driving[eid] = 0;
      walkers.push(eid);
    }
    bucketCrowd(world, 1);
    // Everyone moves up to 0.7 m after bucketing: a step plus a punch knock-back.
    for (const eid of walkers) {
      Transform.px[eid] = (Transform.px[eid] ?? 0) + (rng() - 0.5) * 1.4;
      Transform.pz[eid] = (Transform.pz[eid] ?? 0) + (rng() - 0.5) * 1.4;
    }
    for (let n = 0; n < 200; n += 1) {
      const x = -40 + rng() * 80;
      const z = -40 + rng() * 80;
      const reach = rng() * 3;
      const near = new Set(crowdNear(x, z, reach));
      for (const eid of walkers) {
        const d = Math.hypot((Transform.px[eid] ?? 0) - x, (Transform.pz[eid] ?? 0) - z);
        if (d <= reach) expect(near.has(eid)).toBe(true);
      }
    }
  });
});
