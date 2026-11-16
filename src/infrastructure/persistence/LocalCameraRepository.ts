import { CAMERA_SOURCE_TYPES, INITIAL_CAMERAS, type Camera } from '../../core/domain/camera';
import type { CameraRepository } from '../../application/ports/CameraRepository';

const STORAGE_KEY = 'vision-ai.camera-registry.v1';

function isCamera(value: unknown): value is Camera {
  if (!value || typeof value !== 'object') return false;
  const camera = value as Partial<Camera>;
  return typeof camera.id === 'string' && typeof camera.name === 'string' &&
    typeof camera.location === 'string' && typeof camera.enabled === 'boolean' &&
    typeof camera.sourceType === 'string' && CAMERA_SOURCE_TYPES.some((type) => type === camera.sourceType) &&
    typeof camera.createdAt === 'string' && typeof camera.updatedAt === 'string';
}

/** Persistencia exclusivamente local para Etapa 1; sin autenticación ni multiusuario. */
export class LocalCameraRepository implements CameraRepository {
  load(): Camera[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return INITIAL_CAMERAS.map((camera) => ({ ...camera }));
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data) || !data.every(isCamera) || new Set(data.map((camera: Camera) => camera.id)).size !== data.length) {
        return INITIAL_CAMERAS.map((camera) => ({ ...camera }));
      }
      return data;
    } catch {
      return INITIAL_CAMERAS.map((camera) => ({ ...camera }));
    }
  }

  save(cameras: readonly Camera[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cameras)); }
    catch { /* La UI seguirá operativa cuando el navegador bloquee localStorage. */ }
  }
}
