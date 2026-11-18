import type { CenterIncident } from '../incidents/IncidentCenter';
import type { SharedIncidentRow } from './sharedHistory';

/** Sincroniza decisiones humanas del servidor al sensor local sin inventar auditorías. */
export function applySharedDecision(local: CenterIncident, remote: SharedIncidentRow): CenterIncident {
  // Un cierre confirmado localmente jamás vuelve a abrirse por un snapshot remoto atrasado.
  if (local.status === 'closed' && remote.status !== 'closed') return local;
  if (remote.status === 'closed' && remote.closed_at && local.status !== 'closed') {
    return { ...local, status: 'closed', closedAt: remote.closed_at, requiresReview: false,
      ...(remote.acknowledged_at ? { acknowledgedAt: remote.acknowledged_at } : {}),
      ...(remote.acknowledged_by ? { acknowledgedBy: remote.acknowledged_by } : {}),
      ...(remote.closure_type === 'human-review' || remote.closure_type === 'yolo-confirmed'
        ? { closureType: remote.closure_type } : {}),
      durationSec: remote.duration_sec === null
        ? Math.max(0, (Date.parse(remote.closed_at) - Date.parse(local.openedAt)) / 1000)
        : Number(remote.duration_sec),
    };
  }
  if (remote.status === 'acknowledged' && remote.acknowledged_at &&
    (local.status === 'open' || local.status === 'escalated')) {
    return { ...local, status: 'acknowledged', acknowledgedAt: remote.acknowledged_at,
      acknowledgedBy: remote.acknowledged_by || 'Supervisor' };
  }
  return local;
}
