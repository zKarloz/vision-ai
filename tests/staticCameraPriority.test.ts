import { describe, expect, it } from 'vitest';
import {
  createStaticVirtualCameraDraft, INITIAL_CAMERAS, validateCameraDraft,
} from '../src/core/domain/camera';
import { cameraMonitoringPolicy, invalidatesImageZone } from '../src/core/domain/cameraMonitoringPolicy';
import { DEFAULT_VIRTUAL_POSES, NEW_VIRTUAL_POSE } from '../src/core/domain/virtualCameraPose';
import { registerCamera, updateCamera } from '../src/application/cameras/CameraRegistry';
import { validateConfig } from '../src/application/config/configSchema';

const staticCamera = { enabled: true, sourceType: 'virtual-3d' as const };

describe('Etapa 4 · cámaras fijas por defecto y seguridad espacial', () => {
  it('el alta comienza en 3D fijo, sin activar el barrido', () => {
    const draft = createStaticVirtualCameraDraft();
    expect(draft.sourceType).toBe('virtual-3d');
    expect(draft.virtualPose).toEqual(NEW_VIRTUAL_POSE);
    expect(draft.virtualSweep).toBeUndefined();
  });

  it('los formularios nuevos no comparten una pose mutable', () => {
    const a = createStaticVirtualCameraDraft();
    const b = createStaticVirtualCameraDraft();
    expect(a.virtualPose).not.toBe(b.virtualPose);
    if (a.virtualPose) a.virtualPose.x = 5;
    expect(b.virtualPose?.x).toBe(NEW_VIRTUAL_POSE.x);
  });

  it('una cámara fija nueva se registra y versiona sin inventar movimiento', () => {
    const draft = {
      ...createStaticVirtualCameraDraft(), name: 'Puerta norte', location: 'Acceso industrial',
    };
    expect(validateCameraDraft(draft)).toEqual([]);
    const cameras = registerCamera(INITIAL_CAMERAS, draft, new Date('2026-11-15T00:00:00Z'));
    expect(cameras.at(-1)?.id).toBe('CAM-03');
    expect(cameras.at(-1)?.virtualSweep).toBeUndefined();
    expect(validateConfig({ schemaVersion: 1, cameras, zones: [], rules: [] }).cameras).toHaveLength(3);
  });

  it('la fuente 3D fija permite evaluación de zonas de imagen', () => {
    expect(cameraMonitoringPolicy(staticCamera)).toMatchObject({ analyzable: true, imageZones: true });
  });

  it('el barrido conserva YOLO pero suspende los polígonos fijos de imagen', () => {
    const moving = { ...staticCamera, virtualSweep: { mode: 'sweep' as const, amplitudeDeg: 25, periodSec: 12 } };
    expect(cameraMonitoringPolicy(moving)).toMatchObject({ analyzable: true, imageZones: false });
  });

  it('el barrido es reversible: al volver a cámara fija se recupera la evaluación', () => {
    const draft = { ...createStaticVirtualCameraDraft(), name: 'Control acceso', location: 'Patio logístico' };
    const cameras = registerCamera(INITIAL_CAMERAS, draft);
    const sweeping = updateCamera(cameras, 'CAM-03', {
      ...draft, virtualSweep: { mode: 'sweep', amplitudeDeg: 25, periodSec: 12 },
    });
    expect(cameraMonitoringPolicy(sweeping.at(-1)!)).toMatchObject({ imageZones: false });
    const fixed = updateCamera(sweeping, 'CAM-03', draft);
    expect(cameraMonitoringPolicy(fixed.at(-1)!)).toMatchObject({ imageZones: true });
    expect(fixed.at(-1)?.virtualSweep).toBeUndefined();
    expect(sweeping.at(-1)?.virtualSweep?.mode).toBe('sweep'); // Edición inmutable.
  });

  it('al convertir una cámara 3D a video elimina pose y barrido obsoletos', () => {
    const draft = { ...createStaticVirtualCameraDraft(), name: 'Acceso oeste', location: 'Control exterior' };
    const created = registerCamera(INITIAL_CAMERAS, draft);
    const moving = updateCamera(created, 'CAM-03', {
      ...draft, virtualSweep: { mode: 'sweep', amplitudeDeg: 25, periodSec: 12 },
    });
    const video = updateCamera(moving, 'CAM-03', {
      name: draft.name, location: draft.location, sourceType: 'video-loop', enabled: true,
    });
    const camera = video.find(item => item.id === 'CAM-03')!;
    expect(camera).toMatchObject({ sourceType: 'video-loop', virtualPose: undefined, virtualSweep: undefined });
    expect(cameraMonitoringPolicy(camera)).toMatchObject({ analyzable: true, imageZones: true });
    expect(validateConfig({ schemaVersion: 1, cameras: video, zones: [], rules: [] }).cameras).toHaveLength(3);
  });

  it('las cámaras deshabilitadas no se analizan ni evalúan como zonas activas', () => {
    expect(cameraMonitoringPolicy({ ...staticCamera, enabled: false })).toMatchObject({ analyzable: false, imageZones: false });
  });

  it('MP4 y webcam admiten zonas sobre fotogramas; IP continúa sin adaptador', () => {
    expect(cameraMonitoringPolicy({ enabled: true, sourceType: 'video-loop' })).toMatchObject({ analyzable: true, imageZones: true });
    expect(cameraMonitoringPolicy({ enabled: true, sourceType: 'webcam' })).toMatchObject({ analyzable: true, imageZones: true });
    expect(cameraMonitoringPolicy({ enabled: true, sourceType: 'ip-camera' })).toMatchObject({ analyzable: false, imageZones: false });
  });
});


describe('Etapa 4 · zona ligada al encuadre', () => {
  it('mantiene la calibración si solo cambia el nombre o se activa barrido opcional', () => {
    const base = { sourceType: 'virtual-3d' as const, virtualPose: DEFAULT_VIRTUAL_POSES['CAM-02'] };
    expect(invalidatesImageZone(base, base, 'CAM-02')).toBe(false);
    expect(invalidatesImageZone(base, { ...base }, 'CAM-02')).toBe(false);
    expect(invalidatesImageZone({ sourceType: 'virtual-3d' }, base, 'CAM-02')).toBe(false); // Configuración anterior sin pose explícita
  });
  it('desactiva las zonas al cambiar la perspectiva de cámara virtual', () => {
    const base = { sourceType: 'virtual-3d' as const, virtualPose: DEFAULT_VIRTUAL_POSES['CAM-02'] };
    expect(invalidatesImageZone(base, { ...base, virtualPose: { ...base.virtualPose, fov: 65 } }, 'CAM-02')).toBe(true);
  });
  it('desactiva las zonas al cambiar el origen de las imágenes', () => {
    expect(invalidatesImageZone({ sourceType: 'webcam' }, { sourceType: 'video-loop' }, 'CAM-03')).toBe(true);
    expect(invalidatesImageZone({ sourceType: 'virtual-3d' }, { sourceType: 'webcam' }, 'CAM-03')).toBe(true);
    expect(invalidatesImageZone({ sourceType: 'video-loop' }, { sourceType: 'video-loop' }, 'CAM-03')).toBe(false);
  });
});
