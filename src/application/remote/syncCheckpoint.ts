import type { RemoteAuditRow, RemoteIncidentRow } from './remotePayload';

export interface SyncCheckpoint {
  version: 1;
  incidents: Record<string, string>;
  audits: string[];
}
export interface SyncPlan {
  incidents: RemoteIncidentRow[];
  audit: RemoteAuditRow[];
  checkpoint: SyncCheckpoint;
  pendingCount: number;
}

/** Cursor local por usuario+instalación; no contiene secretos, solo firmas y IDs. */
export const emptyCheckpoint = (): SyncCheckpoint => ({ version: 1, incidents: {}, audits: [] });

export function parseCheckpoint(raw: string | null): SyncCheckpoint {
  if (!raw) return emptyCheckpoint();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyCheckpoint();
    const item = value as Partial<SyncCheckpoint>;
    if (item.version !== 1 || !item.incidents || typeof item.incidents !== 'object' ||
      Array.isArray(item.incidents) || !Array.isArray(item.audits) ||
      !Object.values(item.incidents).every(v => typeof v === 'string') ||
      !item.audits.every(v => typeof v === 'string')) return emptyCheckpoint();
    return { version: 1, incidents: item.incidents as Record<string, string>, audits: item.audits };
  } catch { return emptyCheckpoint(); }
}

/** Ignorar updated_at (hora del intento) evita escrituras remotas innecesarias. */
function incidentSignature(row: RemoteIncidentRow): string {
  const { updated_at: _updated, ...content } = row;
  void _updated;
  return JSON.stringify(content);
}

/** Calcula cambios incrementales; el cursor solo se confirma tras un envío completo. */
export function planRemoteSync(payload: { incidents: RemoteIncidentRow[]; audit: RemoteAuditRow[] }, checkpoint: SyncCheckpoint): SyncPlan {
  const signatures: Record<string, string> = {};
  const incidents = payload.incidents.filter(row => {
    const signature = incidentSignature(row);
    signatures[row.id] = signature;
    return checkpoint.incidents[row.id] !== signature;
  });
  const existingAudit = new Set(checkpoint.audits);
  const audit = payload.audit.filter(row => !existingAudit.has(row.id));
  // El centro local conserva una ventana finita de incidentes y auditorías.
  // Mantener firmas de registros ya expulsados haría crecer el cursor para siempre.
  // Una fila que reaparezca se enviará otra vez mediante upsert idempotente.
  const currentAuditIds = [...new Set(payload.audit.map(row => row.id))];
  return {
    incidents, audit,
    checkpoint: { version: 1, incidents: signatures, audits: currentAuditIds },
    pendingCount: incidents.length + audit.length,
  };
}
