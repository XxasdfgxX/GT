import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import { createPathNav } from '../engine/nav/three-pathfinding-nav';

describe('island boot', () => {
  it('builds the heightfield and the sidewalk navmesh', async () => {
    const city = createCity();
    expect(city.physicsHeights.length).toBe(city.terrain.rows * city.terrain.cols);
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
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
    const nav = createPathNav();
    nav.load(city.walks);
    expect(city.walks.length).toBeGreaterThan(10);
  });
});
