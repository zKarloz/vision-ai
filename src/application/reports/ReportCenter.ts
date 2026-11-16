import type { CenterIncident, IncidentAuditEvent, IncidentCenterState } from '../incidents/IncidentCenter';
import { buildDailyReport, buildIncidentReport, limaDayPeriod, previousLimaDay, type ReportDocument } from '../../core/domain/report';

export type ReportAuditAction = 'generated' | 'exported' | 'unchanged';
export interface ReportAudit { id: number; reportKey: string; action: ReportAuditAction; at: string; detail: string }
export interface ReportCenterState { reports: ReportDocument[]; audit: ReportAudit[]; sequence: number; storageOk: boolean }
export interface ReportStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const REPORT_STORAGE_KEY = 'vision-ai:report-center:v1';
const MAX_REPORTS = 250;
const MAX_AUDIT = 500;

function empty(): ReportCenterState { return { reports: [], audit: [], sequence: 1, storageOk: true }; }
function restore(storage: ReportStorage | null): ReportCenterState {
  if (!storage) return { ...empty(), storageOk: false };
  try {
    const raw = storage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    const data = parsed as Partial<ReportCenterState>;
    if (!Array.isArray(data.reports) || !Array.isArray(data.audit)) return empty();
    const reports = data.reports.filter((item): item is ReportDocument =>
      Boolean(item) && typeof item === 'object' && typeof item.key === 'string' &&
      (item.type === 'incident' || item.type === 'daily') && Array.isArray(item.incidents) &&
      Array.isArray(item.audit) && Boolean(item.stats) && item.origin === 'local-demo');
    const audit = data.audit.filter((item): item is ReportAudit =>
      Boolean(item) && typeof item === 'object' && typeof item.reportKey === 'string' && typeof item.at === 'string');
    return { reports: reports.slice(0, MAX_REPORTS), audit: audit.slice(0, MAX_AUDIT),
      sequence: Number.isInteger(data.sequence) && (data.sequence ?? 0) > 0 ? data.sequence! : audit.length + 1, storageOk: true };
  } catch { return { ...empty(), storageOk: false }; }
}

/** Bandeja local idempotente. No envía correos ni finge entregas remotas. */
export class ReportCenter {
  private state: ReportCenterState;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage: ReportStorage | null = null) { this.state = restore(storage); }
  readonly getSnapshot = (): ReportCenterState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(next: ReportCenterState): void {
    let storageOk = false;
    try {
      if (this.storage) {
        const { storageOk: _flag, ...value } = next;
        void _flag;
        this.storage.setItem(REPORT_STORAGE_KEY, JSON.stringify(value));
        storageOk = true;
      }
    } catch { /* Modo memoria: el reporte sigue disponible en esta sesión. */ }
    this.state = { ...next, storageOk };
    this.listeners.forEach(listener => listener());
  }
  private insert(doc: ReportDocument): boolean {
    if (this.state.reports.some(report => report.key === doc.key)) return false;
    const event: ReportAudit = { id: this.state.sequence, reportKey: doc.key, action: 'generated', at: doc.generatedAt,
      detail: 'Generado y archivado en la bandeja local. No enviado por correo.' };
    this.publish({ ...this.state, reports: [doc, ...this.state.reports].slice(0, MAX_REPORTS),
      audit: [event, ...this.state.audit].slice(0, MAX_AUDIT), sequence: this.state.sequence + 1 });
    return true;
  }
  /** La suscripción es por snapshot: eventos o montajes repetidos no duplican PDFs. */
  syncClosedIncidents(state: Pick<IncidentCenterState, 'incidents' | 'audit'>, now = new Date().toISOString()): number {
    let generated = 0;
    for (const incident of state.incidents) {
      if (incident.source === 'yolo' && incident.status === 'closed' && incident.closedAt &&
          !this.state.reports.some(report => report.key === `incident:${incident.id}`)) {
        if (this.insert(buildIncidentReport(incident, state.audit, now))) generated++;
      }
    }
    return generated;
  }
  generateDay(day: string, incidents: readonly CenterIncident[], audit: readonly IncidentAuditEvent[], now = new Date().toISOString()): boolean {
    return this.insert(buildDailyReport(day, incidents, audit, now));
  }
  /** Solo genera el día anterior si hubo incidentes; no simula un correo enviado. */
  generatePreviousDayIfNeeded(state: Pick<IncidentCenterState, 'incidents' | 'audit'>, now = new Date()): boolean {
    const day = previousLimaDay(now);
    const period = limaDayPeriod(day);
    const fromTime = Date.parse(period.start);
    const endTime = Date.parse(period.end);
    if (!state.incidents.some(item => item.source === 'yolo' && Date.parse(item.openedAt) >= fromTime && Date.parse(item.openedAt) < endTime)) return false;
    return this.generateDay(day, state.incidents, state.audit, now.toISOString());
  }
  recordExport(key: string, format: 'PDF' | 'CSV' | 'JSON', at = new Date().toISOString()): void {
    if (!this.state.reports.some(report => report.key === key)) throw new Error('Reporte no encontrado.');
    const event: ReportAudit = { id: this.state.sequence, reportKey: key, action: 'exported', at, detail: `Descarga local ${format}` };
    this.publish({ ...this.state, audit: [event, ...this.state.audit].slice(0, MAX_AUDIT), sequence: this.state.sequence + 1 });
  }
}
