import { transitionIncident, type Incident } from '../../core/domain/incident';
import { applySharedDecision } from '../remote/sharedDecision';
import type { SharedIncidentRow } from '../remote/sharedHistory';

/** Evento estructurado y auditable: no almacena fotografías ni clips. */
export type IncidentAuditAction = 'opened' | 'acknowledged' | 'escalated' | 'closed' | 'tracking-lost' | 'closed-by-supervisor';
export interface IncidentAuditEvent {
  id: string;
  incidentId: string;
  cameraId: string;
  action: IncidentAuditAction;
  at: string;
  actor: string;
  note?: string;
}
export interface CenterIncident extends Incident {
  /** ID local asignado por este centro, independiente de los contadores de cada cámara. */
  sourceKey: string;
  closureType?: 'yolo-confirmed' | 'human-review';
  closingNote?: string;
  /** La observación de esta intrusión se interrumpió: la identidad ya no es verificable. */
  observationInterruptedAt?: string;
  observationReason?: string;
  /** Nueva trayectoria relacionada de forma provisional, sin afirmar identidad personal. */
  recoverySourceKey?: string;
  /** Una salida tras reanudar NO acredita la salida del track original. */
  recoveryExitObservedAt?: string;
}
export interface IncidentCenterState {
  incidents: CenterIncident[];
  audit: IncidentAuditEvent[];
  sequence: number;
  auditSequence: number;
  storageOk: boolean;
}
export interface IncidentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const INCIDENT_STORAGE_KEY = 'vision-ai:incident-center:v1';
const MAX_INCIDENTS = 300;
const MAX_AUDIT = 1200;

function emptyState(): IncidentCenterState {
  return { incidents: [], audit: [], sequence: 1, auditSequence: 1, storageOk: true };
}

/** Sólo se restauran registros con formato válido y origen real YOLO. */
function restore(storage: IncidentStorage | null): IncidentCenterState {
  const initial = emptyState();
  if (!storage) return { ...initial, storageOk: false };
  try {
    const value = storage.getItem(INCIDENT_STORAGE_KEY);
    if (!value) return initial;
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object') return initial;
    const record = data as Partial<IncidentCenterState>;
    if (!Array.isArray(record.incidents) || !Array.isArray(record.audit)) return initial;
    const incidents = record.incidents.filter((entry): entry is CenterIncident =>
      entry !== null && typeof entry === 'object' && typeof entry.id === 'string' &&
      typeof entry.cameraId === 'string' && typeof entry.sourceKey === 'string' &&
      typeof entry.openedAt === 'string' && Number.isFinite(Date.parse(entry.openedAt)) &&
      entry.source === 'yolo' && ['open', 'acknowledged', 'escalated', 'closed'].includes(entry.status));
    const audit = record.audit.filter((entry): entry is IncidentAuditEvent =>
      entry !== null && typeof entry === 'object' && typeof entry.id === 'string' &&
      typeof entry.incidentId === 'string' && typeof entry.action === 'string' && typeof entry.at === 'string');
    return { incidents: incidents.slice(0, MAX_INCIDENTS), audit: audit.slice(0, MAX_AUDIT),
      sequence: Number.isInteger(record.sequence) && (record.sequence ?? 0) > 0 ? record.sequence! : incidents.length + 1,
      auditSequence: Number.isInteger(record.auditSequence) && (record.auditSequence ?? 0) > 0 ? record.auditSequence! : audit.length + 1,
      storageOk: true };
  } catch {
    // Si localStorage no está disponible, se continúa en memoria sin afirmar persistencia.
    return { ...initial, storageOk: false };
  }
}

/**
 * Centro de incidentes compartido por las rutas del producto.
 * Consume sólo incidentes provenientes del coordinador YOLO, publica eventos
 * a sus suscriptores y persiste metadatos localmente, sin servicio remoto.
 */
