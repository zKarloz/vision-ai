import type { CenterIncident, IncidentAuditEvent } from '../../application/incidents/IncidentCenter';

/** Contrato de reportes de la etapa 6. Evidencia solo estructurada; nunca imágenes. */
export type ReportType = 'incident' | 'daily';
export type ReportOrigin = 'local-demo' | 'server';
export interface ReportPeriod { start: string; end: string; dayLima?: string }
export interface ReportStats {
  total: number;
  critical: number;
  high: number;
  acknowledged: number;
  closed: number;
  averageResponseSec: number | null;
  averageDurationSec: number | null;
  byCamera: { cameraId: string; count: number }[];
}
export interface ReportDocument {
  key: string;
  type: ReportType;
  origin: ReportOrigin;
  generatedAt: string;
  period: ReportPeriod;
  title: string;
  incidents: CenterIncident[];
  audit: IncidentAuditEvent[];
  stats: ReportStats;
}

export function limaDayKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha inválida.');
  // Perú UTC-05; se usa UTC para evitar depender de la zona horaria del equipo.
  return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Intervalo semiabierto [inicio, fin) del día civil de Lima. */
export function limaDayPeriod(day: string): ReportPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Día incorrecto (AAAA-MM-DD).');
  const start = new Date(`${day}T05:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || limaDayKey(start) !== day) throw new Error('Día inválido.');
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString(), dayLima: day };
}
export function previousLimaDay(date: Date): string {
  return limaDayKey(new Date(date.getTime() - 86_400_000));
}
export function calculateReportStats(incidents: readonly CenterIncident[]): ReportStats {
  const response = incidents.filter(item => item.acknowledgedAt && Date.parse(item.acknowledgedAt) >= Date.parse(item.openedAt))
    .map(item => (Date.parse(item.acknowledgedAt!) - Date.parse(item.openedAt)) / 1000);
  const duration = incidents.filter(item => item.closedAt && Date.parse(item.closedAt) >= Date.parse(item.openedAt))
    .map(item => (Date.parse(item.closedAt!) - Date.parse(item.openedAt)) / 1000);
  const mean = (items: number[]) => items.length ? Math.round(items.reduce((a, b) => a + b, 0) / items.length) : null;
  const counts = new Map<string, number>();
  incidents.forEach(item => counts.set(item.cameraId, (counts.get(item.cameraId) ?? 0) + 1));
  return {
    total: incidents.length,
    critical: incidents.filter(item => item.severity === 'critical').length,
    high: incidents.filter(item => item.severity === 'high').length,
    acknowledged: incidents.filter(item => Boolean(item.acknowledgedAt)).length,
    closed: incidents.filter(item => item.status === 'closed').length,
    averageResponseSec: mean(response),
    averageDurationSec: mean(duration),
    byCamera: [...counts].map(([cameraId, count]) => ({ cameraId, count })).sort((a, b) => b.count - a.count || a.cameraId.localeCompare(b.cameraId)),
  };
}

function safeCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Solo los incidentes de YOLO pueden formar parte de un reporte operativo. */
export function buildIncidentReport(incident: CenterIncident, audit: readonly IncidentAuditEvent[], now: string): ReportDocument {
  if (incident.source !== 'yolo' || incident.status !== 'closed' || !incident.closedAt) throw new Error('Se requieren incidentes YOLO cerrados.');
  const incidents = [safeCopy(incident)];
  return {
    key: `incident:${incident.id}`, type: 'incident', origin: 'local-demo', generatedAt: now,
    period: { start: incident.openedAt, end: incident.closedAt }, title: `Incidente ${incident.id}`,
    incidents, audit: safeCopy(audit.filter(item => item.incidentId === incident.id).sort((a, b) => a.at.localeCompare(b.at))),
    stats: calculateReportStats(incidents),
  };
}

/** Resumen de incidentes que SE ABRIERON ese día, sin dobles conteos por cierre. */
export function buildDailyReport(day: string, incidents: readonly CenterIncident[], audit: readonly IncidentAuditEvent[], now: string): ReportDocument {
  const period = limaDayPeriod(day);
  const selected = incidents.filter(item => item.source === 'yolo' && item.openedAt >= period.start && item.openedAt < period.end);
  const ids = new Set(selected.map(item => item.id));
  return {
    key: `daily:${day}`, type: 'daily', origin: 'local-demo', generatedAt: now, period,
    title: `Resumen diario ${day} (Lima)`,
    incidents: safeCopy(selected), audit: safeCopy(audit.filter(item => ids.has(item.incidentId)).sort((a, b) => a.at.localeCompare(b.at))),
    stats: calculateReportStats(selected),
  };
}
