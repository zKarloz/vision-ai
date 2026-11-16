import type { SafetyRule } from './zone';

export interface RuleMatch {
  cameraId: string;
  zoneId: string;
  trackId: string;
  classId: SafetyRule['classId'];
  confidence: number;
}

/**
 * Aplica habilitación, umbral y cooldown por cámara/zona/seguimiento.
 * La confirmación de N fotogramas y la histéresis las realiza VisualZoneMonitor
 * sobre detecciones reales; aquí llegan exclusivamente entradas ya confirmadas.
 */
export class RuleEngine {
  private readonly lastEmitted = new Map<string, number>();

  shouldRaise(rule: SafetyRule, match: RuleMatch, atMs: number): boolean {
    if (!Number.isFinite(atMs) || !Number.isFinite(match.confidence)) return false;
    if (!rule.enabled || rule.zoneId !== match.zoneId || rule.classId !== match.classId) return false;
    if (match.confidence < rule.minConfidence || match.confidence > 1) return false;
    const key = `${rule.id}|${match.cameraId}|${match.zoneId}|${match.trackId}`;
    const previous = this.lastEmitted.get(key);
    if (previous !== undefined && atMs - previous < rule.cooldownSec * 1000) return false;
    this.lastEmitted.set(key, atMs);
    return true;
  }

  reset(): void { this.lastEmitted.clear(); }
}
