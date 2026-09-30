/** Three.js renderer. Geometries and materials are registered with the asset owner. */

import {
  ACESFilmicToneMapping,
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
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  SkinnedMesh,
  SRGBColorSpace,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetManager } from '../assets/asset-manager';
import type { Quat, Vec3 } from '../core/math';
import {
  canvasAntialias,
  cappedPixelRatio,
  DEFAULT_EXPOSURE,
  MAX_PIXEL_RATIO,
  shadowMapSize,
  sharpnessCap,
  type ShadowQuality,
  type Sharpness,
} from './display';
import { loadCoastEnvironment } from './environment';
import { dressCar } from './materials/car-paint';
import { MaterialLibrary, TILE_METERS, tileBoxUvs } from './materials/material-library';
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

export function createThreeRenderer(canvas: HTMLCanvasElement, assets: AssetManager): Renderer {
  const renderer = new WebGLRenderer({ canvas, antialias: canvasAntialias(false) });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio));
  renderer.setClearColor(HORIZON_COLOR, 1);

  const scene = new Scene();
  scene.fog = new Fog(HORIZON_COLOR, 520, 2400);

  const camera = new PerspectiveCamera(58, 1, 0.3, worldFar);
  const projected = new Vector3();
  const cameraSpace = new Vector3();
  const ambient = new AmbientLight(0xfff6ea, 0.16);
  const skyLight = new HemisphereLight(0x9fd0ef, 0x3d6a38, 0.55);
  const sun = new DirectionalLight(0xfff0d0, 2.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
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
    const tile = 1 / TILE_METERS[desc.finish];
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
      tileBoxUvs(
        geometry,
        desc.size.x,
        desc.size.y,
        desc.size.z,
        TILE_METERS[desc.finish],
        material.aoMap !== null,
      );
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
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    setGraphics(quality: { shadows: ShadowQuality; sharpness: Sharpness }) {
      pixelCap = sharpnessCap(quality.sharpness);
      const map = shadowMapSize(quality.shadows);
      renderer.shadowMap.enabled = map > 0;
      sunController.setEnabled(map > 0);
      if (map > 0) sunController.setMapSize(map);
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
        gltf.scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          assets.track(object.geometry);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) assets.track(material);
        });
        models.set(url, { scene: gltf.scene, animations: gltf.animations });
      });
      loading.set(url, job);
      return job;
    },
    addMesh(desc) {
      const geometry = assets.track(createGeometry(desc));
      const material = surfaceMaterial(desc, geometry);
      const mesh = new Mesh(geometry, material);
      const receives = desc.surface !== 'water';
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
      const actions = bindClips(mixer, cached.animations, desc.clips);
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
      record.mixer?.stopAllAction();
      const once = clip === 'punch' || clip === 'jump' || clip === 'die';
      action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      action.reset().fadeIn(0.12).play();
      record.clip = clip;
      record.token = token;
    },
    tick(dt) {
      for (const record of meshes.values()) record.mixer?.update(dt);
    },
    drawCalls() {
      return calls;
    },
    render() {
      renderer.render(scene, camera);
      calls = renderer.info.render.calls;
    },
    dispose() {
      renderer.dispose();
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
    if (!(object instanceof Mesh)) return;
    const source: unknown = object.material;
    if (!(source instanceof MeshStandardMaterial) || source.metalness < 0.4) return;
    const material = assets.track(source.clone());
    material.color.setHex(tint);
    object.material = material;
  });
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
