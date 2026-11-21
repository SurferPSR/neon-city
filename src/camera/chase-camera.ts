import * as THREE from 'three';

export class ChaseCamera {
  private readonly position = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private initialized = false;

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, yaw: number, speed: number, delta: number): void {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const distance = 9.8 + THREE.MathUtils.clamp(speed / 44, 0, 1) * 3.5;
    const desired = target.clone().addScaledVector(forward, -distance).add(new THREE.Vector3(0, 5.5 + speed * 0.025, 0));
    const alpha = 1 - Math.exp(-Math.min(delta, 0.05) * 3.7);
    if (!this.initialized) {
      this.position.copy(desired);
      this.lookAt.copy(target);
      this.initialized = true;
    } else {
      this.position.lerp(desired, alpha);
      this.lookAt.lerp(target.clone().add(new THREE.Vector3(0, 1.1, 0)), alpha * 1.12);
    }
    camera.position.copy(this.position);
    camera.lookAt(this.lookAt);
  }
}
