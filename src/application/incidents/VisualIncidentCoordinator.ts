import { IncidentStateMachine, openIncident, type Incident } from '../../core/domain/incident';
import { RuleEngine } from '../../core/domain/ruleEngine';
import type { SafetyRule, Zone } from '../../core/domain/zone';
import { intersectionOverUnion, type VisionEvent, type VisionTrack } from '../../domain/visualTracking';
import type { Detection } from '../../core/types/vision';

export interface IncidentLogEntry {
  key: string;
  incidentId: string;
  cameraId: string;
  eventType: VisionEvent['type'];
  occurredAt: string;
  confidence: number;
}

/**
 * Caso de uso de integración: traduce eventos de YOLO confirmado a incidentes.
 * No consume eventos geométricos ni crea detecciones falsas.
 * Es una sesión en memoria; historial persistente y auditoría llegan en etapas 3/5.
 */
export class VisualIncidentCoordinator {
  private readonly rules = new RuleEngine();
  private readonly machine = new IncidentStateMachine();
  private incidents: Incident[] = [];
  private log: IncidentLogEntry[] = [];
  private sequence = 1;
  private logSequence = 1;
  // Sólo se conserva geometría en memoria; jamás se envía a Supabase ni se almacena en disco.
  private readonly lastBoxes = new Map<string, { box: Detection['box']; atMs: number }>();
  // Nuevos trackIds asociados provisionalmente a una observación interrumpida.
  private readonly tentativeTracks = new Map<string, { incidentId: string; active: boolean }>();
  // Una salida de una trayectoria provisional no acredita la antigua, pero sí
  // impide asociar automáticamente una intrusión posterior a aquella trayectoria.
  private readonly tentativeExits = new Set<string>();

  private trackKey(cameraId: string, zoneId: string, ruleId: string, trackId: string): string {
    return `${cameraId}|${zoneId}|${ruleId}|${trackId}`;
  }

  /** Refresca la posición del track ORIGINAL, sin usar posiciones del motor 3D. */
  observeTracks(cameraId: string, tracks: readonly VisionTrack[], atMs: number): void {
    for (const incident of this.incidents) {
      if (incident.cameraId !== cameraId || incident.status === 'closed') continue;
      const observed = tracks.find(track => track.seen && track.alertOpen && String(track.id) === incident.trackId);
      if (observed) this.lastBoxes.set(incident.id, { box: { ...observed.box }, atMs });
    }
  }

  /**
   * Una reapertura tras pérdida de seguimiento puede ser el mismo operario, pero
   * NUNCA prueba su identidad. Sólo evita otro incidente cuando hay un candidato
   * único, en la misma cámara/zona/regla, con caja casi idéntica y <10 s de lapso.
   * Si hay duda se mantiene la nueva alerta: no se fusionan trabajadores distintos.
   */
  private recoveryCandidate(event: VisionEvent, zone: Zone, rule: SafetyRule): Incident | null {
    if (!event.box || !Number.isFinite(event.atMs)) return null;
    const matches = this.incidents.filter(incident => {
      if (!incident.requiresReview || incident.status === 'closed' || this.tentativeExits.has(incident.id) ||
        incident.cameraId !== event.cameraId || incident.zoneId !== zone.id || incident.ruleId !== rule.id) return false;
      const recent = this.lastBoxes.get(incident.id);
      if (!recent || event.atMs < recent.atMs || event.atMs - recent.atMs > 10_000) return false;
      // Rechazar cajas lejanas: la coincidencia no depende sólo de estar en la misma zona.
      const a = recent.box;
      const b = event.box!;
      const distance = Math.hypot(a.x + a.width / 2 - b.x - b.width / 2,
        a.y + a.height / 2 - b.y - b.height / 2);
      return distance <= 0.075 && intersectionOverUnion(a, b) >= 0.50;
    });
    // No atribuir un nuevo track a dos incidentes antiguos ni viceversa.
    return matches.length === 1 && ![...this.tentativeTracks.values()].some(alias => alias.incidentId === matches[0].id && alias.active)
      ? matches[0] : null;
  }

