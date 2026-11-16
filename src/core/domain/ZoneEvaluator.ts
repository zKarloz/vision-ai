import { footPoint, pointInImagePolygon, type ImagePoint } from './spatial';
import type { Zone } from './zone';

export interface NormalizedBoundingBox { x: number; y: number; width: number; height: number }
export interface SpatialObservation { cameraId: string; point: ImagePoint; zones: Zone[] }

/**
 * Punto de contacto con el suelo según el PDF: centro inferior de la caja.
 * No recibe posiciones de Three.js ni resultados fabricados del simulador.
 */
export class ZoneEvaluator {
  evaluate(cameraId: string, box: NormalizedBoundingBox, zones: readonly Zone[]): SpatialObservation {
    const point = footPoint(box);
    return {
      cameraId, point,
      zones: zones.filter(zone => zone.enabled && zone.cameraId === cameraId &&
        pointInImagePolygon(point, zone.polygon)),
    };
  }

  /** Distancia euclídea normalizada para la futura regla persona–cono. */
  isNearCone(personFoot: ImagePoint, coneFoot: ImagePoint, radius: number): boolean {
    return Number.isFinite(radius) && radius >= 0 &&
      Math.hypot(personFoot.x - coneFoot.x, personFoot.y - coneFoot.y) <= radius;
  }
}
