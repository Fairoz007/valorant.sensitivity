import * as THREE from 'three';
import { RawInputEngine } from '../engine/RawInputEngine';
import { TargetEntity } from './TargetEntity';
import { DummyWeapon } from './DummyWeapon';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';
import { angularDistance } from '../engine/MathEngine';

export interface ShotEventData {
  isHit: boolean;
  target?: TargetEntity;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  targetYawDeg?: number;
  targetPitchDeg?: number;
  horizontalErrorDeg?: number;
  verticalErrorDeg?: number;
  angularErrorDeg: number;
  shotTimestamp: number;
  rayOrigin?: { x: number; y: number; z: number };
  rayDirection?: { x: number; y: number; z: number };
  hitPoint?: { x: number; y: number; z: number };
  hitObjectId?: string;
  intersectionCount?: number;
}

/**
 * AGENT 2: FPS / THREE.JS ENGINEER
 * ArenaManager maintains the 3D first-person environment, perspective camera,
 * exact center raycasting, DummyWeapon visual integration, and target entities.
 */
export class ArenaManager {
  private container: HTMLElement | null;
  private engine: RawInputEngine;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private rendererReady = false;
  private raycaster: THREE.Raycaster;
  
  private targets: TargetEntity[] = [];
  private dummyWeapon: DummyWeapon;
  
  // Camera Euler angles in radians (YXZ order)
  private cameraYaw: number = 0;   // Rotation around Y axis
  private cameraPitch: number = 0; // Rotation around X axis
  private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private inputHistory: { timestamp: number; yawDelta: number; pitchDelta: number }[] = [];
  private inputHistoryBase = { yaw: 0, pitch: 0 };
  private latestInputTimestamp = -Infinity;
  
  private sensitivity: number = 1.0;
  
  private animationFrameId: number | null = null;
  private lastTime: number = 0;

  private onHitCallback?: (target: TargetEntity) => void;
  private onShotCallback?: (event: ShotEventData) => void;

  // Real-time authoritative input subscription (Task 2 & 3 & 4)
  private unsubscribeClick?: () => void;
  private unsubscribeDelta?: () => void;
  private paused = false;
  private resizeObserver?: ResizeObserver;
  private trajectory: THREE.Vector3[] = [];
  private debugTrajectoryMesh: THREE.Line | null = null;
  private alignmentCheck = false;
  private onDiagnosticModeCallback?: (enabled: boolean) => void;
  private onFrameStallCallback?: (durationMs: number) => void;
  private frameStallCount = 0;
  private lastShotDebug: ShotEventData | null = null;
  private debugMode: boolean = false;
  private debugRayMesh: THREE.Line | null = null;
  private debugTargetMarkers: THREE.Object3D[] = [];
  private audioCtx: AudioContext | null = null;

  constructor(container: HTMLElement | null, engine: RawInputEngine) {
    this.container = container;
    this.engine = engine;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1218); 
    this.scene.fog = new THREE.Fog(0x0c1218, 15, 60);

    const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
    const aspect = hasDom && container && container.clientWidth
      ? Math.max(0.1, container.clientWidth / Math.max(1, container.clientHeight))
      : 16 / 9;
    
