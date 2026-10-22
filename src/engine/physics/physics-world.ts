/** Physics service used by gameplay. Rapier types stay inside the adapter. */

import type { Disposable } from '../core/disposable';
import type { Quat, Vec3 } from '../core/math';

export interface StaticBoxDesc {
  position: Vec3;
  halfExtents: Vec3;
  rotation?: Quat;
}

export interface HeightfieldDesc {
  position: Vec3;
  /** Cells along Z. The height buffer has (rows + 1) vertices on that axis. */
  rows: number;
  /** Cells along X. The height buffer has (cols + 1) vertices on that axis. */
  cols: number;
  /** Column-major vertices, length (rows + 1) * (cols + 1). */
  heights: Float32Array;
  scale: Vec3;
}

export interface KinematicBoxDesc {
  position: Vec3;
  halfExtents: Vec3;
  rotation?: Quat;
}

export interface CharacterDesc {
  position: Vec3;
  radius: number;
  halfHeight: number;
}

export interface VehicleCreateDesc {
  position: Vec3;
  halfExtents: Vec3;
  mass: number;
  wheelRadius: number;
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  maxSuspensionForce: number;
  frictionSlip: number;
  sideFrictionStiffness: number;
  engineForce: number;
  brakeForce: number;
  handbrakeForce: number;
  maxSteer: number;
  steerSign: number;
}

export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  /** Signed drive-wheel force. Negative slows a car that is rolling forward. */
  drag?: number;
}

export interface WheelPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface PhysicsWorld extends Disposable {
  step(dt: number): void;
  createStaticBox(desc: StaticBoxDesc): number;
  createHeightfield(desc: HeightfieldDesc): number;
  createKinematicBox(desc: KinematicBoxDesc): number;
  promoteDynamic(id: number, mass: number): void;
  /** Back to kinematic with no velocity, so a recycled wreck follows its lane again. */
  demoteKinematic(id: number): void;
  applyImpulse(id: number, impulse: Vec3): void;
  createCharacter(desc: CharacterDesc): number;
  moveCharacter(id: number, delta: Vec3): void;
  /**
   * If the pending move left the capsule center below minY, lift it and mark it grounded.
   * Returns true when the body was raised.
   */
  raiseCharacter(id: number, minY: number): boolean;
  /** True when the last move was cut short by a building or a car. */
  wasBlocked(id: number): boolean;
  isGrounded(id: number): boolean;
  setBodyEnabled(id: number, enabled: boolean): void;
  setTransform(id: number, position: Vec3, rotation: Quat): void;
  /** Slides a body on the ground without clearing its velocity. */
  shiftBody(id: number, dx: number, dz: number): void;
  getTransform(id: number, outPos: Vec3, outRot: Quat): void;
  createVehicle(desc: VehicleCreateDesc): number;
  setVehicleInput(id: number, input: VehicleInput): void;
  /** Replaces the drive force. Used when the player changes cars without a new chassis. */
  setVehiclePower(id: number, engineForce: number): void;
  forwardSpeed(id: number): number;
  wheelPoses(id: number, out: WheelPose[]): number;
  bodyCount(): number;
}
