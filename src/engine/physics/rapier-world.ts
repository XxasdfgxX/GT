/** Rapier world behind PhysicsWorld. Callers only see numeric body ids. */

import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import type { Quat, Vec3 } from '../core/math';
import { Groups } from './layers';
import type {
  HeightfieldDesc,
  KinematicBoxDesc,
  PhysicsWorld,
  StaticBoxDesc,
  VehicleInput,
  WheelPose,
} from './physics-world';
import {
  attachCharacter,
  moveCharacter,
  type CharacterRecord,
  type MoveScratch,
} from './rapier-character';
import {
  applyVehicleInput,
  attachVehicle,
  readForwardSpeed,
  readWheelPoses,
  type VehicleRecord,
} from './rapier-vehicle';

interface BodyRecord {
  body: RigidBody;
  collider: Collider;
}

export async function createRapierWorld(gravityY: number): Promise<PhysicsWorld> {
  await RAPIER.init();
  return new RapierPhysics(gravityY);
}

class RapierPhysics implements PhysicsWorld {
  private readonly world: RAPIER.World;
  private readonly bodies = new Map<number, BodyRecord>();
  private readonly characters = new Map<number, CharacterRecord>();
  private readonly vehicles = new Map<number, VehicleRecord>();
  private nextId = 1;
  private readonly moveScratch: MoveScratch = {
    delta: new RAPIER.Vector3(0, 0, 0),
    movement: new RAPIER.Vector3(0, 0, 0),
    translation: new RAPIER.Vector3(0, 0, 0),
    next: new RAPIER.Vector3(0, 0, 0),
  };
  private readonly translation = new RAPIER.Vector3(0, 0, 0);
  private readonly rotation = new RAPIER.Quaternion(0, 0, 0, 1);
  private readonly linvel = new RAPIER.Vector3(0, 0, 0);
  private readonly connection = new RAPIER.Vector3(0, 0, 0);
  private readonly direction = new RAPIER.Vector3(0, 0, 0);
  private readonly impulse = new RAPIER.Vector3(0, 0, 0);

  constructor(gravityY: number) {
    this.world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  }

  step(dt: number): void {
    this.world.timestep = dt;
    for (const vehicle of this.vehicles.values()) {
      vehicle.controller.updateVehicle(dt, undefined, Groups.wheelRay, vehicle.excludeChassis);
    }
    this.world.step();
  }

