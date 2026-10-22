import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { createCity, sampleHeight } from '../content/city';
import { createPathNav } from '../engine/nav/three-pathfinding-nav';

describe('island boot', () => {
  it('stands the heightfield where the terrain is', async () => {
    const city = createCity();
    expect(city.physicsHeights.length).toBe(city.terrain.rows * city.terrain.cols);
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Centered the way spawnMap places it, so the ray below meets the real ground.
    const { terrain } = city;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        terrain.originX + terrain.sizeX / 2,
        0,
        terrain.originZ + terrain.sizeZ / 2,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(
        city.terrain.rows - 1,
        city.terrain.cols - 1,
        city.physicsHeights,
        {
          x: city.terrain.sizeX,
          y: 1,
          z: city.terrain.sizeZ,
        },
      ),
      body,
    );
    world.step();
    // The heightfield stands where the terrain says: a ray down at the solo start hits it.
    const hit = world.castRay(
      new RAPIER.Ray({ x: 0, y: 200, z: 12 }, { x: 0, y: -1, z: 0 }),
      400,
      true,
    );
    expect(hit).not.toBeNull();
    expect(200 - (hit?.timeOfImpact ?? 0)).toBeCloseTo(sampleHeight(0, 12), 0);
    world.free();
  });

  /**
   * Known bug (plan Task 7.6): neighbouring sidewalk, corner and crosswalk quads share no
   * vertices, so the navmesh is 572 islands of at most 8 polygons and no two blocks connect.
   * Remove `.fails` once the navmesh is built connected.
   */
  it.fails('joins two blocks downtown with a sidewalk path', () => {
    const city = createCity();
    const nav = createPathNav();
    nav.load(city.walks);
    expect(city.walks.length).toBeGreaterThan(10);
    // Two sidewalk quads a block or two apart downtown are joined by a walkable path.
    const sidewalkNear = (x: number, z: number) =>
      city.walks
        .filter((quad) => !quad.crosswalk)
        .sort(
          (a, b) =>
            Math.hypot((a.ax + a.cx) / 2 - x, (a.az + a.cz) / 2 - z) -
            Math.hypot((b.ax + b.cx) / 2 - x, (b.az + b.cz) / 2 - z),
        )[0];
    const from = sidewalkNear(-94.7, -33.1);
    const to = sidewalkNear(-40, -33.1);
    if (!from || !to) throw new Error('sem calçada');
    const fx = (from.ax + from.cx) / 2;
    const fz = (from.az + from.cz) / 2;
    const tx = (to.ax + to.cx) / 2;
    const tz = (to.az + to.cz) / 2;
    const xs = new Float32Array(32);
    const zs = new Float32Array(32);
    const points = nav.find(
      fx,
      sampleHeight(fx, fz),
      fz,
      tx,
      sampleHeight(tx, tz),
      tz,
      xs,
      zs,
      0,
      32,
    );
    expect(points).toBeGreaterThan(0);
  });
});
