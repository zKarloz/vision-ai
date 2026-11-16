/** Reglas puras del experimento: no conocen Three.js, React ni ONNX. */
export interface Point2D { x: number; z: number }
export interface Zone { id: string; cameraId: string; name: string; polygon: Point2D[] }

export const restrictedZone: Zone = {
  id: 'Z-02', cameraId: 'CAM-02', name: 'Área restringida de maquinaria',
  polygon: [
    { x: 6.1, z: -2.5 }, { x: 10.2, z: -2.5 },
    { x: 10.2, z: 2.3 }, { x: 6.1, z: 2.3 },
  ],
};

/** Ray casting: no requiere valores de prueba hardcoded para abrir incidentes. */
export function isPointInsidePolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crossing = ((a.z > point.z) !== (b.z > point.z)) &&
      (point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x);
    if (crossing) inside = !inside;
  }
  return inside;
}

export type ZoneTransition = 'entered' | 'left' | null;

/** Confirmación de entrada y salida; evita alarmas por contactos de un instante. */
export class ZonePresenceRule {
  private insideSince: number | null = null;
  private outsideSince: number | null = null;
  private occupied = false;
  constructor(private readonly confirmMs = 550, private readonly exitMs = 900) {}

  update(isInside: boolean, nowMs: number): ZoneTransition {
    if (isInside) {
      this.outsideSince = null;
      this.insideSince ??= nowMs;
      if (!this.occupied && nowMs - this.insideSince >= this.confirmMs) {
        this.occupied = true;
        return 'entered';
      }
    } else {
      this.insideSince = null;
      this.outsideSince ??= nowMs;
      if (this.occupied && nowMs - this.outsideSince >= this.exitMs) {
        this.occupied = false;
        return 'left';
      }
    }
    return null;
  }

  reset(): void {
    this.insideSince = null;
    this.outsideSince = null;
    this.occupied = false;
  }

  get isOccupied(): boolean { return this.occupied; }
}

/** Recorrido determinista repetible; no simula detecciones visuales. */
export function workerRestrictedPath(seconds: number): Point2D {
  const t = ((seconds % 19) + 19) % 19;
  let x: number;
  if (t < 5) x = 3.9 + (8.3 - 3.9) * (t / 5);
  else if (t < 10) x = 8.3 + (8.8 - 8.3) * ((t - 5) / 5);
  else if (t < 15) x = 8.8 + (3.9 - 8.8) * ((t - 10) / 5);
  else x = 3.9;
  return { x, z: -0.1 + 0.32 * Math.sin(seconds * 0.4) };
}
