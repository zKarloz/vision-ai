import type { Camera } from './camera';
import { virtualPoseFor } from './virtualCameraPose';

/**
 * Política única para el visor y los casos de uso: las zonas dibujadas en
 * píxeles solo son fiables cuando el encuadre no se mueve.
 * Webcams y videos se consideran fuentes fijas en la imagen; si el dispositivo
 * físico gira, el usuario debe recalibrar el polígono antes de monitorear.
 */
export function cameraMonitoringPolicy(camera: Pick<Camera, 'enabled' | 'sourceType' | 'virtualSweep'>) {
  if (!camera.enabled) return { analyzable: false, imageZones: false, reason: 'Registro deshabilitado' } as const;
  if (camera.sourceType === 'ip-camera') return { analyzable: false, imageZones: false, reason: 'Adaptador IP pendiente' } as const;
  if (camera.sourceType === 'virtual-3d' && camera.virtualSweep) {
    return { analyzable: true, imageZones: false, reason: 'Barrido activo: solo detección, sin evaluación de zona' } as const;
  }
  return { analyzable: true, imageZones: true, reason: 'Fuente con encuadre fijo' } as const;
}

/**
 * El polígono guardado pertenece a un encuadre concreto. Cambiar de fuente o
 * mover físicamente la cámara 3D exige recalibrarlo; cambiar nombre/ubicación no.
 * El barrido NO borra la zona: suspende su evaluación mientras esté activo.
 */
export function invalidatesImageZone(
  before: Pick<Camera, 'sourceType' | 'virtualPose'>,
  after: Pick<Camera, 'sourceType' | 'virtualPose'>,
  cameraId: string,
): boolean {
  if (before.sourceType !== after.sourceType) return true;
  if (before.sourceType !== 'virtual-3d') return false;
  // Las poses implícitas antiguas se comparan con sus perspectivas originales.
  return JSON.stringify(virtualPoseFor(cameraId, before.virtualPose)) !==
    JSON.stringify(virtualPoseFor(cameraId, after.virtualPose));
}
