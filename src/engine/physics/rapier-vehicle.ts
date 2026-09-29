/** Raycast vehicle. Wheel poses are written into caller storage; scratch vectors are reused. */

import RAPIER from '@dimforge/rapier3d-compat';
import type {
  Collider,
  DynamicRayCastVehicleController,
  RigidBody,
  World,
} from '@dimforge/rapier3d-compat';
import { quatFromAxisAngle, quatMul, rotateVec3ByQuat, type Quat, type Vec3 } from '../core/math';
import { Groups } from './layers';
import type { VehicleCreateDesc, VehicleInput, WheelPose } from './physics-world';

export interface VehicleRecord {
  body: RigidBody;
  collider: Collider;
  controller: DynamicRayCastVehicleController;
  engineForce: number;
  brakeForce: number;
  handbrakeForce: number;
  maxSteer: number;
  steerSign: number;
  restLength: number;
  excludeChassis: (collider: Collider) => boolean;
}

const localConnection: Vec3 = { x: 0, y: 0, z: 0 };
const localDir: Vec3 = { x: 0, y: 0, z: 0 };
const rotatedConnection: Vec3 = { x: 0, y: 0, z: 0 };
const rotatedDir: Vec3 = { x: 0, y: 0, z: 0 };
const chassisRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const steerQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
const rollQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
const spinQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
const wheelRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const forward: Vec3 = { x: 0, y: 0, z: 1 };
const forwardWorld: Vec3 = { x: 0, y: 0, z: 1 };

export function attachVehicle(world: World, desc: VehicleCreateDesc): VehicleRecord {
  const { x: hx, y: hy, z: hz } = desc.halfExtents;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(desc.position.x, desc.position.y, desc.position.z)
      .setLinearDamping(0.15)
      .setAngularDamping(3.2)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(0.8)
      .setRestitution(0.02)
      .setDensity(0.001)
      .setCollisionGroups(Groups.vehicle),
    body,
  );
  const inertia = (mass: number, a: number, b: number) => (mass / 3) * (a * a + b * b);
  body.setAdditionalMassProperties(
    desc.mass,
    new RAPIER.Vector3(0, -0.4, 0.2),
    new RAPIER.Vector3(
      inertia(desc.mass, hy, hz),
      inertia(desc.mass, hx, hz),
      inertia(desc.mass, hx, hy),
    ),
    new RAPIER.Quaternion(0, 0, 0, 1),
    true,
  );

  const controller = world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const x = hx * 0.9;
  const z = hz * 0.62;
  const y = -hy - 0.05;
  const corners = [
    { x: -x, y, z },
    { x, y, z },
    { x: -x, y, z: -z },
    { x, y, z: -z },
  ];
  for (const wheel of corners) {
    controller.addWheel(
      new RAPIER.Vector3(wheel.x, wheel.y, wheel.z),
      new RAPIER.Vector3(0, -1, 0),
      new RAPIER.Vector3(-1, 0, 0),
      desc.suspensionRestLength,
      desc.wheelRadius,
    );
  }
  for (let i = 0; i < 4; i += 1) {
    controller.setWheelSuspensionStiffness(i, desc.suspensionStiffness);
    controller.setWheelSuspensionCompression(i, desc.suspensionCompression);
    controller.setWheelSuspensionRelaxation(i, desc.suspensionRelaxation);
    controller.setWheelMaxSuspensionTravel(i, desc.maxSuspensionTravel);
    controller.setWheelMaxSuspensionForce(i, desc.maxSuspensionForce);
    controller.setWheelFrictionSlip(i, desc.frictionSlip);
    controller.setWheelSideFrictionStiffness(i, desc.sideFrictionStiffness);
  }

  const chassisHandle = collider.handle;
  return {
    body,
    collider,
    controller,
    engineForce: desc.engineForce,
    brakeForce: desc.brakeForce,
    handbrakeForce: desc.handbrakeForce,
    maxSteer: desc.maxSteer,
    steerSign: desc.steerSign,
    restLength: desc.suspensionRestLength,
    excludeChassis: (hit) => hit.handle !== chassisHandle,
  };
}

