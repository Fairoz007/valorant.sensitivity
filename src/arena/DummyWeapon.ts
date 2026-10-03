import * as THREE from 'three';

/**
 * AGENT 2: FPS / THREE.JS ENGINEER
 * Fictional first-person training weapon (DummyWeapon)
 * Visual-only weapon anchored to the first-person perspective.
 * 
 * STRICT INVARIANT (Task 6 & Task 55):
 * The weapon model is strictly a cosmetic viewport ornament.
 * It NEVER modifies camera orientation, crosshair location, raycast origin,
 * hit detection, telemetry data, or sensitivity calculations.
 */
export class DummyWeapon {
  public mesh: THREE.Group;
  private weaponBody: THREE.Group;
  private muzzleFlash: THREE.Mesh;
  private flashLight: THREE.PointLight;

  // Base rest position relative to camera (dedicated viewmodel in bottom-right)
  private readonly REST_POS = new THREE.Vector3(0.22, -0.18, -0.42);
  private readonly REST_ROT = new THREE.Euler(0.015, -0.035, 0.008, 'YXZ');

  // Animation state
  private recoilOffsetZ = 0;
  private recoilPitch = 0;
  private idleTime = 0;
  private flashTimer = 0;

  constructor() {
    this.mesh = new THREE.Group();
    this.weaponBody = new THREE.Group();
    this.mesh.add(this.weaponBody);

    this.buildWeaponMesh();

    // Muzzle Flash (Task 15: Crisp, compact flash that does not obscure center target)
    const flashGeo = new THREE.OctahedronGeometry(0.035, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0, 0.015, -0.35);
    this.muzzleFlash.visible = false;
    this.weaponBody.add(this.muzzleFlash);

    // Muzzle Flash Light
    this.flashLight = new THREE.PointLight(0x00f5d4, 0, 2.5);
    this.flashLight.position.set(0, 0.015, -0.35);
    this.weaponBody.add(this.flashLight);

    // Position at default rest stance
    this.mesh.position.copy(this.REST_POS);
    this.mesh.rotation.copy(this.REST_ROT);
  }

  private buildWeaponMesh() {
    // Futuristic tactical training sidearm
    // Dark matte alloy receiver
    const receiverGeo = new THREE.BoxGeometry(0.055, 0.08, 0.32);
    const receiverMat = new THREE.MeshStandardMaterial({
      color: 0x161e27,
      roughness: 0.35,
      metalness: 0.85,
    });
    const receiver = new THREE.Mesh(receiverGeo, receiverMat);
    this.weaponBody.add(receiver);

    // Fluted Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.28, 16);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x0a1017,
      roughness: 0.2,
      metalness: 0.95,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.2);
    this.weaponBody.add(barrel);

    // Radianite Cyan Tactical Energy Inlay (emissive glow)
    const inlayGeo = new THREE.BoxGeometry(0.012, 0.015, 0.24);
    const inlayMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
    });
    const inlayLeft = new THREE.Mesh(inlayGeo, inlayMat);
    inlayLeft.position.set(0.029, 0.015, -0.02);
    this.weaponBody.add(inlayLeft);

    const inlayRight = new THREE.Mesh(inlayGeo, inlayMat);
    inlayRight.position.set(-0.029, 0.015, -0.02);
    this.weaponBody.add(inlayRight);

    // Ergonomic angled Grip
    const gripGeo = new THREE.BoxGeometry(0.048, 0.14, 0.07);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x1c2631,
      roughness: 0.7,
      metalness: 0.3,
    });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.09, 0.08);
    grip.rotation.x = 0.28; // ergonomic angle
    this.weaponBody.add(grip);

    // Top Tactical Rail
    const railGeo = new THREE.BoxGeometry(0.03, 0.015, 0.26);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x22303e,
      roughness: 0.4,
      metalness: 0.7,
    });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, 0.045, -0.04);
    this.weaponBody.add(rail);
  }

  /**
   * Trigger procedural firing animation and muzzle flash (Task 13, 14, 15)
   * Recoil is visual ONLY: camera and crosshair remain untouched.
   */
  public triggerFireAnimation() {
    // Backward recoil kick and subtle muzzle rise (settles smoothly within ~100-120ms)
    this.recoilOffsetZ = 0.022;
    this.recoilPitch = 0.038;

    // Flash light & geometry burst (Task 15: ~25ms duration)
    this.flashTimer = 0.025;
    this.muzzleFlash.visible = true;
    (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0.95;
    this.flashLight.intensity = 1.5;

    // Subtle flash orientation variation
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;
  }

  /**
   * Update visual-only weapon sway and recoil recovery
   */
  public update(dtSec: number) {
    this.idleTime += dtSec;

    // 1. Subtle, non-distracting idle breathing sway (Task 12)
    // Substantially reduced amplitude (0.0003) so it never interferes with aim
    const swayX = Math.sin(this.idleTime * 1.2) * 0.0003;
    const swayY = Math.cos(this.idleTime * 2.4) * 0.0003;

    // 2. Crisp spring-damper recoil recovery (returns smoothly by ~100-120ms)
    const recoveryRate = Math.min(1.0, 26 * dtSec);
    this.recoilOffsetZ = THREE.MathUtils.lerp(this.recoilOffsetZ, 0, recoveryRate);
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, recoveryRate);

    // Apply combined transformation to weapon mesh relative to camera
    this.mesh.position.set(
      this.REST_POS.x + swayX,
      this.REST_POS.y + swayY,
      this.REST_POS.z + this.recoilOffsetZ
    );

    this.mesh.rotation.set(
      this.REST_ROT.x + this.recoilPitch,
      this.REST_ROT.y,
      this.REST_ROT.z,
      'YXZ'
    );

    // 3. Muzzle flash fade-out (Task 15: finishes cleanly after ~25ms)
    if (this.flashTimer > 0) {
      this.flashTimer -= dtSec;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
        (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
  }

  public dispose() {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}
