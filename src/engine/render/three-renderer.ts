/** Three.js renderer. Geometries and materials are registered with the asset owner. */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetManager } from '../assets/asset-manager';
import type { Quat, Vec3 } from '../core/math';
import type { ClipKey, InstanceBatchDesc, MeshDesc, ModelDesc, Renderer } from './renderer';

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

const worldFar = 1200;

export function createThreeRenderer(canvas: HTMLCanvasElement, assets: AssetManager): Renderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x6eadd4, 1);
  renderer.autoClear = false;

  const sunDirection = new Vector3();
  sunDirection.setFromSphericalCoords(1, MathUtils.degToRad(56), MathUtils.degToRad(198));

  const skyScene = new Scene();
  const sky = new Sky();
  sky.scale.setScalar(12000);
  sky.frustumCulled = false;
  tuneSky(sky, sunDirection);
  skyScene.add(sky);
  assets.track(sky.geometry);
  if (sky.material instanceof ShaderMaterial) assets.track(sky.material);

  const scene = new Scene();
  scene.fog = new Fog(0x7eb4dc, 180, 1200);

  const camera = new PerspectiveCamera(58, 1, 0.3, worldFar);
  const ambient = new AmbientLight(0xfff6ea, 0.16);
  const skyLight = new HemisphereLight(0x9fd0ef, 0x3d6a38, 0.55);
  const sun = new DirectionalLight(0xfff0d0, 2.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  scene.add(ambient, skyLight, sun, sun.target);

  const pmrem = new PMREMGenerator(renderer);
  setSunDisc(sky, 0);
  const environment = pmrem.fromScene(skyScene, 0.04, 0.1, 30000).texture;
  setSunDisc(sky, 1);
  scene.environment = environment;
  assets.track(environment);
  pmrem.dispose();

  const sunFocus = new Vector3();
  const aimSun = (x: number, y: number, z: number) => {
    sunFocus.set(x, y, z);
    sun.position.copy(sunFocus).addScaledVector(sunDirection, 90);
    sun.target.position.copy(sunFocus);
    sun.target.updateMatrixWorld();
    const shadowCam = sun.shadow.camera;
    if (!(shadowCam instanceof OrthographicCamera)) return;
    shadowCam.left = -42;
    shadowCam.right = 42;
    shadowCam.top = 42;
    shadowCam.bottom = -42;
    shadowCam.near = 8;
    shadowCam.far = 180;
    shadowCam.updateProjectionMatrix();
  };
  aimSun(0, 0, 0);

  const meshes = new Map<number, MeshRecord>();
  const models = new Map<string, CachedModel>();
  const loading = new Map<string, Promise<void>>();
  const loader = new GLTFLoader();
  let nextId = 1;
  let calls = 0;

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

  return {
    domElement: canvas,
    setSize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    setCamera(position, target) {
      camera.position.set(position.x, position.y, position.z);
      camera.lookAt(target.x, target.y, target.z);
      aimSun(target.x, target.y, target.z);
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
      const material = addMaterial(
        desc.color,
        desc.roughness ?? 0.86,
        desc.metalness ?? 0.02,
        desc.emissive ?? 0,
        desc.surface ?? 'solid',
      );
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = desc.surface !== 'water';
      mesh.receiveShadow = true;
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
      const geometry = assets.track(instanceGeometry(desc));
      const material = addMaterial(
        desc.color,
        desc.roughness ?? 0.86,
        desc.metalness ?? 0.02,
        desc.emissive ?? 0,
      );
      const mesh = new InstancedMesh(geometry, material, desc.count);
      mesh.castShadow = desc.castShadow !== false;
      mesh.receiveShadow = true;
      const array = mesh.instanceMatrix.array;
      if (array instanceof Float32Array) array.set(desc.matrices.subarray(0, desc.count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
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
    playClip(id, clip, token) {
      const record = meshes.get(id);
      const action = record?.actions?.get(clip);
      if (!record || !action) return;
      if (record.clip === clip && record.token === token) return;
      record.mixer?.stopAllAction();
      const once = clip === 'punch' || clip === 'jump';
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
      camera.far = 25000;
      camera.updateProjectionMatrix();
      renderer.clear();
      const exposure = renderer.toneMappingExposure;
      renderer.toneMappingExposure = 0.34;
      renderer.render(skyScene, camera);
      renderer.toneMappingExposure = exposure;
      renderer.clearDepth();
      camera.far = worldFar;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      calls = renderer.info.render.calls;
    },
    dispose() {
      renderer.dispose();
      scene.clear();
      skyScene.clear();
    },
  };
}

function tuneSky(sky: Sky, direction: Vector3): void {
  if (!(sky.material instanceof ShaderMaterial)) return;
  setNumber(sky.material, 'turbidity', 3.1);
  setNumber(sky.material, 'rayleigh', 1.2);
  setNumber(sky.material, 'mieCoefficient', 0.004);
  setNumber(sky.material, 'mieDirectionalG', 0.8);
  setVector(sky.material, 'sunPosition', direction);
}

function setSunDisc(sky: Sky, visible: number): void {
  if (!(sky.material instanceof ShaderMaterial)) return;
  setNumber(sky.material, 'showSunDisc', visible);
}

function setNumber(material: ShaderMaterial, name: string, value: number): void {
  const uniform = material.uniforms[name];
  if (!uniform || typeof uniform.value !== 'number') return;
  uniform.value = value;
}

function setVector(material: ShaderMaterial, name: string, value: Vector3): void {
  const uniform = material.uniforms[name];
  if (!uniform || !(uniform.value instanceof Vector3)) return;
  uniform.value.copy(value);
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

function instanceGeometry(desc: InstanceBatchDesc) {
  if (desc.kind === 'cylinder')
    return new CylinderGeometry(desc.size.x, desc.size.x, desc.size.y, 8);
  return new BoxGeometry(desc.size.x, desc.size.y, desc.size.z);
}

const clipKeys: ClipKey[] = ['idle', 'walk', 'run', 'punch', 'jump'];

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