export function applyVehicleInput(record: VehicleRecord, input: VehicleInput): void {
  const drive = input.throttle * record.engineForce;
  const brake = input.brake * record.brakeForce;
  const park = input.handbrake ? record.handbrakeForce : 0;
  const steer = input.steer * record.maxSteer * record.steerSign;
  const { controller } = record;
  controller.setWheelSteering(0, steer);
  controller.setWheelSteering(1, steer);
  controller.setWheelSteering(2, 0);
  controller.setWheelSteering(3, 0);
  controller.setWheelEngineForce(0, 0);
  controller.setWheelEngineForce(1, 0);
  controller.setWheelEngineForce(2, drive);
  controller.setWheelEngineForce(3, drive);
  controller.setWheelBrake(0, brake * 0.35);
  controller.setWheelBrake(1, brake * 0.35);
  controller.setWheelBrake(2, brake + park);
  controller.setWheelBrake(3, brake + park);
}

export function readForwardSpeed(
  record: VehicleRecord,
  linvel: RAPIER.Vector3,
  rotation: RAPIER.Quaternion,
): number {
  const velocity = record.body.linvel(linvel);
  const rot = record.body.rotation(rotation);
  chassisRot.x = rot.x;
  chassisRot.y = rot.y;
  chassisRot.z = rot.z;
  chassisRot.w = rot.w;
  rotateVec3ByQuat(chassisRot, forward, forwardWorld);
  return velocity.x * forwardWorld.x + velocity.y * forwardWorld.y + velocity.z * forwardWorld.z;
}

export function readWheelPoses(
  record: VehicleRecord,
  out: WheelPose[],
  connection: RAPIER.Vector3,
  direction: RAPIER.Vector3,
  rotation: RAPIER.Quaternion,
  translation: RAPIER.Vector3,
): number {
  const pos = record.body.translation(translation);
  const rot = record.body.rotation(rotation);
  chassisRot.x = rot.x;
  chassisRot.y = rot.y;
  chassisRot.z = rot.z;
  chassisRot.w = rot.w;
  const count = Math.min(4, out.length);
  for (let i = 0; i < count; i += 1) {
    const pose = out[i];
    if (!pose) continue;
    const link = record.controller.wheelChassisConnectionPointCs(i, connection);
    const dir = record.controller.wheelDirectionCs(i, direction);
    if (!link || !dir) continue;
    localConnection.x = link.x;
    localConnection.y = link.y;
    localConnection.z = link.z;
    localDir.x = dir.x;
    localDir.y = dir.y;
    localDir.z = dir.z;
    rotateVec3ByQuat(chassisRot, localConnection, rotatedConnection);
    rotateVec3ByQuat(chassisRot, localDir, rotatedDir);
    const length = record.controller.wheelSuspensionLength(i) ?? record.restLength;
    pose.x = pos.x + rotatedConnection.x + rotatedDir.x * length;
    pose.y = pos.y + rotatedConnection.y + rotatedDir.y * length;
    pose.z = pos.z + rotatedConnection.z + rotatedDir.z * length;
    const steer = record.controller.wheelSteering(i) ?? 0;
    const roll = record.controller.wheelRotation(i) ?? 0;
    quatFromAxisAngle(0, 1, 0, steer, steerQuat);
    quatFromAxisAngle(1, 0, 0, roll, rollQuat);
    quatMul(steerQuat, rollQuat, spinQuat);
    quatMul(chassisRot, spinQuat, wheelRot);
    pose.qx = wheelRot.x;
    pose.qy = wheelRot.y;
    pose.qz = wheelRot.z;
    pose.qw = wheelRot.w;
  }
  return count;
}