export class IncidentCenter {
  private state: IncidentCenterState;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: IncidentStorage | null = null) {
    this.state = restore(storage);
  }

  readonly getSnapshot = (): IncidentCenterState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: IncidentCenterState): void {
    let storageOk = next.storageOk;
    if (this.storage) {
      try {
        const { storageOk: _flag, ...persistent } = next;
        void _flag;
        this.storage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(persistent));
        storageOk = true;
      } catch { storageOk = false; }
    } else storageOk = false;
    this.state = { ...next, storageOk };
    for (const listener of this.listeners) listener();
  }

  private auditFor(state: IncidentCenterState, incident: CenterIncident, action: IncidentAuditAction,
    at: string, actor: string, note?: string): IncidentCenterState {
    const event: IncidentAuditEvent = {
      id: `AUD-${String(state.auditSequence).padStart(6, '0')}`,
      incidentId: incident.id, cameraId: incident.cameraId, action, at, actor, ...(note ? { note } : {}),
    };
    return { ...state, audit: [event, ...state.audit].slice(0, MAX_AUDIT), auditSequence: state.auditSequence + 1 };
  }

  /**
   * Una interrupción destruye la continuidad del seguimiento, NO cierra el incidente.
   * Usamos `tracking-lost` en la auditoría remota existente y una nota diferenciada,
   * evitando migraciones SQL y sin inventar una salida del trabajador.
   * Omitir cameraIds marca todas las cámaras (p. ej. al restaurar una sesión).
   */
  markMonitoringInterrupted(
    cameraIds?: readonly string[],
    reason = 'Monitoreo interrumpido',
    at = new Date().toISOString(),
  ): void {
    if (!Number.isFinite(Date.parse(at))) return;
    const cameras = cameraIds ? new Set(cameraIds) : null;
    let next = this.state;
    let changed = false;
    for (const incident of this.state.incidents) {
      if (incident.status === 'closed' || incident.observationInterruptedAt ||
        (cameras && !cameras.has(incident.cameraId)) || Date.parse(at) < Date.parse(incident.openedAt)) continue;
      const updated: CenterIncident = { ...incident, requiresReview: true,
        observationInterruptedAt: at, observationReason: reason };
      next = { ...next, incidents: next.incidents.map(item => item.id === incident.id ? updated : item) };
      next = this.auditFor(next, updated, 'tracking-lost', at, 'Sistema', `Observación interrumpida: ${reason}`);
      changed = true;
    }
    if (changed) this.publish(next);
  }

  /**
   * La primera trayectoria reabierta en la misma cámara/zona puede representar el
   * incidente anterior. Se asocia provisionalmente solo cuando hay un candidato
   * único y nunca se permite que esa trayectoria cierre el incidente original.
   * Con múltiples candidatos se mantiene la incertidumbre y no se fusionan personas.
   */
  private recoveryCandidate(state: IncidentCenterState, source: Incident, sourceKey: string): CenterIncident | null {
    const candidates = state.incidents.filter(item => item.status !== 'closed' &&
      item.observationInterruptedAt && !item.recoverySourceKey && item.sourceKey !== sourceKey &&
      item.cameraId === source.cameraId && item.zoneId === source.zoneId && item.ruleId === source.ruleId);
    return candidates.length === 1 ? candidates[0] : null;
  }

  /** Idempotente: recibir el mismo snapshot en cada fotograma no duplica eventos. */
  ingest(snapshot: readonly Incident[]): void {
    let next = this.state;
    let changed = false;
    for (const source of snapshot) {
      if (source.source !== 'yolo' || !source.cameraId || !source.zoneId || !source.trackId ||
        !Number.isFinite(Date.parse(source.openedAt))) continue;
      const sourceKey = [source.cameraId, source.zoneId, source.ruleId, source.trackId, source.openedAt].join('|');
      const current = next.incidents.find(entry => entry.sourceKey === sourceKey || entry.recoverySourceKey === sourceKey);
      if (!current) {
        const recovering = this.recoveryCandidate(next, source, sourceKey);
        if (recovering) {
          const updated: CenterIncident = { ...recovering, recoverySourceKey: sourceKey, requiresReview: true,
            ...(source.status === 'closed' && source.closedAt ? { recoveryExitObservedAt: source.closedAt } : {}) };
          next = { ...next, incidents: next.incidents.map(entry => entry.id === recovering.id ? updated : entry) };
          const note = source.status === 'closed'
            ? 'Trayectoria posterior a la interrupción: salida observada, identidad y continuidad NO verificadas.'
            : 'Trayectoria posterior a la interrupción: asociación provisional, identidad NO verificada.';
          next = this.auditFor(next, updated, 'tracking-lost', source.closedAt ?? source.openedAt, 'Sistema', note);
          changed = true;
          continue;
        }
        const incident: CenterIncident = { ...source, id: `INC-${String(next.sequence).padStart(6, '0')}`, sourceKey };
        next = { ...next, incidents: [incident, ...next.incidents].slice(0, MAX_INCIDENTS), sequence: next.sequence + 1 };
        next = this.auditFor(next, incident, 'opened', incident.openedAt, 'YOLO');
        changed = true;
        if (incident.status === 'closed' && incident.closedAt) {
          next = { ...next, incidents: next.incidents.map(entry => entry.id === incident.id ?
            { ...entry, closureType: 'yolo-confirmed' } : entry) };
          next = this.auditFor(next, incident, 'closed', incident.closedAt, 'YOLO');
        }
        continue;
      }
      if (current.status === 'closed') continue; // Cierre confirmado/manual es definitivo.
      let updated = current;
      if (source.status === 'closed' && source.closedAt) {
        if (current.observationInterruptedAt) {
          // No es seguro cerrar después de perder la identidad de seguimiento.
          if (!current.recoveryExitObservedAt) {
            updated = { ...current, recoveryExitObservedAt: source.closedAt, requiresReview: true };
            next = this.auditFor(next, updated, 'tracking-lost', source.closedAt, 'Sistema',
              'Salida tras interrupción observada; requiere cierre por revisión humana.');
          }
        } else {
          try {
            updated = { ...transitionIncident(current, { action: 'close', at: source.closedAt }),
              sourceKey: current.sourceKey, closureType: 'yolo-confirmed' };
            next = this.auditFor(next, updated, 'closed', source.closedAt, 'YOLO');
          } catch { /* Fechas no válidas no alteran el historial. */ }
        }
      } else if (source.requiresReview && !current.requiresReview) {
        updated = { ...current, requiresReview: true };
        next = this.auditFor(next, updated, 'tracking-lost', new Date().toISOString(), 'YOLO');
      }
      if (updated !== current) {
        next = { ...next, incidents: next.incidents.map(entry => entry.id === current.id ? updated : entry) };
        changed = true;
      }
    }
    if (changed) this.publish(next);
  }

  /**
   * Refleja las decisiones REMOTAS en el navegador que originó la detección.
   * No copia incidentes ajenos ni crea eventos locales duplicados. El historial
   * global se lee siempre desde Supabase con su autor original.
   */
  reconcileSharedDecisions(rows: readonly SharedIncidentRow[]): void {
    if (!rows.length) return;
    const byLocalId = new Map(rows.map(row => [row.local_id, row]));
    let changed = false;
    const incidents = this.state.incidents.map(local => {
      const row = byLocalId.get(local.id);
      if (!row) return local;
      const next = applySharedDecision(local, row);
      if (next !== local) changed = true;
      return next;
    });
    if (changed) this.publish({ ...this.state, incidents });
  }

  acknowledge(id: string, by: string, at = new Date().toISOString()): void {
    const actor = by.trim();
    if (!actor) throw new Error('Indica el nombre del supervisor.');
    const current = this.state.incidents.find(item => item.id === id);
    if (!current) throw new Error('Incidente no encontrado.');
    const updated = transitionIncident(current, { action: 'acknowledge', by: actor, at });
    const next = { ...this.state, incidents: this.state.incidents.map(item => item.id === id ? { ...updated, sourceKey: current.sourceKey } : item) };
    this.publish(this.auditFor(next, { ...updated, sourceKey: current.sourceKey }, 'acknowledged', at, actor));
  }

  /** Requiere reconocimiento y nota; no se registra como salida detectada por YOLO. */
  closeReviewed(id: string, by: string, note: string, at = new Date().toISOString()): void {
    const actor = by.trim();
    const details = note.trim();
    if (!actor || details.length < 10) throw new Error('Indica supervisor y motivo de revisión (mínimo 10 caracteres).');
    const current = this.state.incidents.find(item => item.id === id);
    if (!current) throw new Error('Incidente no encontrado.');
    if (current.status !== 'acknowledged') throw new Error('Reconoce primero el incidente para cerrarlo manualmente.');
    const updated: CenterIncident = { ...transitionIncident(current, { action: 'close', at }),
      sourceKey: current.sourceKey, closureType: 'human-review', closingNote: details };
    const next = { ...this.state, incidents: this.state.incidents.map(item => item.id === id ? updated : item) };
    this.publish(this.auditFor(next, updated, 'closed-by-supervisor', at, actor, details));
  }

  /** El escalamiento es temporal; no simula detecciones ni modifica la fuente. */
  escalateOverdue(at = new Date().toISOString(), delaySec = 60): void {
    const now = Date.parse(at);
    if (!Number.isFinite(now) || !Number.isFinite(delaySec) || delaySec <= 0) return;
    let next = this.state;
    let changed = false;
    for (const current of this.state.incidents) {
      if (current.status !== 'open' || now - Date.parse(current.openedAt) < delaySec * 1000) continue;
      const updated: CenterIncident = { ...transitionIncident(current, { action: 'escalate', at }), sourceKey: current.sourceKey,
        severity: current.severity === 'high' ? 'critical' : current.severity };
      next = { ...next, incidents: next.incidents.map(entry => entry.id === current.id ? updated : entry) };
      next = this.auditFor(next, updated, 'escalated', at, 'Sistema');
      changed = true;
    }
    if (changed) this.publish(next);
  }
}
