/**
 * Adaptador DEMO determinista de precaución, independiente de YOLO y Three.js.
 * Sus eventos sólo pueden mostrarse en la vista de simulación; nunca deben
 * introducirse en el motor de incidentes reales ni sincronizarse con Supabase.
 */
import { CONE_POSITIONS } from './PrecautionGeometry';

export type CautionDemoTransition = 'near' | 'clear';
export interface CautionDemoEvent {
  type: CautionDemoTransition;
  /** Segundos transcurridos desde que se inició esta ejecución de la demo. */
  atSeconds: number;
  distance: number;
  source: 'DEMO';
  reason?: 'left' | 'stopped';
}

export interface DemoPosition { x: number; z: number }

const CYCLE_SECONDS = 18;
export const PRECAUTION_RADIUS = 1.55;

/**
 * Recorrido repetible de un trabajador que se aproxima al cono más cercano,
 * permanece brevemente en el área y luego retrocede hacia un pasillo seguro.
 * Siempre está fuera del polígono rojo de maquinaria (x >= 6.1).
 */
export function cautionWorkerPosition(seconds: number): DemoPosition {
  const cycle = ((seconds % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  const safe = { x: 4.9, z: 1.5 };
  const approaching = { x: 1.65, z: -0.74 };
  const interpolate = (ratio: number) => ({
    x: safe.x + (approaching.x - safe.x) * ratio,
    z: safe.z + (approaching.z - safe.z) * ratio,
  });
  if (cycle < 5) return interpolate(cycle / 5);
  if (cycle < 10) return approaching;
  if (cycle < 15) return interpolate(1 - (cycle - 10) / 5);
  return safe;
}

/** Distancia del trabajador al cono más próximo, en unidades del escenario. */
export function nearestCautionConeDistance(position: DemoPosition): number {
  return Math.min(...CONE_POSITIONS.map(cone => Math.hypot(cone.x - position.x, cone.z - position.z)));
}

/**
 * Histeresis temporal: exige presencia confirmada durante 500 ms y salida
 * durante 700 ms, para que el aviso no parpadee en el borde de los conos.
 */
export class PrecautionDemoRule {
  private nearSince: number | null = null;
  private clearSince: number | null = null;
  private active = false;

  update(seconds: number): CautionDemoEvent | null {
    const distance = nearestCautionConeDistance(cautionWorkerPosition(seconds));
    if (distance <= PRECAUTION_RADIUS) {
      this.clearSince = null;
      this.nearSince ??= seconds;
      if (!this.active && seconds - this.nearSince >= 0.5) {
        this.active = true;
        return { type: 'near', atSeconds: seconds, distance, source: 'DEMO' };
      }
    } else {
      this.nearSince = null;
      this.clearSince ??= seconds;
      if (this.active && seconds - this.clearSince >= 0.7) {
        this.active = false;
        return { type: 'clear', atSeconds: seconds, distance, source: 'DEMO', reason: 'left' };
      }
    }
    return null;
  }

  stop(seconds: number): CautionDemoEvent | null {
    const wasActive = this.active;
    this.reset();
    return wasActive ? {
      type: 'clear', atSeconds: seconds, distance: nearestCautionConeDistance(cautionWorkerPosition(seconds)),
      source: 'DEMO', reason: 'stopped',
    } : null;
  }

  reset(): void {
    this.active = false;
    this.nearSince = null;
    this.clearSince = null;
  }

  get isActive(): boolean { return this.active; }
}