  ingest(events: readonly VisionEvent[], zone: Zone | null, rule: SafetyRule, observedAt: string): void {
    if (!zone || !zone.enabled || zone.type !== 'restricted' || zone.id !== rule.zoneId) return;
    for (const event of events) {
      if (event.source !== 'yolo' || event.cameraId !== zone.cameraId) continue;
      const trackId = String(event.trackId);
      const aliasKey = this.trackKey(event.cameraId, zone.id, rule.id, trackId);
      // La salida de un track asociado sólo provisionalmente no acredita la
      // salida del track original: el cierre seguirá requiriendo revisión humana.
      const alias = this.tentativeTracks.get(aliasKey);
      if (alias) {
        if (event.type === 'lost' || event.type === 'left') {
          alias.active = false;
          if (event.box) this.lastBoxes.set(alias.incidentId, { box: { ...event.box }, atMs: event.atMs });
          if (event.type === 'left') this.tentativeExits.add(alias.incidentId);
        }
        continue;
      }
      const existingIndex = this.incidents.findIndex(incident => incident.cameraId === event.cameraId &&
        incident.zoneId === zone.id && incident.trackId === trackId && incident.status !== 'closed');
      let incident: Incident | null = existingIndex >= 0 ? this.incidents[existingIndex] : null;
      if (event.type === 'opened') {
        if (incident) continue;
        const candidate = this.recoveryCandidate(event, zone, rule);
        if (candidate) {
          this.tentativeTracks.set(aliasKey, { incidentId: candidate.id, active: true });
          // El incidente original mantiene requiresReview; no se inventa continuidad.
          continue;
        }
        if (!this.rules.shouldRaise(rule, { cameraId: event.cameraId,
          zoneId: zone.id, trackId, classId: 'person', confidence: event.confidence }, event.atMs)) continue;
        incident = openIncident({ id: `INC-${String(this.sequence++).padStart(4,'0')}`,
          cameraId: event.cameraId, zoneId: zone.id, ruleId: rule.id, trackId,
          severity: rule.severity, source: 'yolo', confidence: event.confidence, openedAt: observedAt });
        this.incidents = [incident, ...this.incidents];
        if (event.box) this.lastBoxes.set(incident.id, { box: { ...event.box }, atMs: event.atMs });
      } else if (incident && existingIndex >= 0) {
        if (event.box) this.lastBoxes.set(incident.id, { box: { ...event.box }, atMs: event.atMs });
        incident = this.machine.transition(incident, { action: event.type === 'left' ? 'close' : 'tracking-lost', at: observedAt });
        this.incidents[existingIndex] = incident;
      } else continue;
      this.log = [{ key: `LOG-${this.logSequence++}`, incidentId: incident.id,
        cameraId: event.cameraId, eventType: event.type,
        confidence: event.confidence, occurredAt: observedAt }, ...this.log].slice(0, 80);
    }
  }

  snapshot(): { incidents: Incident[]; log: IncidentLogEntry[] } {
    return { incidents: this.incidents.map(item => ({ ...item })), log: this.log.map(item => ({ ...item })) };
  }

  /**
   * Dejar de muestrear una cámara destruye su seguimiento temporal, pero NO
   * afecta a otras cámaras ni a los incidentes persistidos en IncidentCenter.
   */
  forgetCamera(cameraId: string): void {
    this.rules.resetCamera(cameraId);
    const removed = this.incidents.filter(item => item.cameraId === cameraId);
    this.incidents = this.incidents.filter(item => item.cameraId !== cameraId);
    this.log = this.log.filter(item => item.cameraId !== cameraId);
    for (const key of this.tentativeTracks.keys()) if (key.split('|')[0] === cameraId) this.tentativeTracks.delete(key);
    for (const incident of removed) {
      this.lastBoxes.delete(incident.id);
      this.tentativeExits.delete(incident.id);
    }
  }

  /** Sesión efímera; no borra datos de otros repositorios. */
  reset(): void {
    this.rules.reset();
    this.incidents = [];
    this.log = [];
    this.sequence = 1;
    this.logSequence = 1;
    this.lastBoxes.clear();
    this.tentativeTracks.clear();
    this.tentativeExits.clear();
  }
}
