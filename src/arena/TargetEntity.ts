import * as THREE from 'three';

export class TargetEntity {
  public id: string;
  public mesh: THREE.Group;
  private outerRing: THREE.Mesh;
  private innerBullseye: THREE.Mesh;
  
  public yaw: number = 0;       // in radians
  public pitch: number = 0;     // in radians
  public radiusDeg: number = 1.25;
  public distance: number = 15; // meters
  
  public velocityYaw: number = 0;   // rad/s
  public velocityPitch: number = 0; // rad/s
  public isHitState: boolean = false;
  private readonly initialYaw: number;
  private readonly initialPitch: number;

  constructor(yawRad: number, pitchRad: number, radiusDeg: number = 1.25, distance: number = 15, id?: string) {
    this.id = id || `tgt_${Math.random().toString(36).substring(2, 8)}`;
    this.yaw = yawRad;
    this.pitch = pitchRad;
    this.initialYaw = yawRad;
    this.initialPitch = pitchRad;
    this.radiusDeg = radiusDeg;
    this.distance = distance;
    
    this.mesh = new THREE.Group();
    this.mesh.userData = { isTarget: true, targetEntity: this, id: this.id };
    
    // Exact physical radius derived from angular radius at this distance:
    // r = distance * tan(angularRadiusRad)
    const angularRadiusRad = (radiusDeg * Math.PI) / 180;
    const physicalRadius = this.distance * Math.tan(angularRadiusRad);
    const innerRadius = physicalRadius * 0.35;

    // Outer tactical ring (crimson/red)
    const outerGeo = new THREE.RingGeometry(innerRadius, physicalRadius, 256);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff4655,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.outerRing = new THREE.Mesh(outerGeo, outerMat);
    this.outerRing.userData = { isTargetMesh: true, targetEntity: this, part: 'outer' };
    
    // Inner bullseye (Radianite cyan)
    const innerGeo = new THREE.CircleGeometry(innerRadius, 256);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      side: THREE.DoubleSide,
    });
    this.innerBullseye = new THREE.Mesh(innerGeo, innerMat);
    this.innerBullseye.userData = { isTargetMesh: true, targetEntity: this, part: 'bullseye' };
    
    this.mesh.add(this.outerRing);
    this.mesh.add(this.innerBullseye);
    
    this.updatePosition();
  }
  
  public updatePosition() {
    // Mathematical spherical coordinates matching Three.js YXZ camera forward orientation:
    // When camera turns right (yaw > 0), forward points towards +X and -Z.
    // When camera pitches up (pitch > 0), forward points towards +Y and -Z.
    const cosPitch = Math.cos(this.pitch);
    this.mesh.position.x = this.distance * cosPitch * Math.sin(this.yaw);
    this.mesh.position.y = this.distance * Math.sin(this.pitch);
    this.mesh.position.z = -this.distance * cosPitch * Math.cos(this.yaw);
    
    // Target surface faces camera origin (0, 0, 0)
    this.mesh.lookAt(0, 0, 0); 
    this.mesh.updateMatrixWorld(true);
  }

  /**
   * Delta-time based motion (frame-rate independent)
   */
  public update(deltaTimeSec: number) {
    if (this.velocityYaw !== 0 || this.velocityPitch !== 0) {
      const reflect = (position: number, velocity: number, min: number, max: number) => {
        const width = max - min;
        const travelled = position + velocity * Math.max(0, deltaTimeSec) - min;
        const phase = ((travelled % (2 * width)) + 2 * width) % (2 * width);
        return phase <= width
          ? { position: min + phase, velocity }
          : { position: max - (phase - width), velocity: -velocity };
      };
      const yawState = reflect(this.yaw, this.velocityYaw, this.initialYaw - THREE.MathUtils.degToRad(12), this.initialYaw + THREE.MathUtils.degToRad(12));
      const pitchLimit = THREE.MathUtils.degToRad(89.5 - this.radiusDeg);
      const pitchState = reflect(this.pitch, this.velocityPitch,
        Math.max(-pitchLimit, this.initialPitch - THREE.MathUtils.degToRad(8)),
        Math.min(pitchLimit, this.initialPitch + THREE.MathUtils.degToRad(8)));
      this.yaw = yawState.position;
      this.pitch = pitchState.position;
      this.velocityYaw = yawState.velocity;
      this.velocityPitch = pitchState.velocity;
      this.updatePosition();
    }
  }

  public hit() {
    this.isHitState = true;
    (this.outerRing.material as THREE.MeshBasicMaterial).color.setHex(0x00f5d4);
    (this.innerBullseye.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
  }

  public dispose() {
    this.outerRing.geometry.dispose();
    (this.outerRing.material as THREE.Material).dispose();
    this.innerBullseye.geometry.dispose();
    (this.innerBullseye.material as THREE.Material).dispose();
  }
}
