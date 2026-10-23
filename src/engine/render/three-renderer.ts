/** Three.js renderer. Geometries and materials are registered with the asset owner. */

import {
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LoopOnce,
  Matrix4,
  LoopRepeat,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  Vector3,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { AssetManager } from '../assets/asset-manager';
import type { Quat, Vec3 } from '../core/math';
import {
  canvasAntialias,
  cappedPixelRatio,
  DEFAULT_EXPOSURE,
  MAX_PIXEL_RATIO,
  shadowExtent,
  shadowMapSize,
  sharpnessCap,
  type Effects,
  type GraphicsQuality,
} from './display';
import { createSkyMixer } from './sky-mixer';
import { dressCar } from './materials/car-paint';
import { MaterialLibrary, TILE_METERS, tileBoxUvs } from './materials/material-library';
import {
  WALL_FINISHES,
  facadeFragmentBody,
  facadeFragmentHead,
  facadeVertexBody,
  facadeVertexHead,
} from './materials/facade-shader';
import { createTerrainMaterial } from './materials/terrain-material';
import { createWater, type Water } from './materials/water-material';
import { glslFloat } from './materials/uv-meters';
import type {
  ClipKey,
  InstanceBatchDesc,
  MeshDesc,
  ModelDesc,
  Renderer,
  SurfaceFinish,
  TerrainDesc,
} from './renderer';
import { FOG_DENSITY, SKIES, SKY_FILL } from './sky';
import { dayLightAt } from './sun-math';
import { createSunController } from './sun-controller';

interface CachedModel {
  scene: Object3D;
  animations: AnimationClip[];
}

interface MeshRecord {
  object: Object3D;
  mixer?: AnimationMixer;
  actions?: Map<ClipKey, AnimationAction>;
  clip?: ClipKey;
  token?: number;
}

const worldFar = 2800;

/** Point lights that follow the street lamps nearest the camera at night, per effects level. */
const LAMP_LIGHTS: Record<Effects, number> = { off: 0, medium: 4, high: 8 };
const LAMP_POOL = 8;
/** Candela: about 1 lux on the pavement under a 4.6 m lamp. */
const LAMP_POWER = 18;
const HEADLIGHT_POWER = 60;

/** Ground finishes seen in long runs, which get a second, wider sample against tiling. */
const BROKEN_UP: ReadonlySet<SurfaceFinish> = new Set([
  'asphalt',
  'sidewalk',
  'concrete',
  'plaza',
  'dirt',
  'sand',
]);

export function createThreeRenderer(
  canvas: HTMLCanvasElement,
  assets: AssetManager,
  fov = 58,
): Renderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: canvasAntialias(true),
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  // Tone mapping runs in the composer, after bloom, on the half-float buffer.
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  // The composer renders several passes a frame; the count is reset once per frame instead.
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  // r186 dropped PCFSoftShadowMap; PCF with a radius blurs the edge instead.
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio));
  renderer.setClearColor(SKIES.day.horizon, 1);

  const scene = new Scene();
  const fog = new FogExp2(SKIES.day.horizon, FOG_DENSITY);
  scene.fog = fog;

  const camera = new PerspectiveCamera(fov, 1, 0.3, worldFar);
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const occlusion = new N8AOPostPass(scene, camera, 1, 1);
  // Meters: a curb, a car body, the foot of a wall.
  occlusion.configuration.aoRadius = 2;
  occlusion.configuration.distanceFalloff = 1;
  occlusion.configuration.intensity = 2.5;
  composer.addPass(occlusion);
  const bloom = new BloomEffect({
    luminanceThreshold: 0.9,
    luminanceSmoothing: 0.2,
    intensity: 0.4,
    mipmapBlur: true,
  });
  composer.addPass(
    new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })),
  );
  // After tone mapping: SMAA finds edges in display colors.
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  const setEffects = (level: Effects) => {
    occlusion.enabled = level !== 'off';
    occlusion.configuration.halfRes = level === 'medium';
    occlusion.setQualityMode(level === 'high' ? 'Medium' : 'Low');
    bloom.intensity = level === 'off' ? 0 : 0.4;
    lampsInUse = LAMP_LIGHTS[level];
    nearest.length = 0;
    lampsPlacedAt = -Infinity;
  };
  const projected = new Vector3();
  const cameraSpace = new Vector3();
  const ambient = new AmbientLight(0xfff6ea, 0.16);
  const skyLight = new HemisphereLight(0x9fd0ef, 0x3d6a38, 0.55);
  const sun = new DirectionalLight(0xfff0d0, 2.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  scene.add(ambient, skyLight, sun, sun.target);
  const sunController = createSunController(sun);
  sunController.aim(0, 0, 0);
  // Surfaces load as GPU-compressed KTX2 where the browser can transcode them.
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  const materials = new MaterialLibrary(assets, renderer.capabilities.getMaxAnisotropy(), ktx2);
  const carMaterials = new Map<string, Material>();
  const worldMaterials = new Map<string, MeshStandardMaterial>();
  let unitBox: BoxGeometry | undefined;
  let unitCylinder: CylinderGeometry | undefined;
  let dayTime = 0.375;
  // Read by the facade shader: windows and shopfronts light up after dark.
  const night = { value: 0 };
  const windowShare = { value: 0 };
  const shopShare = { value: 0 };
  /** Emissive intensity by day and by night, for bulbs and signs. */
  const nightGlow = new Map<MeshStandardMaterial, [number, number]>();
  /** Bulb centers of each instanced lamp batch, as x, y, z triples. */
  const glows = new Map<number, Float32Array>();
  // A fixed set of lights: changing how many there are recompiles every material.
  const lampPool = Array.from({ length: LAMP_POOL }, () => new PointLight(0xffd9a0, 0, 22, 2));
  let lampsInUse = LAMP_LIGHTS.high;
  let lampsPlacedAt = -Infinity;
  const nearest: { distance: number; x: number; y: number; z: number }[] = [];
  const beams = [1, -1].map((side) => {
    const beam = new SpotLight(0xfff1d0, 0, 45, 0.45, 0.5, 1.5);
    beam.castShadow = false;
    return { side, beam };
  });
  let beamsOn = false;
  scene.add(...lampPool);
  for (const { beam } of beams) scene.add(beam, beam.target);
  let shadowsWanted = true;
  const sky = createSkyMixer(renderer, assets);
  /** Sun or moon, fill, fog and sky for `dayTime`. Cheap; the sky re-blends only when it moved. */
  const applyDay = () => {
    const light = dayLightAt(dayTime);
    sunController.setDirection(light.light);
    sunController.setEnabled(shadowsWanted && light.shadows);
    sun.color.setHex(light.lightColor);
    sun.intensity = light.lightIntensity * light.exposure;
    ambient.intensity = light.ambient * light.exposure;
    skyLight.intensity = light.hemisphere * light.exposure;
    scene.environmentIntensity = SKY_FILL * light.exposure;
    scene.backgroundIntensity = light.exposure;
    fog.color.setRGB(light.fog[0], light.fog[1], light.fog[2]);
    fog.density = FOG_DENSITY * light.fogDensityScale;
    renderer.setClearColor(fog.color, 1);
    sky.update(light, elapsed);
    scene.background = sky.background;
    scene.environment = sky.environment;
    night.value = light.nightLight;
    windowShare.value = light.windowShare;
    shopShare.value = light.shopShare;
    for (const [material, [day, dark]] of nightGlow) {
      material.emissiveIntensity = day + (dark - day) * light.nightLight;
    }
    for (const { beam } of beams) beam.intensity = beamsOn ? HEADLIGHT_POWER * light.nightLight : 0;
  };

  /** Every half second after dark, the lamp lights move to the lamps nearest the camera. */
  const placeLampLights = () => {
    const power = LAMP_POWER * night.value;
    if (power > 0 && elapsed - lampsPlacedAt >= 0.5) {
      lampsPlacedAt = elapsed;
      nearest.length = 0;
      const eye = camera.position;
      for (const [id, centers] of glows) {
        if (!meshes.get(id)?.object.visible) continue;
        for (let i = 0; i < centers.length; i += 3) {
          const x = centers[i] ?? 0;
          const z = centers[i + 2] ?? 0;
          const distance = (x - eye.x) ** 2 + (z - eye.z) ** 2;
          const worst = nearest[nearest.length - 1]?.distance ?? Infinity;
          if (nearest.length >= lampsInUse && distance >= worst) continue;
          let at = nearest.length;
          while (at > 0 && (nearest[at - 1]?.distance ?? 0) > distance) at -= 1;
          nearest.splice(at, 0, { distance, x, y: centers[i + 1] ?? 0, z });
          if (nearest.length > lampsInUse) nearest.pop();
        }
      }
      nearest.forEach((spot, index) => {
        // Just under the bulb, so the light falls out of the lantern onto the street.
        lampPool[index]?.position.set(spot.x, spot.y - 0.3, spot.z);
      });
    }
    lampPool.forEach((lamp, index) => {
      lamp.intensity = index < nearest.length ? power : 0;
    });
  };

  let water: Water | null = null;
  let elapsed = 0;

  const meshes = new Map<number, MeshRecord>();
  const models = new Map<string, CachedModel>();
  const loading = new Map<string, Promise<void>>();
  const loader = new GLTFLoader();
  // Props from scripts/import-polyhaven-models.mjs are meshopt-compressed.
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2);
  let nextId = 1;
  let calls = 0;
  let pixelCap = MAX_PIXEL_RATIO;

  /** A unit box of its own: the facade attribute is per instance, so per mesh. */
  const wallGeometry = (desc: InstanceBatchDesc) => {
    const geometry = assets.track(new BoxGeometry(1, 1, 1));
    // Walls without a window grid (parapets) still need the attribute; zeros draw none.
    const facade = desc.facade ?? new Float32Array(desc.count * 4);
    geometry.setAttribute('facade', new InstancedBufferAttribute(facade, 4));
    return geometry;
  };

  /** Body paint gets a white copy, so each instance's color shows true; null for anything else. */
  const whitePaint = new Map<Material, MeshStandardMaterial>();
  const paintFor = (object: Object3D, source: unknown) => {
    if (!(source instanceof MeshStandardMaterial) || source.metalness < 0.4 || onWheel(object)) {
      return null;
    }
    let white = whitePaint.get(source);
    if (!white) {
      white = assets.track(source.clone());
      white.color.set(0xffffff);
      whitePaint.set(source, white);
    }
    return white;
  };

  const sharedUnit = (kind: 'box' | 'cylinder') => {
    if (kind === 'cylinder') {
      unitCylinder ??= assets.track(new CylinderGeometry(0.5, 0.5, 1, 7));
      return unitCylinder;
    }
    unitBox ??= assets.track(new BoxGeometry(1, 1, 1));
    return unitBox;
  };

  const worldMaterial = (desc: InstanceBatchDesc) => {
    if (!desc.finish) {
      const key = `flat|${desc.roughness ?? 0.7}|${desc.metalness ?? 0}|${desc.emissive ?? 0}`;
      const cached = worldMaterials.get(key);
      if (cached) return cached;
      const material = assets.track(
        new MeshStandardMaterial({
          color: 0xffffff,
          roughness: desc.roughness ?? 0.7,
          metalness: desc.metalness ?? 0,
          emissive: desc.emissive ?? 0,
          emissiveIntensity: desc.emissive ? 1.4 : 0,
        }),
      );
      // Signs and signals read brighter against the dark.
      if (desc.emissive) nightGlow.set(material, [1.4, 3.5]);
      worldMaterials.set(key, material);
      return material;
    }
    const cached = worldMaterials.get(desc.finish);
    if (cached) return cached;
    // A float literal: lane paint tiles every 1 m, and `* 1` would not compile.
    const tile = glslFloat(1 / TILE_METERS[desc.finish]);
    const material = assets.track(materials.resolve(desc.finish, 0xffffff).clone());
    material.color.set(0xffffff);
    const wall = WALL_FINISHES.has(desc.finish);
    const brokenUp = BROKEN_UP.has(desc.finish);
    material.customProgramCacheKey = () => `world-uv-${desc.finish}`;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        #ifdef USE_MAP
          vec3 gtN = normalize(mat3(instanceMatrix) * objectNormal);
          vec3 gtW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          if (abs(gtN.y) > 0.55) vMapUv = gtW.xz * ${tile};
          else if (abs(gtN.x) > abs(gtN.z)) vMapUv = gtW.zy * ${tile};
          else vMapUv = gtW.xy * ${tile};
          #ifdef USE_AOMAP
            vAoMapUv = vMapUv;
          #endif
          // Each map has its own uv. Left alone, these stretch once across the whole face.
          #ifdef USE_NORMALMAP
            vNormalMapUv = vMapUv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = vMapUv;
          #endif
        #endif
        ${wall ? facadeVertexBody : ''}
        #include <project_vertex>
        `,
      );
      if (brokenUp) {
        // A slow swell in brightness, read from the same map ~8x and ~19x wider, so long
        // roads and pavements do not show the repeat as a grid. The difference averages to 0.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          #ifdef USE_MAP
            vec3 gtLuma = vec3(0.333);
            float gtSwell = dot(texture2D(map, vMapUv * 0.13).rgb - texture2D(map, vMapUv * 0.053 + 0.37).rgb, gtLuma);
            diffuseColor.rgb *= clamp(1.0 + 0.9 * gtSwell, 0.75, 1.25);
          #endif`,
        );
      }
      if (!wall) return;
      shader.uniforms.uNight = night;
      shader.uniforms.uWindowShare = windowShare;
      shader.uniforms.uShopShare = shopShare;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${facadeVertexHead}`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${facadeFragmentHead}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\nfloat wallGlass = 0.0;\n${facadeFragmentBody}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          // Glass is flat: the plaster bumps stop at the frame.
          `if (wallGlass < 0.5) {
            #include <normal_fragment_maps>
          }`,
        );
    };
    worldMaterials.set(desc.finish, material);
    return material;
  };

  /** Textured ground once the surfaces are in; the flat vertex colors if any failed to load. */
  const terrainMaterial = () => {
    // Sand and grass tile wider here than on props: the beach and the serra are seen from far.
    const sand = materials.surface('sand');
    const paved = materials.surface('roof-concrete');
    const rock = materials.surface('rock');
    const grass = materials.surface('grass');
    if (!sand || !paved || !rock || !grass) {
      return new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    }
    return createTerrainMaterial([
      { ...sand, tile: 3 },
      { ...paved, tile: 3 },
      { ...rock, tile: 15 },
      { ...grass, tile: 2.5 },
    ]);
  };

  const addMaterial = (
    color: number,
    roughness = 0.86,
    metalness = 0.02,
    emissive = 0,
    surface: 'solid' | 'water' = 'solid',
  ) =>
    assets.track(
      new MeshStandardMaterial({
        color,
        roughness: surface === 'water' ? 0.045 : roughness,
        metalness: surface === 'water' ? 0.82 : metalness,
        emissive,
        emissiveIntensity: emissive === 0 ? 0 : 2.2,
        envMapIntensity: surface === 'water' ? 1.55 : 1,
      }),
    );

  const surfaceMaterial = (
    desc: MeshDesc | InstanceBatchDesc,
    geometry: BoxGeometry | CapsuleGeometry | CylinderGeometry,
  ) => {
    const waves = materials.waterNormal();
    if ('surface' in desc && desc.surface === 'water' && waves) {
      water = createWater(waves, desc.size.x, desc.size.z);
      for (const texture of water.textures) assets.track(texture);
      return assets.track(water.material);
    }
    if (desc.finish && geometry instanceof BoxGeometry) {
      const material = materials.resolve(desc.finish, desc.color);
      tileBoxUvs(geometry, desc.size.x, desc.size.y, desc.size.z, TILE_METERS[desc.finish]);
      return material;
    }
    return addMaterial(
      desc.color,
      desc.roughness ?? 0.86,
      desc.metalness ?? 0.02,
      desc.emissive ?? 0,
      'surface' in desc ? (desc.surface ?? 'solid') : 'solid',
    );
  };

  return {
    domElement: canvas,
    prepare() {
      return Promise.all([sky.load(), materials.load()]).then(() => {
        applyDay();
      });
    },
    setSize(width, height) {
      renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio, pixelCap));
      renderer.setSize(width, height, false);
      composer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    setGraphics(quality: GraphicsQuality) {
      pixelCap = sharpnessCap(quality.sharpness);
      setEffects(quality.effects);
      const map = shadowMapSize(quality.shadows);
      renderer.shadowMap.enabled = map > 0;
      shadowsWanted = map > 0;
      sunController.setEnabled(shadowsWanted && dayLightAt(dayTime).shadows);
      if (map > 0) sunController.setMapSize(map);
      sunController.setExtent(shadowExtent(quality.shadows));
      renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio, pixelCap));
    },
    setCamera(position, target) {
      camera.position.set(position.x, position.y, position.z);
      camera.lookAt(target.x, target.y, target.z);
      sunController.aim(target.x, target.y, target.z);
    },
    project(point) {
      camera.updateMatrixWorld();
      cameraSpace.set(point.x, point.y, point.z);
      cameraSpace.applyMatrix4(camera.matrixWorldInverse);
      const behind = cameraSpace.z > 0;
      projected.set(point.x, point.y, point.z).project(camera);
      const width = canvas.clientWidth || canvas.width;
      const height = canvas.clientHeight || canvas.height;
      return {
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        behind,
      };
    },
    setTimeOfDay(time) {
      dayTime = time;
      applyDay();
    },
    timeOfDay() {
      return dayTime;
    },
    setHeadlights(id, front) {
      const car = id !== 0 && front ? meshes.get(id)?.object : undefined;
      beamsOn = car !== undefined;
      for (const { side, beam } of beams) {
        // Parked on the scene when off: the light count never changes.
        const holder = car ?? scene;
        if (beam.parent !== holder) holder.add(beam, beam.target);
        if (car && front) {
          beam.position.set(front.x * side, front.y, front.z);
          beam.target.position.set(front.x * side * 1.4, front.y - 1.2, front.z + 18);
        }
        beam.intensity = beamsOn ? HEADLIGHT_POWER * night.value : 0;
      }
    },
    preloadModel(url) {
      const pending = loading.get(url);
      if (pending) return pending;
      const job = loader.loadAsync(url).then((gltf) => {
        // Material.dispose() leaves its maps on the GPU, so each texture is owned too.
        const textures = new Set<Texture>();
        gltf.scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          assets.track(object.geometry);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            assets.track(material);
            // Instanced foliage cannot be depth sorted: leaves are cut out, not blended.
            if (url.includes('/props/') && material instanceof Material && material.transparent) {
              material.transparent = false;
              material.alphaTest = 0.5;
              material.depthWrite = true;
            }
            // The lamp's bulb: dark by day, lit after dusk.
            if (material instanceof MeshStandardMaterial && material.name.endsWith('_bulb')) {
              material.emissive.setHex(0xffd9a0);
              nightGlow.set(material, [0, 3]);
            }
            const slots: unknown[] = Object.values(material as object);
            for (const value of slots) if (isTexture(value)) textures.add(value);
          }
        });
        for (const texture of textures) assets.track(texture);
        models.set(url, { scene: gltf.scene, animations: gltf.animations });
      });
      loading.set(url, job);
      return job;
    },
    addMesh(desc) {
      const geometry = assets.track(createGeometry(desc));
      const material = desc.wireframe
        ? assets.track(new MeshBasicMaterial({ color: desc.color, wireframe: true }))
        : surfaceMaterial(desc, geometry);
      const mesh = new Mesh(geometry, material);
      const receives = !desc.wireframe && desc.surface !== 'water';
      mesh.castShadow = receives && !isGround(desc.finish);
      mesh.receiveShadow = receives;
      place(mesh, desc.position, desc.rotation);
      const parent = desc.parent ? meshes.get(desc.parent)?.object : scene;
      (parent ?? scene).add(mesh);
      const id = nextId;
      nextId += 1;
      meshes.set(id, { object: mesh });
      return id;
    },
    addModel(desc) {
      const cached = models.get(desc.url);
      if (!cached) throw new Error(`Modelo não carregado: ${desc.url}`);
      const model = cloneSkinned(cached.scene);
      shade(model);
      model.traverse((object) => {
        object.frustumCulled = false;
      });
      if (desc.url.endsWith('car.glb')) dressCar(model, assets, carMaterials);
      if (desc.tint !== undefined) tintPaint(model, assets, desc.tint);
      const pivot = new Group();
      pivot.add(model);
      if (desc.offset) pivot.position.set(desc.offset.x, desc.offset.y, desc.offset.z);
      if (desc.alignYaw) pivot.rotation.y = desc.alignYaw;
      if (desc.scale) pivot.scale.setScalar(desc.scale);
      const root = new Group();
      root.add(pivot);
      place(root, desc.position, desc.rotation);
      scene.add(root);
      const mixer = new AnimationMixer(model);
      const clipLibrary = desc.clipSource ? models.get(desc.clipSource) : cached;
      if (desc.clipSource && !clipLibrary)
        throw new Error(`Animações não carregadas: ${desc.clipSource}`);
      const actions = bindClips(mixer, clipLibrary?.animations ?? [], desc.clips);
      const id = nextId;
      nextId += 1;
      meshes.set(id, { object: root, mixer, actions });
      return id;
    },
    addInstances(desc) {
      const wall = desc.unit && desc.finish !== undefined && WALL_FINISHES.has(desc.finish);
      const geometry = wall
        ? wallGeometry(desc)
        : desc.unit
          ? sharedUnit(desc.kind ?? 'box')
          : assets.track(instanceGeometry(desc));
      const material = desc.unit ? worldMaterial(desc) : surfaceMaterial(desc, geometry);
      const mesh = new InstancedMesh(geometry, material, desc.count);
      mesh.castShadow = desc.castShadow === true;
      mesh.receiveShadow = true;
      const array = mesh.instanceMatrix.array;
      if (array instanceof Float32Array) array.set(desc.matrices.subarray(0, desc.count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      if (desc.colors) {
        mesh.instanceColor = new InstancedBufferAttribute(desc.colors, 3);
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
      scene.add(mesh);
      const id = nextId;
      nextId += 1;
      meshes.set(id, { object: mesh });
      return id;
    },
    addModelInstances(desc) {
      const cached = models.get(desc.url);
      if (!cached) throw new Error(`Modelo não carregado: ${desc.url}`);
      const group = new Group();
      const node = new Matrix4();
      const each = new Matrix4();
      const bulb = new Vector3();
      let centers: Float32Array | null = null;
      cached.scene.updateMatrixWorld(true);
      cached.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        // Geometry and material stay the cached ones: every copy shares them.
        const painted = desc.paint ? paintFor(object, object.material) : null;
        const mesh = new InstancedMesh(object.geometry, painted ?? object.material, desc.count);
        if (painted && desc.paint) {
          mesh.instanceColor = new InstancedBufferAttribute(desc.paint.slice(0, desc.count * 3), 3);
        }
        node.copy(object.matrixWorld);
        for (let i = 0; i < desc.count; i += 1) {
          each.fromArray(desc.matrices, i * 16).multiply(node);
          mesh.setMatrixAt(i, each);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = desc.castShadow === true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        const material: unknown = object.material;
        const shape: unknown = object.geometry;
        const lit = material instanceof MeshStandardMaterial && nightGlow.has(material);
        if (lit && shape instanceof BufferGeometry && !centers) {
          // Where each copy's bulb is, for the lamp lights to find.
          shape.computeBoundingBox();
          centers = new Float32Array(desc.count * 3);
          for (let i = 0; i < desc.count; i += 1) {
            shape.boundingBox?.getCenter(bulb);
            bulb.applyMatrix4(node).applyMatrix4(each.fromArray(desc.matrices, i * 16));
            centers.set([bulb.x, bulb.y, bulb.z], i * 3);
          }
        }
      });
      scene.add(group);
      const id = nextId;
      nextId += 1;
      meshes.set(id, { object: group });
      if (centers) glows.set(id, centers);
      return id;
    },
    addTerrain(desc) {
      const geometry = assets.track(terrainGeometry(desc));
      const material = assets.track(terrainMaterial());
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      scene.add(mesh);
      const id = nextId;
      nextId += 1;
      meshes.set(id, { object: mesh });
      return id;
    },
    setMeshTransform(id, position, rotation) {
      const record = meshes.get(id);
      if (!record) return;
      place(record.object, position, rotation);
    },
    setMeshVisible(id, visible) {
      const record = meshes.get(id);
      if (!record) return;
      record.object.visible = visible;
    },
    setInstances(id, matrices, colors, count) {
      const record = meshes.get(id);
      const mesh = record?.object;
      if (!(mesh instanceof InstancedMesh)) return;
      const next = Math.max(0, Math.min(count, mesh.instanceMatrix.count));
      mesh.count = next;
      const target = mesh.instanceMatrix.array;
      if (target instanceof Float32Array) target.set(matrices.subarray(0, next * 16));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      if (mesh.instanceColor && colors.length >= next * 3) {
        const paint = mesh.instanceColor.array;
        if (paint instanceof Float32Array) paint.set(colors.subarray(0, next * 3));
        mesh.instanceColor.needsUpdate = true;
      }
    },
    playClip(id, clip, token) {
      const record = meshes.get(id);
      const action = record?.actions?.get(clip);
      if (!record || !action) return;
      if (record.clip === clip && record.token === token) return;
      const previous = record.clip ? record.actions?.get(record.clip) : undefined;
      const held = clip === 'die';
      const once = held || clip === 'punch' || clip === 'jump';
      if (held) record.mixer?.stopAllAction();
      action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      action.reset().setEffectiveWeight(1).play();
      if (held) {
        action.time = Math.max(0, action.getClip().duration - 0.05);
        action.paused = true;
      } else if (previous && previous !== action) {
        // Blend from the old clip. Stopping it first blended from the bind pose instead.
        action.crossFadeFrom(previous, 0.12, false);
      }
      record.clip = clip;
      record.token = token;
    },
    tick(dt) {
      elapsed += dt;
      water?.tick(elapsed);
      // Pooled people and corpses spend most of their time hidden; nobody sees them animate.
      for (const record of meshes.values()) {
        if (record.mixer && record.object.visible) record.mixer.update(dt);
      }
    },
    drawCalls() {
      return calls;
    },
    render() {
      placeLampLights();
      renderer.info.reset();
      composer.render();
      calls = renderer.info.render.calls;
    },
    dispose() {
      scene.traverse((object) => {
        if (object instanceof InstancedMesh) object.dispose();
      });
      composer.dispose();
      sky.dispose();
      ktx2.dispose();
      renderer.dispose();
      // Browsers cap live WebGL contexts; a menu restart must give this one back now.
      renderer.forceContextLoss();
      scene.clear();
    },
  };
}

function isGround(finish: SurfaceFinish | undefined): boolean {
  return (
    finish === 'asphalt' ||
    finish === 'concrete' ||
    finish === 'sidewalk' ||
    finish === 'sand' ||
    finish === 'grass' ||
    finish === 'lane' ||
    finish === 'plaza' ||
    finish === 'rock' ||
    finish === 'dirt'
  );
}

function createGeometry(desc: MeshDesc) {
  if (desc.kind === 'capsule') return new CapsuleGeometry(desc.size.x, desc.size.y, 4, 12);
  if (desc.kind === 'cylinder') {
    const geometry = new CylinderGeometry(desc.size.x, desc.size.x, desc.size.y, 16);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }
  return new BoxGeometry(desc.size.x, desc.size.y, desc.size.z);
}

function terrainGeometry(desc: TerrainDesc): BufferGeometry {
  const { rows, cols, originX, originZ, sizeX, sizeZ, heights, colors } = desc;
  const positions = new Float32Array(rows * cols * 3);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const index = iz * cols + ix;
      const o = index * 3;
      positions[o] = originX + (ix / (cols - 1)) * sizeX;
      positions[o + 1] = heights[index] ?? 0;
      positions[o + 2] = originZ + (iz / (rows - 1)) * sizeZ;
    }
  }
  const indices = new Uint32Array((rows - 1) * (cols - 1) * 6);
  let t = 0;
  for (let iz = 0; iz < rows - 1; iz += 1) {
    for (let ix = 0; ix < cols - 1; ix += 1) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[t] = a;
      indices[t + 1] = c;
      indices[t + 2] = b;
      indices[t + 3] = b;
      indices[t + 4] = c;
      indices[t + 5] = d;
      t += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('splat', new BufferAttribute(desc.splat, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function instanceGeometry(desc: InstanceBatchDesc) {
  if (desc.kind === 'cylinder')
    return new CylinderGeometry(desc.size.x, desc.size.x, desc.size.y, 8);
  return new BoxGeometry(desc.size.x, desc.size.y, desc.size.z);
}

const clipKeys: ClipKey[] = ['idle', 'walk', 'run', 'punch', 'jump', 'die', 'sit'];

function bindClips(
  mixer: AnimationMixer,
  animations: AnimationClip[],
  clips: ModelDesc['clips'],
): Map<ClipKey, AnimationAction> {
  const actions = new Map<ClipKey, AnimationAction>();
  if (!clips) return actions;
  for (const key of clipKeys) {
    const name = clips[key];
    if (!name) continue;
    const clip = animations.find((item) => item.name === name);
    if (!clip) continue;
    actions.set(key, mixer.clipAction(clip));
  }
  return actions;
}

function tintPaint(root: Object3D, assets: AssetManager, tint: number): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || onWheel(object)) return;
    const source: unknown = object.material;
    if (!(source instanceof MeshStandardMaterial) || source.metalness < 0.4) return;
    const material = assets.track(source.clone());
    material.color.setHex(tint);
    object.material = material;
  });
}

function isTexture(value: unknown): value is Texture {
  return value instanceof Texture;
}

/** Rims are metallic too, but the paint stays on the body. */
function onWheel(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (/wheel|rim|tire|tyre/i.test(node.name)) return true;
  }
  return false;
}

function shade(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object instanceof SkinnedMesh) object.frustumCulled = false;
  });
}

function place(object: Object3D, position: Vec3, rotation?: Quat): void {
  object.position.set(position.x, position.y, position.z);
  if (rotation) object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}
