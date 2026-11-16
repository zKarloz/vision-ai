import type { Zone } from '../../core/domain/zone';
import type { ImagePoint } from '../../core/domain/spatial';

/** Cada perspectiva, incluso una nueva CAM-03, consulta el polígono de su imagen. */
export function polygonsFromConfig(zones: readonly Zone[]): Record<string, ImagePoint[]> {
  const result: Record<string, ImagePoint[]> = {};
  for (const zone of zones) {
    if (zone.enabled && zone.type === 'restricted' && !result[zone.cameraId]) {
      result[zone.cameraId] = zone.polygon.map(point => ({ ...point }));
    }
  }
  return result;
}
