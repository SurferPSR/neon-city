import * as THREE from 'three';
import type * as RapierTypes from '@dimforge/rapier3d-compat';
type RapierApi = typeof import('@dimforge/rapier3d-compat');

export const BLOCKS = 8;
export const BLOCK_SIZE = 46;
export const ROAD_WIDTH = 15;
export const CITY_HALF = (BLOCKS * BLOCK_SIZE + ROAD_WIDTH) / 2;

const neonColors = [0xff2e88, 0x00f0ff, 0x7c5cff, 0xffa044, 0x33f2b4];

export class CityWorld {
  readonly group = new THREE.Group();
  readonly roadPositions: THREE.Vector3[] = [];
  private readonly pickupPositions: THREE.Vector3[] = [];
  private readonly collectedPickups: boolean[] = [];
  private readonly hiddenPickupMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, -100, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(0, 0, 0),
  );
  private pickupOrbs: THREE.InstancedMesh | null = null;
  private pickupRings: THREE.InstancedMesh | null = null;
  private readonly rng: () => number;
  private readonly physics: RapierTypes.World;
  private readonly rapier: RapierApi;

  constructor(physics: RapierTypes.World, rapier: RapierApi) {
    this.physics = physics;
    this.rapier = rapier;
    let seed = 0x4e454f4e;
    this.rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  build(): void {
    this.addGroundAndRoads();
    this.addBuildings();
    this.addPalms();
    this.addStreetDetails();
    this.addPickups();
    this.group.updateMatrixWorld(true);
  }

  get pickupCount(): number {
    return this.pickupPositions.length;
  }

  collectPickups(position: THREE.Vector3, radius = 3.2): number {
    if (!this.pickupOrbs || !this.pickupRings) return 0;
    const radiusSquared = radius * radius;
    let collected = 0;

    for (let index = 0; index < this.pickupPositions.length; index += 1) {
      if (this.collectedPickups[index]) continue;
      const pickup = this.pickupPositions[index];
      const dx = position.x - pickup.x;
      const dz = position.z - pickup.z;
      if (dx * dx + dz * dz > radiusSquared) continue;
      this.collectedPickups[index] = true;
      this.pickupOrbs.setMatrixAt(index, this.hiddenPickupMatrix);
      this.pickupRings.setMatrixAt(index, this.hiddenPickupMatrix);
      collected += 1;
    }

    if (collected > 0) {
      this.pickupOrbs.instanceMatrix.needsUpdate = true;
      this.pickupRings.instanceMatrix.needsUpdate = true;
    }
    return collected;
  }

  private addGroundAndRoads(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + BLOCK_SIZE, CITY_HALF * 2 + BLOCK_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x292537, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.physics.createCollider(this.rapier.ColliderDesc.cuboid(CITY_HALF + BLOCK_SIZE / 2, 0.1, CITY_HALF + BLOCK_SIZE / 2).setTranslation(0, -0.2, 0));

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x11131f, roughness: 0.82 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x777080, roughness: 0.88 });
    const roadLength = CITY_HALF * 2 + BLOCK_SIZE;
    const road = new THREE.BoxGeometry(ROAD_WIDTH, 0.12, roadLength);
    const sidewalk = new THREE.BoxGeometry(4.2, 0.28, roadLength);
    const dash = new THREE.BoxGeometry(0.24, 0.035, 3.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5dca0 });
    const dashCapacity = 2 * (BLOCKS + 1) * Math.ceil(roadLength / 8);
    const dashMarks = new THREE.InstancedMesh(dash, dashMat, dashCapacity);
    const dashTransform = new THREE.Object3D();
    let dashIndex = 0;

    for (let roadIndex = 0; roadIndex <= BLOCKS; roadIndex += 1) {
      const line = -BLOCKS * BLOCK_SIZE / 2 + roadIndex * BLOCK_SIZE;
      const vertical = new THREE.Mesh(road, roadMat);
      vertical.position.set(line, -0.045, 0);
      this.group.add(vertical);
      const horizontal = new THREE.Mesh(road, roadMat);
      horizontal.rotation.y = Math.PI / 2;
      horizontal.position.set(0, -0.045, line);
      this.group.add(horizontal);

      for (const side of [-1, 1]) {
        const vergeA = new THREE.Mesh(sidewalk, sidewalkMat);
        vergeA.position.set(line + side * (ROAD_WIDTH / 2 + 2.1), 0.02, 0);
        this.group.add(vergeA);
        const vergeB = new THREE.Mesh(sidewalk, sidewalkMat);
        vergeB.rotation.y = Math.PI / 2;
        vergeB.position.set(0, 0.02, line + side * (ROAD_WIDTH / 2 + 2.1));
        this.group.add(vergeB);
      }
      for (let dashZ = -CITY_HALF; dashZ < CITY_HALF; dashZ += 8) {
        dashTransform.position.set(line, 0.035, dashZ + 2.4);
        dashTransform.rotation.set(0, 0, 0);
        dashTransform.updateMatrix();
        dashMarks.setMatrixAt(dashIndex++, dashTransform.matrix);
        dashTransform.position.set(dashZ + 2.4, 0.035, line);
        dashTransform.rotation.set(0, Math.PI / 2, 0);
        dashTransform.updateMatrix();
        dashMarks.setMatrixAt(dashIndex++, dashTransform.matrix);
      }
    }
    dashMarks.count = dashIndex;
    dashMarks.instanceMatrix.needsUpdate = true;
    this.group.add(dashMarks);

    for (let z = -CITY_HALF; z <= CITY_HALF; z += 18) {
      for (let x = -CITY_HALF; x <= CITY_HALF; x += 18) this.roadPositions.push(new THREE.Vector3(x, 0, z));
    }

    // Rapier's broad floor collider sits just beneath the visible ground plane.
  }

  private addBuildings(): void {
    const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
    const bodyMaterials = [0x25273b, 0x303149, 0x382b45, 0x292e40].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.18 }),
    );
    const windowGeometry = new THREE.PlaneGeometry(1.0, 0.72);
    const neonGeometry = new THREE.BoxGeometry(1, 0.16, 0.14);
    const windowMaterials = [0xffb449, 0x28d9e8, 0xff5aa4].map(
      (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    );
    const neonMaterials = neonColors.map((color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const bodyBuckets = bodyMaterials.map(() => [] as THREE.Matrix4[]);
    const windowBuckets = windowMaterials.map(() => [] as THREE.Matrix4[]);
    const neonBuckets = neonMaterials.map(() => [] as THREE.Matrix4[]);
    const temp = new THREE.Object3D();

    for (let ix = 0; ix < BLOCKS; ix += 1) {
      for (let iz = 0; iz < BLOCKS; iz += 1) {
        const centerX = -BLOCKS * BLOCK_SIZE / 2 + ix * BLOCK_SIZE + BLOCK_SIZE / 2;
        const centerZ = -BLOCKS * BLOCK_SIZE / 2 + iz * BLOCK_SIZE + BLOCK_SIZE / 2;
        const count = 1 + Math.floor(this.rng() * 2);
        for (let b = 0; b < count; b += 1) {
          const width = 9 + this.rng() * 5;
          const depth = 9 + this.rng() * 5;
          const height = 12 + this.rng() * 36;
          const x = centerX + (this.rng() - 0.5) * 12;
          const z = centerZ + (this.rng() - 0.5) * 12;
          const rotationY = Math.round(this.rng() * 3) * Math.PI / 2;
          const materialIndex = Math.floor(this.rng() * bodyMaterials.length);
          temp.position.set(x, height / 2, z);
          temp.rotation.set(0, rotationY, 0);
          temp.scale.set(width, height, depth);
          temp.updateMatrix();
          bodyBuckets[materialIndex].push(temp.matrix.clone());
          this.physics.createCollider(
            this.rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
              .setTranslation(x, height / 2, z)
              .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) }),
          );

          const neonIndex = Math.floor(this.rng() * neonMaterials.length);
          const facades = [
            { localX: 0, localZ: depth / 2 + 0.08, angle: 0, span: width },
            { localX: 0, localZ: -depth / 2 - 0.08, angle: Math.PI, span: width },
            { localX: width / 2 + 0.08, localZ: 0, angle: Math.PI / 2, span: depth },
            { localX: -width / 2 - 0.08, localZ: 0, angle: -Math.PI / 2, span: depth },
          ];
          const toWorldX = (localX: number, localZ: number) => x + Math.cos(rotationY) * localX + Math.sin(rotationY) * localZ;
          const toWorldZ = (localX: number, localZ: number) => z - Math.sin(rotationY) * localX + Math.cos(rotationY) * localZ;

          // Wrap the neon bands around every face so the skyline reads from any approach.
          for (const y of [3.5, height * 0.62, height - 1]) {
            for (const facade of facades) {
              const sideFace = Math.abs(facade.angle) > 0.1;
              const localX = sideFace ? facade.localX : 0;
              const localZ = sideFace ? 0 : facade.localZ;
              temp.position.set(toWorldX(localX, localZ), y, toWorldZ(localX, localZ));
              temp.rotation.set(0, rotationY + facade.angle, 0);
              temp.scale.set(facade.span * 0.92, 1, 1);
              temp.updateMatrix();
              neonBuckets[neonIndex].push(temp.matrix.clone());
            }
          }

          const floors = Math.max(2, Math.floor(height / 3.2));
          for (const facade of facades) {
            const columns = Math.max(2, Math.floor(facade.span / 2.2));
            for (let floor = 1; floor < floors; floor += 1) {
              for (let col = 0; col < columns; col += 1) {
                if (this.rng() < 0.22) continue;
                const windowMaterial = Math.floor(this.rng() * windowMaterials.length);
                const offset = -facade.span / 2 + ((col + 0.5) * facade.span) / columns;
                const localX = facade.localX === 0 ? offset : facade.localX;
                const localZ = facade.localZ === 0 ? offset : facade.localZ;
                const py = floor * (height / floors) + 0.7;
                temp.position.set(toWorldX(localX, localZ), py, toWorldZ(localX, localZ));
                temp.rotation.set(0, rotationY + facade.angle, 0);
                temp.scale.set(0.92, 0.72, 1);
                temp.updateMatrix();
                windowBuckets[windowMaterial].push(temp.matrix.clone());
              }
            }
          }
        }
      }
    }

    bodyBuckets.forEach((matrices, index) => this.addInstances(bodyGeometry, bodyMaterials[index], matrices));
    windowBuckets.forEach((matrices, index) => this.addInstances(windowGeometry, windowMaterials[index], matrices));
    neonBuckets.forEach((matrices, index) => this.addInstances(neonGeometry, neonMaterials[index], matrices));
  }

  private addPalms(): void {
    const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.42, 5.6, 6);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x514044, roughness: 0.95 });
    const leafGeometry = new THREE.ConeGeometry(0.45, 5.2, 5);
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x257763, roughness: 0.88, flatShading: true });
    const trunkMatrices: THREE.Matrix4[] = [];
    const leafMatrices: THREE.Matrix4[] = [];
    const temp = new THREE.Object3D();

    for (let roadIndex = 0; roadIndex <= BLOCKS; roadIndex += 1) {
      const line = -BLOCKS * BLOCK_SIZE / 2 + roadIndex * BLOCK_SIZE;
      for (let block = 0; block < BLOCKS; block += 2) {
        const along = -CITY_HALF + block * BLOCK_SIZE + BLOCK_SIZE / 2;
        for (const side of [-1, 1]) {
          const x = roadIndex % 2 === 0 ? line + side * 11.2 : along;
          const z = roadIndex % 2 === 0 ? along : line + side * 11.2;
          temp.position.set(x, 2.8, z);
          temp.rotation.set(0, 0, 0);
          temp.scale.set(1, 1, 1);
          temp.updateMatrix();
          trunkMatrices.push(temp.matrix.clone());
          for (let leaf = 0; leaf < 5; leaf += 1) {
            temp.position.set(x + Math.sin((leaf / 5) * Math.PI * 2) * 1.2, 5.2, z + Math.cos((leaf / 5) * Math.PI * 2) * 1.2);
            temp.rotation.set(Math.cos((leaf / 5) * Math.PI * 2) * 0.95, (leaf / 5) * Math.PI * 2, Math.sin((leaf / 5) * Math.PI * 2) * 0.95);
            temp.scale.set(1, 1, 1);
            temp.updateMatrix();
            leafMatrices.push(temp.matrix.clone());
          }
        }
      }
    }
    this.addInstances(trunkGeometry, trunkMaterial, trunkMatrices);
    this.addInstances(leafGeometry, leafMaterial, leafMatrices);
  }

  private addStreetDetails(): void {
    const lightGroup = new THREE.Group();
    const poleGeometry = new THREE.CylinderGeometry(0.09, 0.13, 6.2, 6);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x353246, metalness: 0.6, roughness: 0.42 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd6a2, toneMapped: false });
    const poleMatrices: THREE.Matrix4[] = [];
    const glowMatrices: THREE.Matrix4[] = [];
    const temp = new THREE.Object3D();
    for (let i = 0; i <= BLOCKS; i += 1) {
      const line = -BLOCKS * BLOCK_SIZE / 2 + i * BLOCK_SIZE;
      for (let along = -CITY_HALF + 12; along <= CITY_HALF; along += 56) {
        for (const side of [-1, 1]) {
          const x = i % 2 === 0 ? line + side * 10.2 : along;
          const z = i % 2 === 0 ? along : line + side * 10.2;
          temp.position.set(x, 3.1, z);
          temp.updateMatrix();
          poleMatrices.push(temp.matrix.clone());
          temp.position.set(x, 6.25, z);
          temp.updateMatrix();
          glowMatrices.push(temp.matrix.clone());
        }
      }
    }
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, poleMatrices.length);
    poleMatrices.forEach((matrix, i) => poles.setMatrixAt(i, matrix));
    lightGroup.add(poles);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), glowMaterial, glowMatrices.length);
    glowMatrices.forEach((matrix, i) => lamps.setMatrixAt(i, matrix));
    lightGroup.add(lamps);
    this.group.add(lightGroup);
  }

  private addPickups(): void {
    const orbGeometry = new THREE.SphereGeometry(0.46, 14, 10);
    const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xffd56b, toneMapped: false });
    const ringGeometry = new THREE.TorusGeometry(0.72, 0.075, 8, 20);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });
    const temp = new THREE.Object3D();

    for (let roadIndex = 0; roadIndex <= BLOCKS; roadIndex += 1) {
      const line = -BLOCKS * BLOCK_SIZE / 2 + roadIndex * BLOCK_SIZE;
      for (let block = 0; block < BLOCKS; block += 1) {
        if ((roadIndex + block) % 2 !== 0) continue;
        const along = -BLOCKS * BLOCK_SIZE / 2 + block * BLOCK_SIZE + BLOCK_SIZE / 2;
        const onVerticalRoad = block % 2 === 0;
        this.pickupPositions.push(
          onVerticalRoad ? new THREE.Vector3(line, 0.88, along) : new THREE.Vector3(along, 0.88, line),
        );
      }
    }

    this.collectedPickups.push(...this.pickupPositions.map(() => false));
    this.pickupOrbs = new THREE.InstancedMesh(orbGeometry, orbMaterial, this.pickupCount);
    this.pickupRings = new THREE.InstancedMesh(ringGeometry, ringMaterial, this.pickupCount);
    this.pickupPositions.forEach((position, index) => {
      temp.position.copy(position);
      temp.rotation.set(0, 0, 0);
      temp.scale.setScalar(1);
      temp.updateMatrix();
      this.pickupOrbs!.setMatrixAt(index, temp.matrix);

      temp.position.y = 0.42;
      temp.rotation.set(Math.PI / 2, 0, 0);
      temp.updateMatrix();
      this.pickupRings!.setMatrixAt(index, temp.matrix);
    });
    this.pickupOrbs.instanceMatrix.needsUpdate = true;
    this.pickupRings.instanceMatrix.needsUpdate = true;
    this.pickupOrbs.computeBoundingSphere();
    this.pickupRings.computeBoundingSphere();
    this.group.add(this.pickupOrbs, this.pickupRings);
  }

  private addInstances(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]): void {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }
}
