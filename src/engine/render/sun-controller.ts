/** One directional sun. The shadow frustum follows a focus point and snaps to texels. */

import { OrthographicCamera, Vector3, type DirectionalLight } from 'three';
import { snapToTexel, type SunVector } from './sun-math';

// Far enough that a tower on the sun side of a 90 m extent still lands in the shadow volume.
const lightDistance = 200;

export interface SunController {
  /** Toward the light, unit length: the sun by day, the moon by night. */
  setDirection(direction: SunVector): void;
  aim(x: number, y: number, z: number): void;
  setMapSize(size: number): void;
  setExtent(extent: number): void;
  setEnabled(enabled: boolean): void;
}

export function createSunController(sun: DirectionalLight): SunController {
  const direction = new Vector3(0, 1, 0);
  const focus = new Vector3();
  const snapped = new Vector3();
  let extent = 36;
  let mapSize = sun.shadow.mapSize.x;

  const place = () => {
    const shadowCam = sun.shadow.camera;
    if (!(shadowCam instanceof OrthographicCamera)) return;
    shadowCam.left = -extent;
    shadowCam.right = extent;
    shadowCam.top = extent;
    shadowCam.bottom = -extent;
    shadowCam.near = 8;
    shadowCam.far = lightDistance + extent * 2;
    shadowCam.updateProjectionMatrix();

    sun.position.copy(focus).addScaledVector(direction, lightDistance);
    sun.target.position.copy(focus);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    shadowCam.updateMatrixWorld();

    const texel = (shadowCam.right - shadowCam.left) / Math.max(mapSize, 1);
    snapped.copy(focus).applyMatrix4(shadowCam.matrixWorldInverse);
    snapped.x = snapToTexel(snapped.x, texel);
    snapped.y = snapToTexel(snapped.y, texel);
    snapped.applyMatrix4(shadowCam.matrixWorld);

    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(direction, lightDistance);
    sun.target.updateMatrixWorld();
  };

  return {
    setDirection(next) {
      direction.set(next.x, next.y, next.z);
    },
    aim(x, y, z) {
      focus.set(x, y, z);
      place();
    },
    setMapSize(size) {
      mapSize = size;
      sun.shadow.mapSize.set(size, size);
      const map = sun.shadow.map;
      if (map) {
        map.dispose();
        sun.shadow.map = null;
      }
    },
    setExtent(next) {
      extent = next;
    },
    setEnabled(enabled) {
      sun.castShadow = enabled;
    },
  };
}
