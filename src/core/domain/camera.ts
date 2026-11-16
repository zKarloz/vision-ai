import { NEW_VIRTUAL_POSE, validateVirtualCameraPose, validateVirtualCameraSweep, type VirtualCameraPose, type VirtualCameraSweep } from './virtualCameraPose';

/** Dominio independiente de React y de los adaptadores de video/IA. */
export const CAMERA_SOURCE_TYPES = ['virtual-3d', 'video-loop', 'webcam', 'ip-camera'] as const;
export type CameraSourceType = (typeof CAMERA_SOURCE_TYPES)[number];

export interface Camera {
  id: string;
  name: string;
  location: string;
  sourceType: CameraSourceType;
  virtualPose?: VirtualCameraPose;
  virtualSweep?: VirtualCameraSweep;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CameraDraft = Pick<Camera, 'name' | 'location' | 'sourceType' | 'enabled' | 'virtualPose' | 'virtualSweep'>;

export const SOURCE_NAMES: Record<CameraSourceType, string> = {
  'virtual-3d': 'Escenario 3D',
  'video-loop': 'Video en bucle',
  webcam: 'Webcam',
  'ip-camera': 'Cámara IP',
};

/** Semillas del mundo 3D; otras fuentes se agregan como registros versionados. */
export const INITIAL_CAMERAS: Camera[] = [
  { id: 'CAM-01', name: 'Almacén central', location: 'Estanterías y picking', sourceType: 'virtual-3d', enabled: true, createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z' },
  { id: 'CAM-02', name: 'Área de maquinaria', location: 'Zona restringida Z-02', sourceType: 'virtual-3d', enabled: true, createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z' },
];

/** Valida un registro antes de publicar una nueva versión de configuración. */
export function validateCameraDraft(draft: CameraDraft): string[] {
  const errors: string[] = [];
  if (draft.name.trim().length < 3 || draft.name.trim().length > 60) errors.push('El nombre debe tener entre 3 y 60 caracteres.');
  if (draft.location.trim().length < 3 || draft.location.trim().length > 100) errors.push('La ubicación debe tener entre 3 y 100 caracteres.');
  if (!CAMERA_SOURCE_TYPES.includes(draft.sourceType)) errors.push('La fuente de cámara no es válida.');
  if (typeof draft.enabled !== 'boolean') errors.push('El estado debe ser válido.');
  if (draft.sourceType === 'virtual-3d' && draft.virtualPose) errors.push(...validateVirtualCameraPose(draft.virtualPose));
  if (draft.sourceType === 'virtual-3d' && draft.virtualSweep) errors.push(...validateVirtualCameraSweep(draft.virtualSweep));
  if (draft.sourceType !== 'virtual-3d' && draft.virtualPose !== undefined) errors.push('Solo las cámaras 3D admiten una perspectiva virtual.');
  if (draft.sourceType !== 'virtual-3d' && draft.virtualSweep !== undefined) errors.push('Solo las cámaras 3D admiten barrido automático.');
  return errors;
}

export function nextCameraId(cameras: readonly Camera[]): string {
  const highest = cameras.reduce((max, camera) => {
    const match = /^CAM-(\d+)$/.exec(camera.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CAM-${String(highest + 1).padStart(2, '0')}`;
}

export function summarizeCameras(cameras: readonly Camera[]) {
  return {
    total: cameras.length,
    enabled: cameras.filter((camera) => camera.enabled).length,
    virtual: cameras.filter((camera) => camera.sourceType === 'virtual-3d').length,
    other: cameras.filter((camera) => camera.sourceType !== 'virtual-3d').length,
  };
}

/** Identificadores protegidos de las dos perspectivas iniciales; las demás son dinámicas. */
export function hasVirtualPerspective(id: string): boolean {
  return id === 'CAM-01' || id === 'CAM-02';
}

/**
 * Nueva alta recomendada: una perspectiva ESTÁTICA de la escena compartida.
 * No activa el barrido ni modifica CAM-01/CAM-02. Cada formulario obtiene su copia.
 */
export function createStaticVirtualCameraDraft(): CameraDraft {
  return {
    name: '', location: '', sourceType: 'virtual-3d', enabled: true,
    virtualPose: { ...NEW_VIRTUAL_POSE },
  };
}