    // Standard horizontal VALORANT FOV: 103°
    const hFovRad = (103 * Math.PI) / 180;
    const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect);
    const vFovDeg = (vFovRad * 180) / Math.PI;

    this.camera = new THREE.PerspectiveCamera(vFovDeg, aspect, 0.05, 100);
    this.camera.position.set(0, 0, 0);

    // Attach DummyWeapon directly to camera as visual-only ornament (Task 6 & Task 55)
    this.dummyWeapon = new DummyWeapon();
    this.camera.add(this.dummyWeapon.mesh);
    this.scene.add(this.camera);

    if (hasDom && container) {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        container.appendChild(this.renderer.domElement);
        this.rendererReady = true;
      } catch {
        // Fallback for headless / software test environments
        this.renderer = {
          render: () => {},
          setSize: () => {},
          setPixelRatio: () => {},
          dispose: () => {},
          domElement: {} as any,
        } as any;
      }
    } else {
      this.renderer = {
        render: () => {},
        setSize: () => {},
        setPixelRatio: () => {},
        dispose: () => {},
        domElement: {} as any,
      } as any;
    }

    this.raycaster = new THREE.Raycaster();
    
    this.setupEnvironment();
    
    // Provide live orientation to RawInputEngine for high-frequency MouseSample recording
    this.engine.setOrientationProvider(
      timestamp => this.getCameraOrientationAt(timestamp),
      () => this.getSensitivity()
    );

    this.onWindowResize = this.onWindowResize.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
    }
    if (container && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onWindowResize);
      this.resizeObserver.observe(container);
    }
    this.unsubscribeDelta = this.engine.subscribeDelta((_dx, _dy, timestamp) => {
      if (!this.paused) this.processInput(timestamp);
      else this.engine.clearPendingInput();
    });

    // Direct left-click shooting subscription: captures shot at physical mousedown (Task 2, 3, 4)
    this.unsubscribeClick = this.engine.subscribeClick((button, timestamp) => {
      if (button === 0 && !this.paused) {
        this.processShot(timestamp);
      }
    });
  }

  public setSensitivity(sens: number) {
    if (!Number.isFinite(sens) || sens <= 0) throw new Error('Sensitivity must be finite and positive.');
    this.processInput();
    this.sensitivity = sens;
  }

  public isRendererAvailable(): boolean {
    return this.rendererReady;
  }

  public setOnFrameStallCallback(callback: (durationMs: number) => void): void {
    this.onFrameStallCallback = callback;
  }

  public getFrameStallCount(): number { return this.frameStallCount; }

  public setOnDiagnosticModeCallback(callback: (enabled: boolean) => void): void {
    this.onDiagnosticModeCallback = callback;
  }

  public isAlignmentCheck(): boolean { return this.alignmentCheck; }

  public setAlignmentCheck(enabled: boolean): void {
    if (enabled === this.alignmentCheck) return;
    this.alignmentCheck = enabled;
    this.clearTargets();
    if (enabled) {
      this.onDiagnosticModeCallback?.(true);
      this.setPaused(false);
      this.setDebugMode(true);
      this.resetCamera();
      this.spawnTarget(0, 0, 5, 0, 0, 'diagnostic-alignment');
    } else {
      this.onDiagnosticModeCallback?.(false);
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.engine.clearPendingInput();
    this.lastTime = performance.now();
  }

  public getViewportCenter(): { x: number; y: number } {
    const rect = this.container?.getBoundingClientRect();
    return { x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.top + rect.height / 2 : 0 };
  }

  /** Keep the full disk visible at spawn, including narrow portrait viewports. */
  public getVisibilitySafeOffset(yaw: number, pitch: number, radius: number): { yaw: number; pitch: number } {
    const origin = this.getCameraOrientation();
    const inverseCamera = this.camera.quaternion.clone().invert();
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
    const horizontalSin = Math.sin(horizontalHalfFov);
    const horizontalCos = Math.cos(horizontalHalfFov);
    const verticalSin = Math.sin(verticalHalfFov);
    const verticalCos = Math.cos(verticalHalfFov);
    const edgeMargin = Math.sin(THREE.MathUtils.degToRad(radius + 1));
    const candidate = (scale: number) => {
      const localYaw = THREE.MathUtils.degToRad(yaw * scale);
      const localPitch = THREE.MathUtils.degToRad(pitch * scale);
      const direction = new THREE.Vector3(Math.cos(localPitch) * Math.sin(localYaw), Math.sin(localPitch), -Math.cos(localPitch) * Math.cos(localYaw))
        .applyQuaternion(this.camera.quaternion);
      const worldYaw = THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z));
      const pitchLimit = Math.min(85, 89.5 - radius);
      const worldPitch = Math.max(-pitchLimit, Math.min(pitchLimit, THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, direction.y))))));
      const yawRad = THREE.MathUtils.degToRad(worldYaw);
      const pitchRad = THREE.MathUtils.degToRad(worldPitch);
      direction.set(Math.cos(pitchRad) * Math.sin(yawRad), Math.sin(pitchRad), -Math.cos(pitchRad) * Math.cos(yawRad));
      const projected = direction.clone().applyQuaternion(inverseCamera);
      // Signed distance from each frustum plane must contain the entire angular
      // disk, including a one-degree margin. Center-only checks miss clipped edges.
      const visible = -projected.z * horizontalSin - Math.abs(projected.x) * horizontalCos >= edgeMargin
        && -projected.z * verticalSin - Math.abs(projected.y) * verticalCos >= edgeMargin;
      const yawOffset = ((worldYaw - origin.yawDeg + 180) % 360 + 360) % 360 - 180;
      return { yaw: yawOffset, pitch: worldPitch - origin.pitchDeg, visible };
    };
    let best = candidate(1);
    if (!best.visible) {
      let low = 0;
      let high = 1;
      best = candidate(0);
      for (let iteration = 0; iteration < 24; iteration++) {
        const middle = (low + high) / 2;
        const next = candidate(middle);
        if (next.visible) { low = middle; best = next; }
        else high = middle;
      }
    }
    return { yaw: best.yaw, pitch: best.pitch };
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public getDummyWeapon(): DummyWeapon {
    return this.dummyWeapon;
  }

  /**
   * Get current camera orientation in visual degrees.
   * Right is positive yawDeg, Up is positive pitchDeg.
   */
  public getCameraOrientation(): { yawDeg: number; pitchDeg: number } {
    return {
      yawDeg: -(this.cameraYaw * 180) / Math.PI,
      pitchDeg: (this.cameraPitch * 180) / Math.PI,
    };
  }

  private getCameraOrientationAt(timestamp = Infinity): { yawDeg: number; pitchDeg: number } {
    if (this.latestInputTimestamp <= timestamp) return this.getCameraOrientation();
    let yaw = this.inputHistoryBase.yaw;
    let pitch = this.inputHistoryBase.pitch;
    const maxPitch = THREE.MathUtils.degToRad(89.5);
    for (const input of this.inputHistory.filter(input => input.timestamp <= timestamp).sort((a, b) => a.timestamp - b.timestamp)) {
      yaw += input.yawDelta;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch + input.pitchDelta));
    }
    return { yawDeg: -THREE.MathUtils.radToDeg(yaw), pitchDeg: THREE.MathUtils.radToDeg(pitch) };
  }

  public setCameraOrientation(yawDeg: number, pitchDeg: number) {
    this.cameraYaw = -(yawDeg * Math.PI) / 180;
    this.cameraPitch = (pitchDeg * Math.PI) / 180;
    const maxPitch = (89.5 * Math.PI) / 180;
    this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));
    this.inputHistory = [];
    this.latestInputTimestamp = -Infinity;
    this.inputHistoryBase = { yaw: this.cameraYaw, pitch: this.cameraPitch };
    this.camera.quaternion.setFromEuler(this.cameraEuler.set(this.cameraPitch, this.cameraYaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld(true);
  }

  public resetCamera() {
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.inputHistory = [];
    this.latestInputTimestamp = -Infinity;
    this.inputHistoryBase = { yaw: 0, pitch: 0 };
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
    this.camera.updateMatrixWorld(true);
  }

  public setOnHitCallback(callback: (target: TargetEntity) => void) {
    this.onHitCallback = callback;
  }

  public setOnShotCallback(callback: (event: ShotEventData) => void) {
    this.onShotCallback = callback;
  }

  private setupEnvironment() {
    // Tactical floor grid
    const gridHelper = new THREE.GridHelper(80, 80, 0x00f5d4, 0x1b2733);
    gridHelper.position.y = -2.5;
    this.scene.add(gridHelper);

    // Ceiling and wall boundary markers
    const ceilingGrid = new THREE.GridHelper(80, 80, 0x2b3846, 0x141e28);
    ceilingGrid.position.y = 12;
    this.scene.add(ceilingGrid);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(0, 10, -5);
    this.scene.add(dirLight);
  }

  public spawnTarget(
    yawDeg: number,
    pitchDeg: number,
    radiusDeg: number = 1.25,
    velocityYawDeg: number = 0,
    velocityPitchDeg: number = 0,
    id?: string
  ): TargetEntity {
    const target = new TargetEntity(
      (yawDeg * Math.PI) / 180,
      (pitchDeg * Math.PI) / 180,
      radiusDeg,
      15,
      id
    );
    
    target.velocityYaw = (velocityYawDeg * Math.PI) / 180;
    target.velocityPitch = (velocityPitchDeg * Math.PI) / 180;

    this.scene.add(target.mesh);
    this.targets.push(target);
    this.trajectory = [];
    this.refreshDebugTargets();
    return target;
  }

  public getActiveTargets(): TargetEntity[] {
    return this.targets;
  }

  public clearTargets() {
    for (const target of this.targets) {
      this.scene.remove(target.mesh);
      target.dispose();
    }
    this.targets = [];
    this.refreshDebugTargets();
  }

  /**
   * Rotate camera based on raw mouse counts (Task 5)
   * yawDegrees = dx * candidateSensitivity * VALORANT_YAW
   * pitchDegrees = -dy * candidateSensitivity * VALORANT_YAW
   * DPI is NOT multiplied into rotation (it is physically inside dx/dy).
   */
  public processInput(throughTimestamp = Infinity) {
    const deltas = this.engine.getDeltas(throughTimestamp);
    if (deltas.length === 0) return;

    const maxPitch = (89.5 * Math.PI) / 180;
    for (const d of deltas) {
      const yawDelta = -(d.dx * this.sensitivity * VALORANT_YAW_DEG_PER_COUNT * Math.PI) / 180;
      const pitchDelta = -(d.dy * this.sensitivity * VALORANT_YAW_DEG_PER_COUNT * Math.PI) / 180;
      this.cameraYaw += yawDelta;
      this.cameraPitch += pitchDelta;
      this.inputHistory.push({ timestamp: d.timestamp, yawDelta, pitchDelta });
      this.latestInputTimestamp = Math.max(this.latestInputTimestamp, d.timestamp);
      if (this.inputHistory.length > 8192) {
        const oldest = this.inputHistory.shift()!;
        this.inputHistoryBase.yaw += oldest.yawDelta;
        this.inputHistoryBase.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.inputHistoryBase.pitch + oldest.pitchDelta));
      }
      // Clamp each event, so reversal after touching the pitch limit is preserved.
      this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));
    }

    this.camera.quaternion.setFromEuler(this.cameraEuler.set(this.cameraPitch, this.cameraYaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld(true);
    if (this.debugMode) {
      this.trajectory.push(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(15));
      if (this.trajectory.length > 2048) this.trajectory.shift();
    }
  }

  /**
   * TASK 2, 3, 4, 6, 7, 8, 9, 10, 14, 16, 20:
   * ONE AUTHORITATIVE SHOT PROCESSING PIPELINE.
   * Triggered synchronously on physical mousedown.
   */
  public processShot(timestamp = performance.now()): ShotEventData {
    const shotTime = timestamp;

    // 0. FLUSH PENDING MOUSE DELTAS (Task 15: exact shot-time camera state)
    // A player often clicks WHILE the mouse is still moving.
    // Pending deltas in the buffer must be applied to the camera BEFORE
    // we snapshot the camera state, otherwise the raycast will be stale.
    this.processInput(shotTime);

    // 1. SNAPSHOT CAMERA STATE AT EXACT SHOT TIME (Task 4)
    const cam = this.getCameraOrientationAt(shotTime);
    const liveQuaternion = this.camera.quaternion.clone();
    // Dispatch order is normally chronological, but a queued mousemove can carry
    // a later hardware timestamp than mousedown. Rebuild that shot snapshot
    // without future input, while preserving the live camera for the next frame.
    if (this.latestInputTimestamp > shotTime) {
      this.camera.quaternion.setFromEuler(this.cameraEuler.set(THREE.MathUtils.degToRad(cam.pitchDeg), -THREE.MathUtils.degToRad(cam.yawDeg), 0, 'YXZ'));
    }
    
    // Ensure camera world transforms are completely current before raycasting (Task 8)
    this.camera.updateMatrixWorld(true);

    // 2. CENTER-SCREEN RAYCAST (Task 6)
    // STRICT: Origin is exact camera center (NDC: 0, 0)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const rayOrigin = this.raycaster.ray.origin.clone();
    const rayDirection = this.raycaster.ray.direction.clone();
    this.camera.quaternion.copy(liveQuaternion);
    this.camera.updateMatrixWorld(true);

    // 3. TARGET INTERSECTION (Task 7, 8, 9, 10)
    // Only test against targets (dummy gun and environment are NEVER tested)
    const targetMeshes = this.targets.filter(t => !t.isHitState).map((t) => t.mesh);
    const intersects = this.raycaster.intersectObjects(targetMeshes, true);

    let hitTarget: TargetEntity | null = null;
    let hitPoint: THREE.Vector3 = rayOrigin.clone().addScaledVector(rayDirection, 30);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let obj: THREE.Object3D | null = intersect.object;
        while (obj && !obj.userData?.targetEntity && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData?.targetEntity) {
          hitTarget = obj.userData.targetEntity as TargetEntity;
          hitPoint = intersect.point.clone();
          break;
        }
      }
    }

    // 4. ANGULAR ERROR MEASUREMENT (Task 20)
    const nearestTarget = this.targets[0];
    const targetRef = hitTarget || nearestTarget;
    let targetYawDeg = targetRef ? (targetRef.yaw * 180) / Math.PI : undefined;
    let targetPitchDeg = targetRef ? (targetRef.pitch * 180) / Math.PI : undefined;

    let hError = 0;
    let vError = 0;
    let angError = 0;

    if (targetYawDeg !== undefined && targetPitchDeg !== undefined) {
      hError = ((cam.yawDeg - targetYawDeg + 180) % 360 + 360) % 360 - 180;
      vError = cam.pitchDeg - targetPitchDeg;
      angError = angularDistance(cam.yawDeg, cam.pitchDeg, targetYawDeg, targetPitchDeg);
    }

    const isHit = !!hitTarget;

    // 5. EVENT PAYLOAD
    const eventData: ShotEventData = {
      isHit,
      target: targetRef,
      cameraYawDeg: cam.yawDeg,
      cameraPitchDeg: cam.pitchDeg,
      targetYawDeg,
      targetPitchDeg,
      horizontalErrorDeg: hError,
      verticalErrorDeg: vError,
      angularErrorDeg: angError,
      shotTimestamp: shotTime,
      rayOrigin: { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
      rayDirection: { x: rayDirection.x, y: rayDirection.y, z: rayDirection.z },
      hitPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
      hitObjectId: hitTarget?.id,
      intersectionCount: intersects.length,
    };

    this.lastShotDebug = eventData;

    if (hitTarget) {
      // Deactivate before any callbacks or cosmetic material/disposal work.
      hitTarget.isHitState = true;
      hitTarget.mesh.visible = false;
      const targetIndex = this.targets.indexOf(hitTarget);
      this.scene.remove(hitTarget.mesh);
      if (targetIndex !== -1) {
        this.targets.splice(targetIndex, 1);
      }
    }

    // Synchronous trial finalization precedes all cosmetic work.
    if (!this.alignmentCheck && targetRef) {
      if (this.onShotCallback) this.onShotCallback(eventData);
      if (hitTarget && this.onHitCallback) this.onHitCallback(hitTarget);
    } else if (hitTarget) {
      this.spawnTarget(0, 0, 5, 0, 0, 'diagnostic-alignment');
    }


    // 7. VISUAL-ONLY FEEDBACK (Task 11, 13, 14, 15, 16, 17)
    // Strictly decoupled from physics & calculations
    // A failed cosmetic effect must never interrupt completed trial processing
    // or prevent subsequent independent feedback effects from running.
    const effects = [
      () => hitTarget?.dispose(),
      () => this.dummyWeapon.triggerFireAnimation(),
      () => this.spawnTracer(hitPoint),
      () => this.playShotAudio(isHit),
      () => { if (this.debugMode) this.renderDebugVisuals(rayOrigin, hitPoint, isHit); },
    ];
    for (const effect of effects) {
      try { effect(); } catch (error) { console.warn('Shot visual feedback failed', error); }
    }

    return eventData;
  }

  /**
   * Backward-compatible alias for processShot
   */
  public executeShot(timestamp = performance.now()): ShotEventData {
    return this.processShot(timestamp);
  }

  public setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
    if (!enabled) {
      this.clearDebugVisuals();
    } else this.refreshDebugTargets();
  }

  public isDebugMode(): boolean {
    return this.debugMode;
  }

  public getLastShotDebug(): ShotEventData | null {
    return this.lastShotDebug;
  }

  private clearDebugVisuals() {
    if (this.debugTrajectoryMesh) {
      this.scene.remove(this.debugTrajectoryMesh);
      this.debugTrajectoryMesh.geometry.dispose();
      (this.debugTrajectoryMesh.material as THREE.Material).dispose();
      this.debugTrajectoryMesh = null;
    }
    if (this.debugRayMesh) {
      this.scene.remove(this.debugRayMesh);
      this.debugRayMesh.geometry.dispose();
      if (Array.isArray(this.debugRayMesh.material)) {
        this.debugRayMesh.material.forEach((m) => m.dispose());
      } else {
        (this.debugRayMesh.material as THREE.Material).dispose();
      }
      this.debugRayMesh = null;
    }
    for (const marker of this.debugTargetMarkers) {
      marker.parent?.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        if (Array.isArray(marker.material)) {
          marker.material.forEach((m) => m.dispose());
        } else {
          marker.material.dispose();
        }
      }
    }
    this.debugTargetMarkers = [];
  }

  private renderDebugVisuals(rayOrigin: THREE.Vector3, hitPoint: THREE.Vector3, _isHit: boolean) {
    this.clearDebugVisuals();

    // Actual firing ray line in 3D (Task 7)
    const points = [rayOrigin, hitPoint];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 2,
    });
    this.debugRayMesh = new THREE.Line(geometry, material);
    this.scene.add(this.debugRayMesh);

    this.refreshDebugTargets();
    if (this.trajectory.length > 1) {
      this.debugTrajectoryMesh = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(this.trajectory),
        new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false })
      );
      this.scene.add(this.debugTrajectoryMesh);
    }
  }

  private refreshDebugTargets() {
    for (const marker of this.debugTargetMarkers) {
      marker.parent?.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      }
    }
    this.debugTargetMarkers = [];
    if (!this.debugMode) return;
    for (const tgt of this.targets) {
      const markerGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(tgt.mesh.position);
      marker.position.set(0, 0, 0.005);
      tgt.mesh.add(marker);
      this.debugTargetMarkers.push(marker);
      const outline = new THREE.Mesh(
        new THREE.RingGeometry(tgt.distance * Math.tan(THREE.MathUtils.degToRad(tgt.radiusDeg)) * 0.99, tgt.distance * Math.tan(THREE.MathUtils.degToRad(tgt.radiusDeg)), 256),
        new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, depthTest: false })
      );
      outline.position.z = 0.005;
      outline.userData.isDiagnostic = true;
      marker.userData.isDiagnostic = true;
      // These annotations never participate in authoritative hit detection.
      outline.raycast = () => {};
      marker.raycast = () => {};
      tgt.mesh.add(outline);
      this.debugTargetMarkers.push(outline);
    }
  }

  private spawnTracer(hitPoint: THREE.Vector3) {
    if (typeof window === 'undefined') return;
    try {
      const muzzlePos = new THREE.Vector3();
      this.dummyWeapon.mesh.updateWorldMatrix(true, false);
      muzzlePos.set(0, 0.015, -0.35);
      this.dummyWeapon.mesh.localToWorld(muzzlePos);

      const points = [muzzlePos, hitPoint];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.75,
      });
      const line = new THREE.Line(geometry, material);
      line.userData = { isCosmeticTracer: true };
      this.scene.add(line);

      setTimeout(() => {
        this.scene.remove(line);
        geometry.dispose();
        material.dispose();
      }, 50);
    } catch {
      // Headless fallback
    }
  }

  private playShotAudio(isHit: boolean) {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (isHit) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.035);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.start(now);
        osc.stop(now + 0.035);
      }
    } catch {
      // Ignored
    }
  }

  public start() {
    if (this.animationFrameId !== null) return;
    this.lastTime = performance.now();
    this.animate();
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animate() {
    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const gameplayActive = !this.paused && (typeof document === 'undefined' || this.engine.isLocked());
    if (gameplayActive && this.engine.isLocked() && !this.alignmentCheck && dt > 0.25) {
      this.frameStallCount++;
      this.onFrameStallCallback?.(dt * 1000);
      dt = 0;
    }
    if (gameplayActive) this.processInput();
    
    // Update targets
    for (const target of this.targets) {
      if (gameplayActive) target.update(Math.min(dt, 0.1));
    }

    // Update dummy gun visual sway and recoil recovery (Task 6 & Task 55)
    this.dummyWeapon.update(dt);

    // Shots are processed synchronously at mousedown, so no frame-lagged checkHits() call needed!

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    if (!this.container) return;
    const aspect = Math.max(0.1, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    
    const hFovRad = (103 * Math.PI) / 180;
    const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect);
    
    this.camera.fov = (vFovRad * 180) / Math.PI;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  }

  public dispose() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.unsubscribeDelta?.();
    if (this.unsubscribeClick) {
      this.unsubscribeClick();
      this.unsubscribeClick = undefined;
    }
    this.clearDebugVisuals();
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
    }
    this.clearTargets();
    
    if (this.dummyWeapon) {
      this.dummyWeapon.dispose();
    }

    this.renderer.dispose();
    if (this.container && typeof this.container.contains === 'function' && this.renderer.domElement && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });
  }
}