  createStaticBox(desc: StaticBoxDesc): number {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        desc.position.x,
        desc.position.y,
        desc.position.z,
      ),
    );
    if (desc.rotation) {
      this.rotation.x = desc.rotation.x;
      this.rotation.y = desc.rotation.y;
      this.rotation.z = desc.rotation.z;
      this.rotation.w = desc.rotation.w;
      body.setRotation(this.rotation, true);
    }
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        desc.halfExtents.x,
        desc.halfExtents.y,
        desc.halfExtents.z,
      ).setCollisionGroups(Groups.world),
      body,
    );
    return this.store({ body, collider });
  }

  createHeightfield(desc: HeightfieldDesc): number {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        desc.position.x,
        desc.position.y,
        desc.position.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(
        desc.rows,
        desc.cols,
        desc.heights,
        desc.scale,
      ).setCollisionGroups(Groups.world),
      body,
    );
    return this.store({ body, collider });
  }

  createKinematicBox(desc: KinematicBoxDesc): number {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        desc.position.x,
        desc.position.y,
        desc.position.z,
      ),
    );
    if (desc.rotation) {
      this.rotation.x = desc.rotation.x;
      this.rotation.y = desc.rotation.y;
      this.rotation.z = desc.rotation.z;
      this.rotation.w = desc.rotation.w;
      body.setRotation(this.rotation, true);
    }
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        desc.halfExtents.x,
        desc.halfExtents.y,
        desc.halfExtents.z,
      ).setCollisionGroups(Groups.vehicle),
      body,
    );
    return this.store({ body, collider });
  }

  promoteDynamic(id: number, mass: number): void {
    const record = this.bodies.get(id);
    if (!record || !record.body.isKinematic()) return;
    record.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    record.body.setAdditionalMass(mass, true);
  }

  applyImpulse(id: number, impulse: Vec3): void {
    const record = this.bodies.get(id);
    if (!record) return;
    this.impulse.x = impulse.x;
    this.impulse.y = impulse.y;
    this.impulse.z = impulse.z;
    record.body.applyImpulse(this.impulse, true);
  }

  createCharacter(desc: Parameters<PhysicsWorld['createCharacter']>[0]): number {
    const record = attachCharacter(this.world, desc);
    this.characters.set(this.nextId, record);
    return this.store(record);
  }

  moveCharacter(id: number, delta: Vec3): void {
    const record = this.characters.get(id);
    if (!record) return;
    moveCharacter(record, delta, this.moveScratch);
  }

  raiseCharacter(id: number, minY: number): boolean {
    const record = this.characters.get(id);
    if (!record || !record.body.isEnabled()) return false;
    const next = record.body.nextTranslation(this.translation);
    const x = next.x;
    const y = next.y;
    const z = next.z;
    if (y >= minY - 0.01) return false;
    this.translation.x = x;
    this.translation.y = minY;
    this.translation.z = z;
    record.body.setNextKinematicTranslation(this.translation);
    record.grounded = true;
    return true;
  }

  wasBlocked(id: number): boolean {
    return this.characters.get(id)?.blocked ?? false;
  }

  isGrounded(id: number): boolean {
    return this.characters.get(id)?.grounded ?? false;
  }

  setBodyEnabled(id: number, enabled: boolean): void {
    const record = this.bodies.get(id);
    if (!record) return;
    record.body.setEnabled(enabled);
    record.collider.setEnabled(enabled);
  }

  setTransform(id: number, position: Vec3, rotation: Quat): void {
    const record = this.bodies.get(id);
    if (!record) return;
    this.translation.x = position.x;
    this.translation.y = position.y;
    this.translation.z = position.z;
    this.rotation.x = rotation.x;
    this.rotation.y = rotation.y;
    this.rotation.z = rotation.z;
    this.rotation.w = rotation.w;
    record.body.setTranslation(this.translation, true);
    record.body.setRotation(this.rotation, true);
    this.linvel.x = 0;
    this.linvel.y = 0;
    this.linvel.z = 0;
    record.body.setLinvel(this.linvel, true);
    record.body.setAngvel(this.linvel, true);
    if (record.body.isKinematic()) record.body.setNextKinematicTranslation(this.translation);
  }

  getTransform(id: number, outPos: Vec3, outRot: Quat): void {
    const record = this.bodies.get(id);
    if (!record) return;
    const position = record.body.translation(this.translation);
    const rotation = record.body.rotation(this.rotation);
    outPos.x = position.x;
    outPos.y = position.y;
    outPos.z = position.z;
    outRot.x = rotation.x;
    outRot.y = rotation.y;
    outRot.z = rotation.z;
    outRot.w = rotation.w;
  }

  createVehicle(desc: Parameters<PhysicsWorld['createVehicle']>[0]): number {
    const record = attachVehicle(this.world, desc);
    this.vehicles.set(this.nextId, record);
    return this.store(record);
  }

  setVehicleInput(id: number, input: VehicleInput): void {
    const record = this.vehicles.get(id);
    if (!record) return;
    applyVehicleInput(record, input);
  }

  setVehiclePower(id: number, engineForce: number): void {
    const record = this.vehicles.get(id);
    if (!record) return;
    record.engineForce = engineForce;
  }

  forwardSpeed(id: number): number {
    const record = this.vehicles.get(id);
    if (!record) return 0;
    return readForwardSpeed(record, this.linvel, this.rotation);
  }

  wheelPoses(id: number, out: WheelPose[]): number {
    const record = this.vehicles.get(id);
    if (!record) return 0;
    return readWheelPoses(
      record,
      out,
      this.connection,
      this.direction,
      this.rotation,
      this.translation,
    );
  }

  bodyCount(): number {
    return this.world.bodies.len();
  }

  dispose(): void {
    this.world.free();
    this.bodies.clear();
    this.characters.clear();
    this.vehicles.clear();
  }

  private store(record: BodyRecord): number {
    const id = this.nextId;
    this.nextId += 1;
    this.bodies.set(id, record);
    return id;
  }
}
