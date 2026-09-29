/** One directional sun. The shadow frustum follows a focus point and snaps to texels. */

import { OrthographicCamera, Vector3, type DirectionalLight } from 'three';
import { directionAtTime, snapToTexel, wrapDay } from './sun-math';

const lightDistance = 90;

export interface SunController {
  setTimeOfDay(time: number): void;
  timeOfDay(): number;
  aim(x: number, y: number, z: number): void;
  setMapSize(size: number): void;
  setExtent(extent: number): void;
  setEnabled(enabled: boolean): void;
}

export function createSunController(sun: DirectionalLight): SunController {
  const direction = new Vector3();
  const focus = new Vector3();
  const snapped = new Vector3();
  let time = 0.5;
  let extent = 36;
  let mapSize = sun.shadow.mapSize.x;

  const place = () => {
    directionAtTime(time, direction);
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
    setTimeOfDay(next) {
      time = wrapDay(next);
    },
    timeOfDay() {
      return time;
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
