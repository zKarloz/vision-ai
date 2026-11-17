import { describe, expect, it } from 'vitest';
import { emptyCheckpoint, parseCheckpoint, planRemoteSync } from '../src/application/remote/syncCheckpoint';
import type { RemoteIncidentRow, RemoteAuditRow } from '../src/application/remote/remotePayload';

// Filas ilustrativas del contrato remoto; no se fabrican detecciones dentro del producto.
const incident: RemoteIncidentRow = {
  id: 'user:install:INC-000004', owner_id: 'user', installation_id: 'install', local_id: 'INC-000004',
  camera_id: 'CAM-02', track_id: 'T-1', zone_id: 'Z-VIS-CAM-02', rule_id: 'R1', source: 'yolo',
  severity: 'high', status: 'closed', confidence: 0.91, opened_at: '2026-11-16T23:43:36.334Z',
  acknowledged_at: '2026-11-16T23:43:43Z', acknowledged_by: 'Carlos',
  closed_at: '2026-11-16T23:43:43.517Z', closure_type: 'yolo-confirmed', requires_review: false,
  duration_sec: 7, updated_at: '2026-11-16T23:44:00Z',
};
const action: RemoteAuditRow = {
  id: 'user:install:AUD-000001', incident_id: incident.id, owner_id: 'user',
  action: 'opened', actor: 'YOLO', at: incident.opened_at, note: null,
};

describe('Etapa 7 · cursor de sincronización incremental', () => {
  it('un primer envío detecta incidentes y auditoría pendiente', () => {
    const plan = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    expect(plan.pendingCount).toBe(2);
    expect(plan.incidents).toHaveLength(1);
    expect(plan.audit).toHaveLength(1);
  });
  it('tras éxito no reenvía datos ni por un cambio de updated_at', () => {
    const first = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    const later = { ...incident, updated_at: '2026-11-17T00:00:00Z' };
    const second = planRemoteSync({ incidents: [later], audit: [action] }, first.checkpoint);
    expect(second.pendingCount).toBe(0);
  });
  it('un reconocimiento posterior solo actualiza el incidente y su nuevo evento', () => {
    const first = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    const updated = { ...incident, acknowledged_by: 'Supervisor' };
    const another = { ...action, id: 'user:install:AUD-000002', action: 'acknowledged' as const, actor: 'Supervisor' };
    const next = planRemoteSync({ incidents: [updated], audit: [action, another] }, first.checkpoint);
    expect(next.incidents).toHaveLength(1);
    expect(next.audit.map(event => event.id)).toEqual([another.id]);
  });
  it('los datos viejos no se consideran confirmados si no se guarda checkpoint', () => {
    const a = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    const b = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    expect(a.pendingCount).toBe(b.pendingCount);
  });
  it('cursor inválido no bloquea un reintento', () => {
    expect(parseCheckpoint('{malformed')).toEqual(emptyCheckpoint());
    expect(parseCheckpoint('{"version":1,"incidents":{},"audits":[1]}')).toEqual(emptyCheckpoint());
  });
  it('cursor serializado se puede recuperar tras recarga', () => {
    const plan = planRemoteSync({ incidents: [incident], audit: [action] }, emptyCheckpoint());
    expect(parseCheckpoint(JSON.stringify(plan.checkpoint))).toEqual(plan.checkpoint);
  });
});
