import { nextCameraId, validateCameraDraft, type Camera, type CameraDraft } from '../../core/domain/camera';

/** Casos de uso puros; permiten probar la gestión sin montar componentes React. */
export function registerCamera(cameras: readonly Camera[], draft: CameraDraft, now = new Date()): Camera[] {
  const issues = validateCameraDraft(draft);
  if (issues.length) throw new Error(issues.join(' '));
  const stamp = now.toISOString();
  return [...cameras, { ...draft, id: nextCameraId(cameras), name: draft.name.trim(), location: draft.location.trim(), createdAt: stamp, updatedAt: stamp }];
}

export function updateCamera(cameras: readonly Camera[], id: string, draft: CameraDraft, now = new Date()): Camera[] {
  const issues = validateCameraDraft(draft);
  if (issues.length) throw new Error(issues.join(' '));
  if (!cameras.some((camera) => camera.id === id)) throw new Error('Cámara no encontrada.');
  return cameras.map((camera) => camera.id === id ? {
    ...camera,
    ...draft,
    // Los campos opcionales deben reemplazarse explícitamente, incluso al
    // desactivar el barrido o convertir una cámara 3D en video/webcam.
    // De otro modo, un objeto anterior conserva virtualSweep/virtualPose.
    virtualPose: draft.virtualPose,
    virtualSweep: draft.virtualSweep,
    name: draft.name.trim(),
    location: draft.location.trim(),
    updatedAt: now.toISOString(),
  } : camera);
}

export function removeCamera(cameras: readonly Camera[], id: string): Camera[] {
  if (!cameras.some((camera) => camera.id === id)) throw new Error('Cámara no encontrada.');
  return cameras.filter((camera) => camera.id !== id);
}

export function setCameraEnabled(cameras: readonly Camera[], id: string, enabled: boolean, now = new Date()): Camera[] {
  const camera = cameras.find((item) => item.id === id);
  if (!camera) throw new Error('Cámara no encontrada.');
  return cameras.map((item) => item.id === id ? { ...item, enabled, updatedAt: now.toISOString() } : item);
}
