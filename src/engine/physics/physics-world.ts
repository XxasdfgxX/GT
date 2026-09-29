/** Physics service used by gameplay. Rapier types stay inside the adapter. */

import type { Disposable } from '../core/disposable';
import type { Quat, Vec3 } from '../core/math';

export interface StaticBoxDesc {
  position: Vec3;
  halfExtents: Vec3;
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
  createCharacter(desc: CharacterDesc): number;
  moveCharacter(id: number, delta: Vec3): void;
  isGrounded(id: number): boolean;
  setBodyEnabled(id: number, enabled: boolean): void;
  setTransform(id: number, position: Vec3, rotation: Quat): void;
  getTransform(id: number, outPos: Vec3, outRot: Quat): void;
  createVehicle(desc: VehicleCreateDesc): number;
  setVehicleInput(id: number, input: VehicleInput): void;
  forwardSpeed(id: number): number;
  wheelPoses(id: number, out: WheelPose[]): number;
  bodyCount(): number;
}
