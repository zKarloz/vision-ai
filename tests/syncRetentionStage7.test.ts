import { describe, expect, it } from 'vitest';
import { emptyCheckpoint, parseCheckpoint, planRemoteSync } from '../src/application/remote/syncCheckpoint';
import type { RemoteAuditRow, RemoteIncidentRow } from '../src/application/remote/remotePayload';

// Filas sintéticas: prueban la cola incremental, no la precisión del detector YOLO.
const incident = (id: string): RemoteIncidentRow => ({
  id, owner_id: 'user', installation_id: 'install', local_id: id,
  camera_id: 'CAM-02', track_id: 'T1', zone_id: 'Z1', rule_id: 'R1',
  source: 'yolo', severity: 'high', status: 'closed', confidence: 0.9,
  opened_at: '2026-11-16T23:00:00Z', acknowledged_at: null,
  acknowledged_by: null, closed_at: '2026-11-16T23:00:06Z',
  closure_type: 'yolo-confirmed', requires_review: false, duration_sec: 6,
  updated_at: '2026-11-16T23:00:10Z',
});
const audit = (id: string, incidentId: string): RemoteAuditRow => ({
  id, incident_id: incidentId, owner_id: 'user', action: 'opened',
  actor: 'YOLO', at: '2026-11-16T23:00:00Z', note: null,
});

describe('Etapa 7 · retención acotada del cursor de sincronización', () => {
  it('descarta incidentes antiguos ya expulsados del centro local', () => {
    const a = planRemoteSync({ incidents: [incident('A')], audit: [] }, emptyCheckpoint());
    const b = planRemoteSync({ incidents: [incident('B')], audit: [] }, a.checkpoint);
    expect(Object.keys(b.checkpoint.incidents)).toEqual(['B']);
    expect(b.pendingCount).toBe(1);
  });
  it('descarta identificadores de auditoría anteriores que ya no están en la ventana', () => {
    const first = planRemoteSync({ incidents: [incident('A')], audit: [audit('A1', 'A')] }, emptyCheckpoint());
    const second = planRemoteSync({ incidents: [incident('B')], audit: [audit('B1', 'B')] }, first.checkpoint);
    expect(second.checkpoint.audits).toEqual(['B1']);
  });
  it('un incidente que reaparece se envía idempotentemente otra vez', () => {
    const first = planRemoteSync({ incidents: [incident('A')], audit: [] }, emptyCheckpoint());
    const second = planRemoteSync({ incidents: [incident('B')], audit: [] }, first.checkpoint);
    const third = planRemoteSync({ incidents: [incident('A')], audit: [] }, second.checkpoint);
    expect(third.incidents.map(row => row.id)).toEqual(['A']);
  });
  it('no altera el checkpoint original que quedó confirmado', () => {
    const first = planRemoteSync({ incidents: [incident('A')], audit: [audit('A1', 'A')] }, emptyCheckpoint());
    planRemoteSync({ incidents: [], audit: [] }, first.checkpoint);
    expect(Object.keys(first.checkpoint.incidents)).toEqual(['A']);
    expect(first.checkpoint.audits).toEqual(['A1']);
  });
  it('con cientos de lotes la memoria de metadatos queda acotada a la ventana actual', () => {
    let cursor = emptyCheckpoint();
    for (let i = 0; i < 400; i++) {
      const ids = [incident(`I${i}`), incident(`I${i+1}`)];
      const next = planRemoteSync({ incidents: ids, audit: [audit(`A${i}`, ids[0].id)] }, cursor);
      cursor = next.checkpoint;
      expect(Object.keys(cursor.incidents)).toHaveLength(2);
      expect(cursor.audits).toHaveLength(1);
    }
  });
  it('recarga y reintento conservan la idempotencia de la ventana actual', () => {
    const payload = { incidents: [incident('A')], audit: [audit('A1','A')] };
    const saved = planRemoteSync(payload, emptyCheckpoint()).checkpoint;
    expect(planRemoteSync(payload, parseCheckpoint(JSON.stringify(saved))).pendingCount).toBe(0);
  });
});
