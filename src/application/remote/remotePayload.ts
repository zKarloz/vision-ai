import type { CenterIncident, IncidentAuditEvent, IncidentCenterState } from '../incidents/IncidentCenter';

/**
 * Las secuencias INC-000001 son locales y pueden repetirse en navegadores diferentes.
 * La clave remota incorpora el usuario autenticado y una instalación UUID persistente.
 * El origen de datos sigue siendo YOLO en el navegador; NO equivale a un sensor certificado.
 */
export function remoteIncidentId(userId: string, installationId: string, localId: string): string {
  if (!/^[\da-f-]{36}$/i.test(userId) || !/^[\da-f-]{36}$/i.test(installationId) || !/^INC-[\d]{6,}$/.test(localId)) {
    throw new Error('Identificadores de sincronización inválidos.');
  }
  return `${userId}:${installationId}:${localId}`;
}

export interface RemoteIncidentRow {
  id: string;
  owner_id: string;
  installation_id: string;
  local_id: string;
  camera_id: string;
  track_id: string;
  zone_id: string;
  rule_id: string;
  source: 'yolo';
  severity: CenterIncident['severity'];
  status: CenterIncident['status'];
  confidence: number;
  opened_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  closed_at: string | null;
  closure_type: string | null;
  requires_review: boolean;
  duration_sec: number | null;
  updated_at: string;
}

export interface RemoteAuditRow {
  id: string;
  incident_id: string;
  owner_id: string;
  action: IncidentAuditEvent['action'];
  at: string;
  actor: string;
  note: string | null;
}

/** No sincroniza eventos DEMO, fotos, fotogramas ni videos. */
export function buildRemotePayload(
  state: Pick<IncidentCenterState, 'incidents' | 'audit'>,
  userId: string,
  installationId: string,
  updatedAt: string,
): { incidents: RemoteIncidentRow[]; audit: RemoteAuditRow[] } {
  const incidents = state.incidents.filter(item => item.source === 'yolo' &&
    Number.isFinite(Date.parse(item.openedAt)) && item.confidence >= 0 && item.confidence <= 1);
  const ids = new Map(incidents.map(item => [item.id, remoteIncidentId(userId, installationId, item.id)]));
  return {
    incidents: incidents.map(item => ({
      id: ids.get(item.id)!, owner_id: userId, installation_id: installationId,
      local_id: item.id, camera_id: item.cameraId, track_id: item.trackId, zone_id: item.zoneId, rule_id: item.ruleId,
      source: 'yolo' as const, severity: item.severity, status: item.status, confidence: item.confidence,
      opened_at: item.openedAt, acknowledged_at: item.acknowledgedAt ?? null,
      acknowledged_by: item.acknowledgedBy ?? null, closed_at: item.closedAt ?? null,
      closure_type: item.closureType ?? null, requires_review: item.requiresReview, duration_sec: item.durationSec ?? null, updated_at: updatedAt,
    })),
    audit: state.audit.filter(item => ids.has(item.incidentId)).map(item => ({
      id: `${userId}:${installationId}:${item.id}`, incident_id: ids.get(item.incidentId)!, owner_id: userId,
      action: item.action, at: item.at, actor: item.actor, note: item.note ?? null,
    })),
  };
}

export type MemberRole = 'administrador' | 'operador' | 'supervisor' | 'auditor';
export function canSync(role: MemberRole | null): boolean {
  return role === 'administrador' || role === 'operador' || role === 'supervisor';
}
