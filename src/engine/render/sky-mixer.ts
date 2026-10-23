/**
 * Blends the day, sunset and night skies into one cube for the background and one PMREM
 * for image lighting. Each sky is turned so its sun (or moon) lands on the light. The
 * cube and PMREM are rebuilt only when the blend or the turn has moved enough to see.
 */

import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { AssetManager } from '../assets/asset-manager';
import { SKIES, type SkyName } from './sky';
import type { DayLight } from './sun-math';

const NAMES: readonly SkyName[] = ['day', 'sunset', 'night'];
/** Equirect size of the blend, as the 2K sources. */
const MIX_WIDTH = 2048;
/** 90° of a 2K equirect is 512 pixels, so a bigger face would only be blur. */
const CUBE_SIZE = 512;
/** Rebuild when a weight moves this much, or a sky turns this share of a circle (~1.4°). */
const WEIGHT_STEP = 0.01;
const TURN_STEP = 0.004;
/** Seconds between rebuilds at most, so a dusk blend costs one PMREM every quarter second. */
const MIN_GAP = 0.25;

export interface SkyMixer {
  /** Fetches the three skies. Resolves to the bytes they hold on the GPU. */
  load(): Promise<number>;
  /** After `load`: re-blends when the light has moved enough. `now` is seconds. */
  update(light: DayLight, now: number): void;
  readonly background: Texture | null;
  readonly environment: Texture | null;
  dispose(): void;
}

export function createSkyMixer(renderer: WebGLRenderer, assets: AssetManager): SkyMixer {
  const textures = new Map<SkyName, DataTexture>();
  const skies: Record<SkyName, { value: DataTexture | null }> = {
    day: { value: null },
    sunset: { value: null },
    night: { value: null },
  };
  const weights = new Vector3();
  const shifts = new Vector3();
  const material = new ShaderMaterial({
    uniforms: {
      tDay: skies.day,
      tSunset: skies.sunset,
      tNight: skies.night,
      weights: { value: weights },
      shifts: { value: shifts },
      gains: { value: new Vector3(SKIES.day.gain, SKIES.sunset.gain, SKIES.night.gain) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // Shifting u turns a sky about the vertical; the textures repeat across the seam.
    fragmentShader: /* glsl */ `
      uniform sampler2D tDay;
      uniform sampler2D tSunset;
      uniform sampler2D tNight;
      uniform vec3 weights;
      uniform vec3 shifts;
      uniform vec3 gains;
      varying vec2 vUv;
      void main() {
        vec3 color = vec3(0.0);
        if (weights.x > 0.0) color += weights.x * gains.x * texture2D(tDay, vec2(vUv.x - shifts.x, vUv.y)).rgb;
        if (weights.y > 0.0) color += weights.y * gains.y * texture2D(tSunset, vec2(vUv.x - shifts.y, vUv.y)).rgb;
        if (weights.z > 0.0) color += weights.z * gains.z * texture2D(tNight, vec2(vUv.x - shifts.z, vUv.y)).rgb;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const stage = new Scene();
  stage.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const flat = new WebGLRenderTarget(MIX_WIDTH, MIX_WIDTH / 2, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  const cube = new WebGLCubeRenderTarget(CUBE_SIZE, { type: HalfFloatType });
  const pmrem = new PMREMGenerator(renderer);
  let lighting: WebGLRenderTarget | null = null;
  let ready = false;
  const last = { weights: [-1, -1, -1], shifts: [0, 0, 0], at: -Infinity };

  const moved = (light: DayLight, shifts: number[]) =>
    NAMES.some((name, index) => {
      const weight = light.weights[name];
      if (Math.abs(weight - (last.weights[index] ?? -1)) > WEIGHT_STEP) return true;
      if (weight === 0) return false;
      const turn = Math.abs((shifts[index] ?? 0) - (last.shifts[index] ?? 0)) % 1;
      return Math.min(turn, 1 - turn) > TURN_STEP;
    });

  return {
    async load() {
      // Half floats filter everywhere; full floats need an extension some GPUs lack.
      const loader = new HDRLoader().setDataType(HalfFloatType);
      let bytes = 0;
      await Promise.all(
        NAMES.map(async (name) => {
          const texture = await loader.loadAsync(SKIES[name].url);
          texture.wrapS = RepeatWrapping;
          texture.needsUpdate = true;
          assets.track(texture);
          textures.set(name, texture);
          const image = texture.image as { width?: number; height?: number } | null;
          bytes += image?.width && image.height ? image.width * image.height * 8 : 0;
        }),
      );
      for (const name of NAMES) skies[name].value = textures.get(name) ?? null;
      ready = true;
      const flatBytes = MIX_WIDTH * (MIX_WIDTH / 2) * 8;
      const cubeBytes = CUBE_SIZE * CUBE_SIZE * 6 * 8;
      return bytes + flatBytes + cubeBytes + 256 * 256 * 6 * 8;
    },
    update(light, now) {
      if (!ready) return;
      const turns = NAMES.map((name) => light.targetU[name] - SKIES[name].u);
      if (now - last.at < MIN_GAP && last.at > -Infinity) return;
      if (!moved(light, turns)) return;
      last.at = now;
      last.weights = NAMES.map((name) => light.weights[name]);
      last.shifts = turns;
      weights.set(light.weights.day, light.weights.sunset, light.weights.night);
      shifts.set(turns[0] ?? 0, turns[1] ?? 0, turns[2] ?? 0);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(flat);
      renderer.render(stage, camera);
      renderer.setRenderTarget(previous);
      cube.fromEquirectangularTexture(renderer, flat.texture);
      lighting = pmrem.fromCubemap(cube.texture, lighting);
    },
    get background() {
      return ready && last.at > -Infinity ? cube.texture : null;
    },
    get environment() {
      return lighting?.texture ?? null;
    },
    dispose() {
      material.dispose();
      quad.geometry.dispose();
      flat.dispose();
      cube.dispose();
      lighting?.dispose();
      pmrem.dispose();
    },
  };
}
