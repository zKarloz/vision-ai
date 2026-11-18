import type { CenterIncident, IncidentAuditEvent } from '../incidents/IncidentCenter';
import type { ReportDocument } from '../../core/domain/report';
import { calculateReportStats, limaDayPeriod } from '../../core/domain/report';
import type { RemoteIncidentRow } from './remotePayload';

/** Las claves remotas son globales; INC-000001 por sí sola NO identifica un incidente. */
export interface SharedIncidentRow extends RemoteIncidentRow {
  updated_at: string;
}
export interface SharedAuditRow {
  id: string;
  incident_id: string;
  owner_id: string;
  action: IncidentAuditEvent['action'];
  at: string;
  actor: string;
  note: string | null;
}
export interface SharedReportRow {
  key: string;
  type: 'daily' | 'incident';
  period_start: string;
  period_end: string;
  generated_at: string;
  content: unknown;
}
export interface SharedReportAuditRow {
  id: number;
  report_key: string;
  actor: string;
  action: 'generated' | 'exported';
  details: string;
  at: string;
}

/** Representación de lectura; nunca se reenvía al outbox de la cuenta conectada. */
export function sharedIncidentFromRow(row: SharedIncidentRow): CenterIncident {
  return {
    id: row.id,
    sourceKey: row.id,
    cameraId: row.camera_id,
    trackId: row.track_id ?? '',
    zoneId: row.zone_id,
    ruleId: row.rule_id,
    source: 'yolo',
    severity: row.severity,
    status: row.status,
    confidence: Number(row.confidence),
    openedAt: row.opened_at,
    ...(row.acknowledged_at ? { acknowledgedAt: row.acknowledged_at } : {}),
    ...(row.acknowledged_by ? { acknowledgedBy: row.acknowledged_by } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    ...(row.closure_type === 'human-review' || row.closure_type === 'yolo-confirmed'
      ? { closureType: row.closure_type } : {}),
    ...(row.duration_sec !== null ? { durationSec: Number(row.duration_sec) } : {}),
    requiresReview: row.requires_review,
  };
}

export function sharedAuditFromRow(row: SharedAuditRow, cameraId: string): IncidentAuditEvent {
  return {
    id: row.id, incidentId: row.incident_id, cameraId, action: row.action,
    at: row.at, actor: row.actor, ...(row.note ? { note: row.note } : {}),
  };
}

/** Los informes de Cron guardan un snapshot diferente al ReportDocument de la demo. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function incidentFromSnapshot(value: unknown): CenterIncident | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.opened_at !== 'string') return null;
  const status = value.status;
  const severity = value.severity;
  if (!['open', 'acknowledged', 'escalated', 'closed'].includes(String(status)) ||
    !['low', 'medium', 'high', 'critical'].includes(String(severity))) return null;
  return sharedIncidentFromRow({
    id: value.id, owner_id: text(value.owner_id), installation_id: text(value.installation_id),
    local_id: text(value.local_id), camera_id: text(value.camera_id), track_id: text(value.track_id),
    zone_id: text(value.zone_id), rule_id: text(value.rule_id), source: 'yolo',
    severity: severity as CenterIncident['severity'], status: status as CenterIncident['status'],
    confidence: Number(value.confidence ?? 0), opened_at: value.opened_at,
    acknowledged_at: text(value.acknowledged_at) || null,
    acknowledged_by: text(value.acknowledged_by) || null,
    closed_at: text(value.closed_at) || null,
    closure_type: text(value.closure_type) || null,
    requires_review: value.requires_review === true,
    duration_sec: value.duration_sec == null ? null : Number(value.duration_sec),
    updated_at: text(value.updated_at),
  });
}

export function sharedReportFromRow(row: SharedReportRow, audit: readonly IncidentAuditEvent[]): ReportDocument {
  const content = isObject(row.content) ? row.content : {};
  const snapshotItems = row.type === 'incident'
    ? [content.incident]
    : Array.isArray(content.incidents) ? content.incidents : [];
  const incidents = snapshotItems.map(incidentFromSnapshot).filter((i): i is CenterIncident => i !== null);
  const ids = new Set(incidents.map(i => i.id));
  const period = { start: row.period_start, end: row.period_end,
    ...(row.type === 'daily' ? { dayLima: text(content.day, row.key.replace(/^daily:/, '')) } : {}) };
  return {
    key: row.key, type: row.type, origin: 'server', generatedAt: row.generated_at,
    title: row.type === 'daily' ? `Resumen diario ${period.dayLima} (Lima)` :
      `Incidente ${text(content.incident && isObject(content.incident) ? content.incident.local_id : undefined, row.key.slice('incident:'.length).slice(-10))}`,
    period,
    incidents,
    audit: audit.filter(event => ids.has(event.incidentId)).sort((a, b) => a.at.localeCompare(b.at)),
    stats: calculateReportStats(incidents),
  };
}

/** Construye un informe desde el historial común; no lo archiva hasta confirmar RPC. */
export function sharedDailyPreview(day: string, incidents: readonly CenterIncident[], audit: readonly IncidentAuditEvent[]): ReportDocument {
  const period = limaDayPeriod(day);
  const selected = incidents.filter(i => i.openedAt >= period.start && i.openedAt < period.end);
  const ids = new Set(selected.map(i => i.id));
  return {
    key: `daily:${day}`, type: 'daily', origin: 'server', generatedAt: new Date().toISOString(),
    title: `Resumen diario ${day} (Lima)`, period,
    incidents: selected,
    audit: audit.filter(a => ids.has(a.incidentId)),
    stats: calculateReportStats(selected),
  };
}

/** Una tabla auxiliar con error nunca invalida las filas válidas de otra tabla. */
export function settleSharedRows<T>(result: PromiseSettledResult<T[]>): { rows: T[] | null; error: string } {
  if (result.status === 'fulfilled') return { rows: result.value, error: '' };
  return { rows: null, error: result.reason instanceof Error ? result.reason.message : 'Error consultando Supabase.' };
}
