import type { SupabaseClient } from '@supabase/supabase-js';
import type { IncidentCenterState } from '../../application/incidents/IncidentCenter';
import { buildRemotePayload, type RemoteIncidentRow, type RemoteAuditRow } from '../../application/remote/remotePayload';

/** Sólo usa JWT del usuario y RLS. Los errores no descartan el historial local. */
export async function syncIncidentsToSupabase(
  client: SupabaseClient,
  state: Pick<IncidentCenterState, 'incidents' | 'audit'>,
  userId: string,
  installationId: string,
): Promise<number> {
  const payload = buildRemotePayload(state, userId, installationId, new Date().toISOString());
  return upsertRemoteChanges(client, payload.incidents, payload.audit);
}

/** Upsert incremental autenticado por RLS. Reintentar un lote no duplica auditorías. */
export async function upsertRemoteChanges(client: SupabaseClient, incidents: RemoteIncidentRow[], audit: RemoteAuditRow[]): Promise<number> {
  // Upsert idempotente por ID compuesto: evita colisiones entre instalaciones.
  for (let index = 0; index < incidents.length; index += 50) {
    const batch = incidents.slice(index, index + 50);
    const { error } = await client.from('vision_incidents').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`No se sincronizaron los incidentes: ${error.message}`);
  }
  // La auditoría es append-only: en reintentos no modifica eventos existentes.
  for (let index = 0; index < audit.length; index += 50) {
    const batch = audit.slice(index, index + 50);
    const { error } = await client.from('vision_incident_audit').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`No se sincronizó la auditoría: ${error.message}`);
  }
  return incidents.length;
}
