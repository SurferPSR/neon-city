import * as THREE from 'three';
import type * as RapierTypes from '@dimforge/rapier3d-compat';
type RapierApi = typeof import('@dimforge/rapier3d-compat');

export interface DriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export class PlayerVehicle {
  readonly body: RapierTypes.RigidBody;
  readonly visual = new THREE.Group();
  readonly headlights: THREE.PointLight[] = [];
  private physicsAccumulator = 0;

  constructor(physics: RapierTypes.World, rapier: RapierApi) {
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(0, 0.55, 0)
      .setCanSleep(false)
      .setLinearDamping(0.12)
      .setAngularDamping(8)
      .lockRotations();
    this.body = physics.createRigidBody(bodyDesc);
    physics.createCollider(
      rapier.ColliderDesc.cuboid(1.12, 0.65, 2.28)
        .setDensity(1.8)
        .setFriction(0.9)
        .setRestitution(0.06),
      this.body,
    );
    this.buildModel();
  }

  private buildModel(): void {
    const paint = new THREE.MeshStandardMaterial({ color: 0xc52369, metalness: 0.72, roughness: 0.25 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x11121e, metalness: 0.6, roughness: 0.38 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x101c35, metalness: 0.55, roughness: 0.14, transparent: true, opacity: 0.84 });
    const headlight = new THREE.MeshBasicMaterial({ color: 0xffefbe, toneMapped: false });
    const tailLight = new THREE.MeshBasicMaterial({ color: 0xff1f5f, toneMapped: false });

    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 4.25), paint);
    lower.position.y = 0.08;
    this.visual.add(lower);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 1.2), paint);
    hood.position.set(0, 0.34, -1.26);
    this.visual.add(hood);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.72, 1.82), glass);
    cabin.position.set(0, 0.66, 0.12);
    this.visual.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.11, 1.18), paint);
    roof.position.set(0, 1.03, 0.18);
    this.visual.add(roof);
    const frontLip = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.15, 0.3), trim);
    frontLip.position.set(0, -0.08, -2.04);
    this.visual.add(frontLip);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 0.3), trim);
    bumper.position.set(0, -0.02, 2.1);
    this.visual.add(bumper);

    const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.3, 12);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x101118, roughness: 0.75 });
    const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.31, 10);
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca5b8, metalness: 0.85, roughness: 0.28 });
    for (const x of [-1.08, 1.08]) {
      for (const z of [-1.38, 1.38]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -0.1, z);
        this.visual.add(wheel);
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.rotation.z = Math.PI / 2;
        rim.position.copy(wheel.position);
        this.visual.add(rim);
      }
    }
    for (const x of [-0.68, 0.68]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.08), headlight);
      lamp.position.set(x, 0.3, -2.15);
      this.visual.add(lamp);
      const glow = new THREE.PointLight(0xffe0aa, 5, 28, 2);
      glow.position.set(x, 0.34, -2.26);
      this.visual.add(glow);
      this.headlights.push(glow);
      const rear = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.08), tailLight);
      rear.position.set(x, 0.25, 2.15);
      this.visual.add(rear);
    }
    this.visual.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  update(input: DriveInput, delta: number, physics: RapierTypes.World): void {
    const dt = Math.min(delta, 1 / 30);
    const velocity = this.body.linvel();
    const yaw = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(this.body.rotation().x, this.body.rotation().y, this.body.rotation().z, this.body.rotation().w),
      'YXZ',
    ).y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let longitudinal = velocity.x * forward.x + velocity.z * forward.z;
    let lateral = velocity.x * right.x + velocity.z * right.z;

    const acceleration = input.throttle >= 0 ? 30 : 52;
    longitudinal += input.throttle * acceleration * dt;
    longitudinal = THREE.MathUtils.clamp(longitudinal, -14, 44);
    lateral *= Math.pow(input.handbrake ? 0.992 : 0.88, dt * 60);
    longitudinal *= Math.pow(input.throttle === 0 ? 0.986 : 0.998, dt * 60);
    const speedFactor = THREE.MathUtils.clamp(Math.abs(longitudinal) / 8, 0.12, 1.4);
    const turnRate = 1.72 * speedFactor * (input.handbrake ? 1.45 : 1);
    const nextYaw = yaw + input.steer * turnRate * dt * (longitudinal >= -0.5 ? 1 : -1);
    const nextForward = new THREE.Vector3(-Math.sin(nextYaw), 0, -Math.cos(nextYaw));
    const nextRight = new THREE.Vector3(Math.cos(nextYaw), 0, -Math.sin(nextYaw));
    this.body.setRotation(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, nextYaw), true);
    this.body.setLinvel(
      { x: nextForward.x * longitudinal + nextRight.x * lateral, y: velocity.y, z: nextForward.z * longitudinal + nextRight.z * lateral },
      true,
    );
    this.physicsAccumulator += dt;
    while (this.physicsAccumulator >= 1 / 60) {
      physics.step();
      this.physicsAccumulator -= 1 / 60;
    }
    const position = this.body.translation();
    const rotation = this.body.rotation();
    this.visual.position.set(position.x, position.y, position.z);
    this.visual.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  get speedKmh(): number {
    const velocity = this.body.linvel();
    return Math.round(Math.hypot(velocity.x, velocity.z) * 3.6);
  }

  get position(): THREE.Vector3 {
    const position = this.body.translation();
    return new THREE.Vector3(position.x, position.y, position.z);
  }

  get yaw(): number {
    const rotation = this.body.rotation();
    return new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), 'YXZ').y;
  }
}
