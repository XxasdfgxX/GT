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
  Fog,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Material,
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
import { loadCoastEnvironment } from './environment';
import { dressCar } from './materials/car-paint';
import { MaterialLibrary, TILE_METERS, tileBoxUvs } from './materials/material-library';
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
import { HORIZON_COLOR } from './sky';
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
  renderer.setClearColor(HORIZON_COLOR, 1);

  const scene = new Scene();
  scene.fog = new Fog(HORIZON_COLOR, 520, 2400);

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
  const materials = new MaterialLibrary(assets, renderer.capabilities.getMaxAnisotropy());
  const carMaterials = new Map<string, Material>();
  const worldMaterials = new Map<string, MeshStandardMaterial>();
  let unitBox: BoxGeometry | undefined;
  let unitCylinder: CylinderGeometry | undefined;
  let dayTime = 0.45;

  const meshes = new Map<number, MeshRecord>();
  const models = new Map<string, CachedModel>();
  const loading = new Map<string, Promise<void>>();
  const loader = new GLTFLoader();
  let nextId = 1;
  let calls = 0;
  let pixelCap = MAX_PIXEL_RATIO;

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
      worldMaterials.set(key, material);
      return material;
    }
    const cached = worldMaterials.get(desc.finish);
    if (cached) return cached;
    // A float literal: lane paint tiles every 1 m, and `* 1` would not compile.
    const tile = glslFloat(1 / TILE_METERS[desc.finish]);
    const material = assets.track(materials.resolve(desc.finish, 0xffffff).clone());
    material.color.set(0xffffff);
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
        #endif
        #include <project_vertex>
        `,
      );
    };
    worldMaterials.set(desc.finish, material);
    return material;
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
      return Promise.all([loadCoastEnvironment(renderer, scene, assets), materials.load()]).then(
        () => {
          ambient.intensity = 0.04;
          skyLight.intensity = 0.18;
          sun.intensity = 1.85;
        },
      );
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
      sunController.setEnabled(map > 0);
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
      sunController.setTimeOfDay(time);
    },
    timeOfDay() {
      return dayTime;
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
      const geometry = desc.unit
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
    addTerrain(desc) {
      const geometry = assets.track(terrainGeometry(desc));
      const material = assets.track(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }),
      );
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
      // Pooled people and corpses spend most of their time hidden; nobody sees them animate.
      for (const record of meshes.values()) {
        if (record.mixer && record.object.visible) record.mixer.update(dt);
      }
    },
    drawCalls() {
      return calls;
    },
    render() {
      renderer.info.reset();
      composer.render();
      calls = renderer.info.render.calls;
    },
    dispose() {
      scene.traverse((object) => {
        if (object instanceof InstancedMesh) object.dispose();
      });
      composer.dispose();
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
    finish === 'lane'
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
