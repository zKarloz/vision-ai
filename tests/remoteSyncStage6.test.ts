import { describe, expect, it } from 'vitest';
import { buildRemotePayload, canSync, remoteIncidentId } from '../src/application/remote/remotePayload';
import type { CenterIncident, IncidentAuditEvent } from '../src/application/incidents/IncidentCenter';

const user = '11111111-1111-4111-8111-111111111111';
const device = '22222222-2222-4222-8222-222222222222';
const incident: CenterIncident = {
  id: 'INC-000001', cameraId: 'CAM-02', zoneId: 'Z-01', ruleId: 'R-01', trackId: 'track-1',
  source: 'yolo', status: 'closed', severity: 'high', confidence: 0.91, openedAt: '2026-11-15T04:00:00Z',
  closedAt: '2026-11-15T04:00:10Z', durationSec: 10, requiresReview: false,
  sourceKey: 'CAM-02|Z-01|R-01|track-1|2026-11-15T04:00:00Z', closureType: 'yolo-confirmed',
};
const audit: IncidentAuditEvent = { id: 'AUD-000001', incidentId: incident.id, cameraId: incident.cameraId,
  action: 'closed', actor: 'YOLO', at: incident.closedAt! };

describe('Etapa 6 · sincronización autenticada y aislamiento de IDs', () => {
  it('evita colisión de INC-000001 entre instalaciones', () => {
    expect(remoteIncidentId(user, device, incident.id)).not.toBe(remoteIncidentId(user,
      '33333333-3333-4333-8333-333333333333', incident.id));
  });
  it('exige identificadores completos', () => {
    expect(() => remoteIncidentId('anon', device, incident.id)).toThrow();
  });
  it('excluye incidentes DEMO, conserva YOLO y sus auditorías', () => {
    const payload = buildRemotePayload({ incidents: [incident, { ...incident, id: 'INC-000002', source: 'demo' }],
      audit: [audit, { ...audit, id: 'AUD-000002', incidentId: 'INC-000002' }] }, user, device, '2026-11-15T05:00:00Z');
    expect(payload.incidents).toHaveLength(1);
    expect(payload.audit).toHaveLength(1);
    expect(payload.incidents[0].owner_id).toBe(user);
    expect(payload.audit[0].incident_id).toBe(payload.incidents[0].id);
  });
  it('repetir la sincronización conserva IDs idempotentes', () => {
    const snapshot = { incidents: [incident], audit: [audit] };
    const a = buildRemotePayload(snapshot, user, device, '2026-11-15T05:00:00Z');
    const b = buildRemotePayload(snapshot, user, device, '2026-11-15T05:01:00Z');
    expect(a.incidents[0].id).toBe(b.incidents[0].id);
    expect(a.audit[0].id).toBe(b.audit[0].id);
  });
  it('no sube imágenes, clips ni un informe PDF', () => {
    const data = buildRemotePayload({ incidents: [incident], audit: [audit] }, user, device,
      '2026-11-15T05:00:00Z');
    const text = JSON.stringify(data);
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('frameData');
    expect(text).not.toContain('fileRef');
  });
  it('operador, supervisor y administrador pueden sincronizar; auditor no', () => {
    expect(canSync('operador')).toBe(true);
    expect(canSync('supervisor')).toBe(true);
    expect(canSync('administrador')).toBe(true);
    expect(canSync('auditor')).toBe(false);
    expect(canSync(null)).toBe(false);
  });
});
