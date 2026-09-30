/** SoA stores. Entity ids are the indexes. Capacity covers the blockout, not an open city. */

export const CAP = 2048;

export const Transform = {
  px: new Float32Array(CAP),
  py: new Float32Array(CAP),
  pz: new Float32Array(CAP),
  qx: new Float32Array(CAP),
  qy: new Float32Array(CAP),
  qz: new Float32Array(CAP),
  qw: new Float32Array(CAP),
  ppx: new Float32Array(CAP),
  ppy: new Float32Array(CAP),
  ppz: new Float32Array(CAP),
  pqx: new Float32Array(CAP),
  pqy: new Float32Array(CAP),
  pqz: new Float32Array(CAP),
  pqw: new Float32Array(CAP),
};

export const Velocity = {
  x: new Float32Array(CAP),
  y: new Float32Array(CAP),
  z: new Float32Array(CAP),
};

export const Player = {
  mode: new Uint8Array(CAP),
  speed: new Float32Array(CAP),
  sprintSpeed: new Float32Array(CAP),
  jumpSpeed: new Float32Array(CAP),
  facing: new Float32Array(CAP),
  vehicle: new Uint32Array(CAP),
  prompt: new Uint8Array(CAP),
  action: new Float32Array(CAP),
  punchSerial: new Uint16Array(CAP),
  health: new Float32Array(CAP),
  /** Damage of the swing that is in progress. */
  punchPower: new Uint8Array(CAP),
  /** Seconds until the fist connects. Zero means no pending hit. */
  punchWindow: new Float32Array(CAP),
  /** 1 on the frame a punch connects. */
  strike: new Uint8Array(CAP),
  cash: new Float32Array(CAP),
  /** Seconds left on a solo respawn. 0 means the body is not waiting. */
  life: new Float32Array(CAP),
  /** Solo respawn point, copied from the spawn chosen at entry. */
  homeX: new Float32Array(CAP),
  homeY: new Float32Array(CAP),
  homeZ: new Float32Array(CAP),
  placeSerial: new Uint16Array(CAP),
  /** 1 while the mesh and body are hidden after death. */
  hidden: new Uint8Array(CAP),
};

export const InputState = {
  moveX: new Float32Array(CAP),
  moveZ: new Float32Array(CAP),
  throttle: new Float32Array(CAP),
  brake: new Float32Array(CAP),
  steer: new Float32Array(CAP),
  sprint: new Uint8Array(CAP),
  jump: new Uint8Array(CAP),
  interact: new Uint8Array(CAP),
  handbrake: new Uint8Array(CAP),
  lookX: new Float32Array(CAP),
  lookY: new Float32Array(CAP),
  zoom: new Float32Array(CAP),
  punch: new Uint8Array(CAP),
  heavy: new Uint8Array(CAP),
};

export const PhysicsRef = {
  body: new Uint32Array(CAP),
};

export const RenderRef = {
  mesh: new Uint32Array(CAP),
};

export const Vehicle = {
  occupied: new Uint8Array(CAP),
  speed: new Float32Array(CAP),
};

export const Mission = {
  phase: new Uint8Array(CAP),
  time: new Float32Array(CAP),
  pickupMesh: new Uint32Array(CAP),
  dropoffMesh: new Uint32Array(CAP),
};

export const Wheel = {
  vehicle: new Uint32Array(CAP),
  index: new Uint8Array(CAP),
};

export const Traffic = {
  edge: new Uint16Array(CAP),
  lane: new Uint8Array(CAP),
  dir: new Uint8Array(CAP),
  along: new Float32Array(CAP),
  speed: new Float32Array(CAP),
  mode: new Uint8Array(CAP),
  variant: new Uint8Array(CAP),
  active: new Uint8Array(CAP),
};

export const Pedestrian = {
  state: new Uint8Array(CAP),
  variant: new Uint8Array(CAP),
  yaw: new Float32Array(CAP),
  speed: new Float32Array(CAP),
  wait: new Float32Array(CAP),
  tx: new Float32Array(CAP),
  tz: new Float32Array(CAP),
  path: new Uint8Array(CAP),
  count: new Uint8Array(CAP),
  active: new Uint8Array(CAP),
  near: new Uint8Array(CAP),
  /** 1 while this person is the driver of Pedestrian.car. */
  driving: new Uint8Array(CAP),
  car: new Uint16Array(CAP),
  health: new Float32Array(CAP),
  /** Seconds left on the overhead bar. Each hit sets this back to 5. */
  hurt: new Float32Array(CAP),
  /** Seconds until the next counter. */
  cool: new Float32Array(CAP),
  /** Seconds left on the punch clip. */
  swing: new Float32Array(CAP),
  swingId: new Uint16Array(CAP),
  /** Seconds left before a dead body is cleared. 0 while alive. */
  corpse: new Float32Array(CAP),
};

export const Pickup = {
  amount: new Float32Array(CAP),
};

export const CameraRig = {
  yaw: new Float32Array(CAP),
  pitch: new Float32Array(CAP),
  distance: new Float32Array(CAP),
  pivot: new Float32Array(CAP),
  x: new Float32Array(CAP),
  y: new Float32Array(CAP),
  z: new Float32Array(CAP),
  ready: new Uint8Array(CAP),
  lookOffset: new Float32Array(CAP),
};

export function writePose(eid: number, x: number, y: number, z: number): void {
  Transform.px[eid] = x;
  Transform.py[eid] = y;
  Transform.pz[eid] = z;
  Transform.ppx[eid] = x;
  Transform.ppy[eid] = y;
  Transform.ppz[eid] = z;
  Transform.qx[eid] = 0;
  Transform.qy[eid] = 0;
  Transform.qz[eid] = 0;
  Transform.qw[eid] = 1;
  Transform.pqx[eid] = 0;
  Transform.pqy[eid] = 0;
  Transform.pqz[eid] = 0;
  Transform.pqw[eid] = 1;
}
