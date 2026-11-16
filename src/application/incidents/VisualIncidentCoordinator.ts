import { IncidentStateMachine, openIncident, type Incident } from '../../core/domain/incident';
import { RuleEngine } from '../../core/domain/ruleEngine';
import type { SafetyRule, Zone } from '../../core/domain/zone';
import type { VisionEvent } from '../../domain/visualTracking';

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

  ingest(events: readonly VisionEvent[], zone: Zone | null, rule: SafetyRule, observedAt: string): void {
    if (!zone || !zone.enabled || zone.type !== 'restricted' || zone.id !== rule.zoneId) return;
    for (const event of events) {
      if (event.source !== 'yolo' || event.cameraId !== zone.cameraId) continue;
      const trackId = String(event.trackId);
      const existingIndex = this.incidents.findIndex(incident => incident.cameraId === event.cameraId &&
        incident.zoneId === zone.id && incident.trackId === trackId && incident.status !== 'closed');
      let incident: Incident | null = existingIndex >= 0 ? this.incidents[existingIndex] : null;
      if (event.type === 'opened') {
        if (incident || !this.rules.shouldRaise(rule, { cameraId: event.cameraId,
          zoneId: zone.id, trackId, classId: 'person', confidence: event.confidence }, event.atMs)) continue;
        incident = openIncident({ id: `INC-${String(this.sequence++).padStart(4,'0')}`,
          cameraId: event.cameraId, zoneId: zone.id, ruleId: rule.id, trackId,
          severity: rule.severity, source: 'yolo', confidence: event.confidence, openedAt: observedAt });
        this.incidents = [incident, ...this.incidents];
      } else if (incident && existingIndex >= 0) {
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

  /** Sesión efímera; no borra datos de otros repositorios. */
  reset(): void {
    this.rules.reset();
    this.incidents = [];
    this.log = [];
    this.sequence = 1;
    this.logSequence = 1;
  }
}
