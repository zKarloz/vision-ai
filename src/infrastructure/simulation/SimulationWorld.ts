import * as THREE from 'three';
import type { Camera } from '../../core/domain/camera';
import { sweepPoseAt, virtualPoseFor, type VirtualCameraPose, type VirtualCameraSweep } from '../../core/domain/virtualCameraPose';
import { isPointInsidePolygon, restrictedZone, workerRestrictedPath, ZonePresenceRule } from '../../domain/rules';
import { createWorkerCharacter, type CharacterModel } from './CharacterFactory';
import { createPrecautionArea } from './PrecautionArea';
import { cautionWorkerPosition, PrecautionDemoRule, nearestCautionConeDistance, type CautionDemoEvent } from './PrecautionDemo';

export type CameraId = string;
export type SimulationEvent = { type: 'opened' | 'closed'; cameraId: 'CAM-02'; atSeconds: number; inZone: boolean };
export type SimulationSnapshot = {
  elapsedSeconds: number;
  selectedCamera: CameraId;
  workerInZone: boolean;
  zoneConfirmed: boolean;
  positionX: number;
  running: boolean;
  cautionDemoEnabled: boolean;
  cautionNoticeActive: boolean;
  cautionDistance: number | null;
};

/** El mundo 3D no depende de React ni del modelo de visión. */
export class SimulationWorld {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly captureRenderer: THREE.WebGLRenderer;
  private readonly cameras = new Map<CameraId, THREE.PerspectiveCamera>();
  private readonly basePoses = new Map<CameraId, VirtualCameraPose>();
  private readonly sweeps = new Map<CameraId, VirtualCameraSweep>();
  private readonly guard = new ZonePresenceRule(550, 900);
  private readonly workerOne: THREE.Group;
  private readonly workerTwo: THREE.Group;
  private readonly cautionWorker: THREE.Group;
  private readonly cautionRule = new PrecautionDemoRule();
  private cautionDemoEnabled = false;
  private cautionElapsed = 0;
  private readonly armParts: Array<{ a: THREE.Group; b: THREE.Group }> = [];
  private lastFrame = 0;
  private lastUiTime = 0;
  private frameHandle = 0;
  private elapsed = 0;
  private running = true;
  private cameraId: CameraId = 'CAM-01';
  private zoneActive = false;
  private readonly zoneFill: THREE.Mesh;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onUpdate: (state: SimulationSnapshot) => void,
    private readonly onEvent: (event: SimulationEvent) => void,
    // Canal separado: NO se conecta al motor de incidentes ni a YOLO.
    private readonly onCautionDemoEvent: (event: CautionDemoEvent) => void = () => {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    // Segundo renderizador: capturas por cámara para ONNX sin cambiar la vista seleccionada.
    this.captureRenderer = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true,
    });
    this.captureRenderer.setPixelRatio(1);
    this.captureRenderer.setSize(640, 480, false);
    this.captureRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.captureRenderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color('#e4e8ec');
    this.scene.fog = new THREE.Fog('#e4e8ec', 25, 52);
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.55));
    const keyLight = new THREE.DirectionalLight('#fff4df', 2.1);
    keyLight.position.set(1, 14, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    this.scene.add(keyLight);

    // Perspectivas semilla; se actualizan desde el registro versionado tras montar.
    this.setVirtualCameras(['CAM-01', 'CAM-02'].map(id => ({ id, sourceType: 'virtual-3d' as const })));

    this.addFloorAndStructure();
    this.addWarehouse();
    this.addMachinery();
    // Sector de precaución compartido por todas las cámaras virtuales.
    this.scene.add(createPrecautionArea());
    this.addSign('ÁREA DE PRECAUCIÓN', 0.45, -5.95, '#986216');
    this.zoneFill = this.addRestrictedZone();
    // Los dos operarios utilizan el mismo diseño anatómico C, sin selector A/B.
    const warehouse = createWorkerCharacter('#407b9b', '#ffc34e');
    this.workerOne = warehouse.group;
    this.scene.add(this.workerOne);
    this.registerLimbAnimation(warehouse);
    const machinery = createWorkerCharacter('#de794b', '#ffe071');
    this.workerTwo = machinery.group;
    this.scene.add(this.workerTwo);
    this.registerLimbAnimation(machinery);
    // Este trabajador sólo existe como geometría de DEMO; oculto por defecto.
    const demo = createWorkerCharacter('#668e80', '#f7bc48');
    this.cautionWorker = demo.group;
    this.cautionWorker.name = 'Operario de demostración de conos';
    this.cautionWorker.visible = false;
    this.scene.add(this.cautionWorker);
    this.registerLimbAnimation(demo);
    this.workerOne.position.set(-7.1, 0, 0.4);
    this.workerTwo.position.set(3.9, 0, -0.1);
    this.resize();
    this.publish();
  }

  private solidBox(
    width: number, height: number, depth: number, color: string,
    x: number, y: number, z: number, metalness = 0,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addFloorAndStructure(): void {
    this.solidBox(26, 0.28, 13.5, '#d1d7dd', 0, -0.18, 0);
    // Baldosas industriales y pasillos de circulación.
    for (let x = -12; x <= 12; x += 2) {
      const line = this.solidBox(0.025, 0.012, 13.3, '#bfc6cf', x, 0.009, 0);
      line.castShadow = false;
    }
    for (let z = -6; z <= 6; z += 2) {
      const line = this.solidBox(25.8, 0.012, 0.025, '#bfc6cf', 0, 0.009, z);
      line.castShadow = false;
    }
    this.solidBox(0.13, 0.02, 13, '#adb4bd', 0.4, 0.02, 0);
    for (const x of [-12.5, 0.4, 12.5]) {
      for (const z of [-6.3, 6.3]) {
        this.solidBox(0.24, 5.1, 0.24, '#7e8b99', x, 2.55, z, 0.12);
      }
    }
    // Luz en estructuras: no simula cámaras reales.
    for (const x of [-8, 8]) {
      this.solidBox(4.1, 0.12, 0.3, '#f2f5f7', x, 5.2, -4.8);
    }
  }

  private addWarehouse(): void {
    const rackXs = [-11.1, -8.65, -6.2];
    for (const x of rackXs) {
      for (const z of [-4.0, -2.2]) {
        this.solidBox(1.85, 0.09, 0.96, '#718193', x, 0.62, z, 0.25);
        this.solidBox(1.85, 0.09, 0.96, '#718193', x, 1.85, z, 0.25);
        for (const dx of [-0.86, 0.86]) {
          this.solidBox(0.095, 2.55, 0.095, '#697789', x + dx, 1.27, z - 0.42, 0.25);
          this.solidBox(0.095, 2.55, 0.095, '#697789', x + dx, 1.27, z + 0.42, 0.25);
        }
        this.solidBox(0.73, 0.78, 0.7, '#c69c70', x - 0.47, 1.06, z);
        this.solidBox(0.68, 0.6, 0.62, '#b6895d', x + 0.48, 1.01, z);
      }
    }
    // Mesa de selección y pallets.
    this.solidBox(3.4, 0.18, 1.5, '#788a9e', -7.4, 1.1, 3.2);
    for (const x of [-8.9, -5.9]) this.solidBox(0.22, 1.1, 0.22, '#77889a', x, 0.55, 3.2);
    this.solidBox(1.05, 0.57, 0.85, '#c89c70', -7.95, 1.48, 3.1);
    this.solidBox(0.8, 0.47, 0.85, '#b58a62', -6.6, 1.43, 3.2);
    const walkway = this.solidBox(6.5, 0.02, 0.08, '#f7bb42', -8.1, 0.025, 0.15);
    walkway.castShadow = false;
    this.addSign('ÁREA DE ALMACÉN', -8.2, -5.95, '#284056');
  }

  private addMachinery(): void {
    this.solidBox(2.15, 1.85, 1.85, '#738394', 10.85, 0.93, -2.5, 0.48);
    this.solidBox(1.2, 1.05, 1.18, '#4d6378', 10.85, 2.37, -2.5, 0.4);
    this.solidBox(0.58, 0.42, 0.58, '#dca03e', 10.85, 3.07, -2.5);
    this.solidBox(2.2, 0.24, 0.45, '#637487', 10.85, 1.48, -1.3);
    this.solidBox(0.9, 1.13, 1.1, '#8a9aa7', 11.35, 0.565, 1.6, 0.3);
    // Barreras de seguridad que delimitan visualmente la zona.
    for (const x of [6.0, 10.35]) {
      for (const z of [-2.65, 2.45]) {
        this.solidBox(0.09, 1.2, 0.09, '#d45252', x, 0.6, z);
      }
    }
    this.solidBox(4.35, 0.09, 0.12, '#c95656', 8.17, 1.05, -2.65);
    this.addSign('ÁREA DE MAQUINARIA', 7.9, -5.95, '#4d5969');
  }

  private addSign(text: string, x: number, z: number, bg: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 640, 96);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 320, 62);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.54),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
  }

  private addRestrictedZone(): THREE.Mesh {
    const width = 10.2 - 6.1;
    const depth = 2.3 - (-2.5);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ color: '#c83d45', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(8.15, 0.035, -0.1);
    this.scene.add(fill);
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(restrictedZone.polygon.map(p => new THREE.Vector3(p.x, 0.045, p.z))),
      new THREE.LineBasicMaterial({ color: '#c33845' }),
    );
    this.scene.add(border);
    for (let i = 0; i < 8; i++) {
      const stripe = this.solidBox(0.38, 0.012, 0.09, '#ee9c60', 6.0 + i * 0.61, 0.058, 2.50);
      stripe.castShadow = false;
    }
    return fill;
  }

  /** Reutiliza una sola animación independiente del aspecto del personaje. */
  private registerLimbAnimation(model: CharacterModel): void {
    this.armParts.push(
      { a: model.limbs.armLeft, b: model.limbs.armRight },
      { a: model.limbs.legLeft, b: model.limbs.legRight },
    );
  }

  private updatePersons(): void {
    const restrictedPath = workerRestrictedPath(this.elapsed);
    const oldX = this.workerTwo.position.x;
    this.workerTwo.position.set(restrictedPath.x, 0, restrictedPath.z);
    this.workerTwo.rotation.y = restrictedPath.x >= oldX ? Math.PI / 2 : -Math.PI / 2;
    this.workerOne.position.set(-7.0 + Math.sin(this.elapsed * 0.57) * 0.72, 0, 0.9 + Math.cos(this.elapsed * 0.57) * 0.42);
    this.workerOne.rotation.y = this.elapsed * 0.57;
    if (this.cautionDemoEnabled) {
      const previousX = this.cautionWorker.position.x;
      const position = cautionWorkerPosition(this.cautionElapsed);
      this.cautionWorker.position.set(position.x, 0, position.z);
      this.cautionWorker.rotation.y = position.x < previousX ? -Math.PI / 2 : Math.PI / 2;
      const event = this.cautionRule.update(this.cautionElapsed);
      if (event) this.onCautionDemoEvent(event);
    }
    this.armParts.forEach((limb, i) => {
      const phase = Math.sin(this.elapsed * (i < 2 ? 5 : 4.6)) * 0.34;
      limb.a.rotation.x = phase;
      limb.b.rotation.x = -phase;
    });
    this.zoneActive = isPointInsidePolygon(restrictedPath, restrictedZone.polygon);
    (this.zoneFill.material as THREE.MeshBasicMaterial).opacity = this.guard.isOccupied ? 0.38 : 0.21;
    const transition = this.guard.update(this.zoneActive, this.elapsed * 1000);
    if (transition) {
      this.onEvent({ type: transition === 'entered' ? 'opened' : 'closed', cameraId: 'CAM-02',
        atSeconds: this.elapsed, inZone: this.zoneActive });
    }
  }

  private loop = (now: number): void => {
    this.frameHandle = requestAnimationFrame(this.loop);
    const delta = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (this.running) {
      this.elapsed += delta;
      if (this.cautionDemoEnabled) this.cautionElapsed += delta;
      this.updatePersons();
    }
    // Barrido automático suave; renderizado y captura de YOLO usan la misma orientación.
    for (const id of this.sweeps.keys()) this.applyPerspective(id);
    const camera = this.cameras.get(this.cameraId);
    if (camera) this.renderer.render(this.scene, camera);
    if (now - this.lastUiTime > 200) {
      this.lastUiTime = now;
      this.publish();
    }
  };

  start(): void {
    if (this.frameHandle) return;
    this.lastFrame = 0;
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  setRunning(running: boolean): void { this.running = running; this.publish(); }

  /** Activación explícita: ningún evento DEMO se registra como incidente real. */
  setCautionDemoEnabled(enabled: boolean): void {
    if (this.cautionDemoEnabled === enabled) return;
    if (!enabled) {
      const finalEvent = this.cautionRule.stop(this.cautionElapsed);
      if (finalEvent) this.onCautionDemoEvent(finalEvent);
    } else {
      this.cautionElapsed = 0;
      this.cautionRule.reset();
    }
    this.cautionDemoEnabled = enabled;
    this.cautionWorker.visible = enabled;
    if (enabled) {
      const initial = cautionWorkerPosition(0);
      this.cautionWorker.position.set(initial.x, 0, initial.z);
    }
    this.publish();
  }
  get isRunning(): boolean { return this.running; }
  /** Reutiliza Three.Scene; solamente añade/actualiza/elimina perspectivas. */
  setVirtualCameras(cameras: readonly Pick<Camera, 'id' | 'sourceType' | 'virtualPose' | 'virtualSweep'>[]): void {
    const valid = cameras.filter(camera => camera.sourceType === 'virtual-3d');
    const ids = new Set(valid.map(camera => camera.id));
    for (const id of this.cameras.keys()) if (!ids.has(id)) {
      this.cameras.delete(id); this.basePoses.delete(id); this.sweeps.delete(id);
    }
    for (const record of valid) {
      if (record.virtualSweep) this.sweeps.set(record.id, record.virtualSweep);
      else this.sweeps.delete(record.id);
      this.setVirtualPerspective(record.id, virtualPoseFor(record.id, record.virtualPose));
    }
    if (!this.cameras.has(this.cameraId)) this.cameraId = valid[0]?.id ?? 'CAM-01';
  }

  setVirtualPerspective(id: string, pose: VirtualCameraPose): void {
    if (!this.cameras.has(id)) this.cameras.set(id, new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.1, 80));
    this.basePoses.set(id, { ...pose });
    this.applyPerspective(id);
  }

  /** El soporte permanece fijo; se anima solo la orientación horizontal de la lente. */
  private applyPerspective(id: string): void {
    const camera = this.cameras.get(id);
    const pose = this.basePoses.get(id);
    if (!camera || !pose) return;
    const sweep = this.sweeps.get(id);
    const activePose = sweep ? sweepPoseAt(pose, sweep, this.elapsed) : pose;
    camera.fov = pose.fov;
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(activePose.targetX, activePose.targetY, activePose.targetZ);
    camera.updateProjectionMatrix();
  }

  get selectedCamera(): CameraId { return this.cameraId; }
  selectCamera(cameraId: CameraId): void {
    if (!this.cameras.has(cameraId)) throw new Error(`Perspectiva ${cameraId} inexistente.`);
    this.cameraId = cameraId;
    this.publish();
  }

  reset(): void {
    this.elapsed = 0;
    this.guard.reset();
    this.zoneActive = false;
    // Si había una advertencia activa, se anota su cierre al reiniciar.
    const finalCaution = this.cautionRule.stop(this.cautionElapsed);
    if (finalCaution) this.onCautionDemoEvent(finalCaution);
    // Reiniciar la secuencia visual no reabre avisos previos.
    this.cautionElapsed = 0;
    this.cautionRule.reset();
    if (this.cautionDemoEnabled) {
      const initial = cautionWorkerPosition(0);
      this.cautionWorker.position.set(initial.x, 0, initial.z);
    }
    this.updatePersons();
    this.publish();
  }

  private publish(): void {
    this.onUpdate({
      elapsedSeconds: this.elapsed,
      selectedCamera: this.cameraId,
      workerInZone: this.zoneActive,
      zoneConfirmed: this.guard.isOccupied,
      positionX: this.workerTwo.position.x,
      running: this.running,
      cautionDemoEnabled: this.cautionDemoEnabled,
      cautionNoticeActive: this.cautionDemoEnabled && this.cautionRule.isActive,
      cautionDistance: this.cautionDemoEnabled ? nearestCautionConeDistance(this.cautionWorker.position) : null,
    });
  }

  resize(): void {
    const width = Math.max(320, this.canvas.clientWidth || 800);
    const height = Math.max(240, this.canvas.clientHeight || 500);
    this.renderer.setSize(width, height, false);
    for (const camera of this.cameras.values()) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  /** Captura fotogramas RGB generados por la cámara virtual, no cajas/etiquetas programadas. */
  async capture(cameraId: CameraId, preview: HTMLCanvasElement, zoom = 1): Promise<ImageBitmap> {
    const perspective = this.cameras.get(cameraId);
    if (!perspective) throw new Error(`No existe la perspectiva ${cameraId}.`);
    const camera = perspective.clone();
    camera.aspect = 640 / 480;
    camera.zoom = zoom; // Únicamente el encuadre de YOLO; no modifica la cámara principal.
    camera.updateProjectionMatrix();
    // El operario ficticio se excluye deliberadamente de los fotogramas YOLO:
    // su aparición visual NO debe generar detecciones/alertas oficiales.
    const wasDemoVisible = this.cautionWorker.visible;
    this.cautionWorker.visible = false;
    try { this.captureRenderer.render(this.scene, camera); }
    finally { this.cautionWorker.visible = wasDemoVisible; }
    const context = preview.getContext('2d');
    if (context) context.drawImage(this.captureRenderer.domElement, 0, 0, preview.width, preview.height);
    return createImageBitmap(this.captureRenderer.domElement);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.captureRenderer.dispose();
  }
}
