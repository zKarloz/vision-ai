import { validateImagePolygon, type ImagePoint } from '../../core/domain/spatial';
import { STARTER_RESTRICTED_ZONE } from '../../core/domain/zone';

/** Contrato local de zonas antes de la persistencia PostgreSQL versionada (etapa 3). */
export type SceneCameraId = 'CAM-01' | 'CAM-02';
export type CameraPolygons = Record<SceneCameraId, ImagePoint[]>;
export const SCENE_CAMERA_IDS: readonly SceneCameraId[] = ['CAM-01', 'CAM-02'];
const STORAGE_KEY = 'vision-ai-visual-zones-stage2';
const LEGACY_KEY = 'vision-ai-image-zones-v03';

/** Semillas medibles de CAM-02, no resultados inventados de inferencia. */
export function initialCameraPolygons(): CameraPolygons {
  return { 'CAM-01': [], 'CAM-02': STARTER_RESTRICTED_ZONE.polygon.map(p => ({ ...p })) };
}

/** Prioriza la configuración de etapa 2, con migración de polígonos previos. */
export function readCameraPolygons(storage: Pick<Storage, 'getItem'>): CameraPolygons {
  const result = initialCameraPolygons();
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const record = parsed as Record<string, unknown>;
      for (const id of SCENE_CAMERA_IDS) {
        const polygon = record[id];
        if (!Array.isArray(polygon)) continue;
        if (polygon.length === 0) result[id] = [];
        else if (!validateImagePolygon(polygon as ImagePoint[])) {
          result[id] = (polygon as ImagePoint[]).map(p => ({ x: p.x, y: p.y }));
        }
      }
      return result;
    } catch { /* Datos corruptos, almacenamiento bloqueado o navegadores privados. */ }
  }
  return result;
}

export function writeCameraPolygons(storage: Pick<Storage, 'setItem'>, value: CameraPolygons): void {
  for (const id of SCENE_CAMERA_IDS) {
    const polygon = value[id];
    if (polygon.length && validateImagePolygon(polygon)) throw new Error(`Zona inválida de ${id}.`);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
}
