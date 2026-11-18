import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IncidentCenter } from '../src/application/incidents/IncidentCenter';
import { remoteIncidentId } from '../src/application/remote/remotePayload';
import { sharedIncidentFromRow, sharedReportFromRow, type SharedIncidentRow, type SharedReportRow } from '../src/application/remote/sharedHistory';
import { applySharedDecision } from '../src/application/remote/sharedDecision';

const userA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const installA = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const installB = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const openedAt = '2026-11-18T05:30:00.000Z';
const remote = (overrides: Partial<SharedIncidentRow> = {}): SharedIncidentRow => ({
  id: remoteIncidentId(userA, installA, 'INC-000001'), owner_id: userA,
  installation_id: installA, local_id: 'INC-000001', camera_id: 'CAM-02', track_id: 'trk-2',
  zone_id: 'zona-2', rule_id: 'r-2', source: 'yolo', severity: 'high', status: 'open',
  confidence: 0.82, opened_at: openedAt, acknowledged_at: null, acknowledged_by: null,
  closed_at: null, closure_type: null, requires_review: false, duration_sec: null,
  updated_at: openedAt, ...overrides,
});
const localIncident = () => ({ ...sharedIncidentFromRow(remote()), id: 'INC-000001' });
const source = (filename: string) => readFileSync(resolve(process.cwd(), filename), 'utf8');

describe('Historial común de Supabase · VISION AI v1.9.6', () => {
  it('no confunde IDs locales iguales provenientes de dos cuentas', () => {
    expect(remoteIncidentId(userA, installA, 'INC-000001')).not.toBe(remoteIncidentId(userB, installB, 'INC-000001'));
    expect(remoteIncidentId(userA, installA, 'INC-000001')).not.toBe(remoteIncidentId(userA, installB, 'INC-000001'));
  });
  it('reconoce incidentes remotos sin modificar la identidad del origen', () => {
    const item = sharedIncidentFromRow(remote({ status: 'acknowledged', acknowledged_at: '2026-11-18T05:31:00.000Z',
      acknowledged_by: 'supervisor@example.test' }));
    expect(item.id).toContain(userA);
    expect(item.status).toBe('acknowledged');
    expect(item.acknowledgedBy).toBe('supervisor@example.test');
    expect(item.source).toBe('yolo');
  });
  it('refleja reconocimientos de otras cuentas en el navegador de origen', () => {
    const local = localIncident();
    const updated = applySharedDecision(local, remote({ status: 'acknowledged',
      acknowledged_at: '2026-11-18T05:31:00.000Z', acknowledged_by: 'supervisor@example.test' }));
    expect(updated.status).toBe('acknowledged');
    expect(updated.acknowledgedBy).toBe('supervisor@example.test');
    expect(applySharedDecision(updated, remote({ status: 'acknowledged', acknowledged_at: updated.acknowledgedAt!,
      acknowledged_by: updated.acknowledgedBy! }))).toBe(updated);
  });
  it('conserva un cierre humano aunque la observación visual original se interrumpiera', () => {
    const local = { ...localIncident(), requiresReview: true };
    const closed = applySharedDecision(local, remote({ status: 'closed',
      acknowledged_at: '2026-11-18T05:31:00.000Z', acknowledged_by: 'admin@test.invalid',
      closed_at: '2026-11-18T05:40:00.000Z', closure_type: 'human-review', duration_sec: 600 }));
    expect(closed.status).toBe('closed');
    expect(closed.requiresReview).toBe(false);
    expect(closed.closureType).toBe('human-review');
    expect(applySharedDecision(closed, remote())).toBe(closed);
  });
  it('no incorpora auditoría remota al outbox local en una reconciliación', () => {
    const saved: Record<string,string> = {};
    const center = new IncidentCenter({ getItem: k => saved[k] ?? null, setItem: (k,v) => { saved[k] = v; } });
    // Si no existe el incidente en este sensor, no importa nada de otra instalación.
    center.reconcileSharedDecisions([remote({ owner_id: userB })]);
    expect(center.getSnapshot().incidents).toHaveLength(0);
    expect(center.getSnapshot().audit).toHaveLength(0);
  });
  it('convierte el snapshot archivado por Cron al formato de PDF/CSV/JSON', () => {
    const report: SharedReportRow = {
      key: 'daily:2026-11-18', type: 'daily', generated_at: '2026-11-19T05:05:00Z',
      period_start: '2026-11-18T05:00:00Z', period_end: '2026-11-19T05:00:00Z',
      content: { day: '2026-11-18', total: 1, incidents: [remote({ status: 'closed',
        closed_at: '2026-11-18T06:00:00Z', duration_sec: 1800 })] },
    };
    const generated = sharedReportFromRow(report, []);
    expect(generated.origin).toBe('server');
    expect(generated.stats.total).toBe(1);
    expect(generated.stats.closed).toBe(1);
    expect(generated.period.dayLima).toBe('2026-11-18');
  });
  it('conserva informes por incidente con ID remoto global', () => {
    const i = remote({ status: 'closed', closed_at: '2026-11-18T06:00:00Z' });
    const generated = sharedReportFromRow({ key: `incident:${i.id}`, type: 'incident',
      generated_at: i.closed_at!, period_start: openedAt, period_end: i.closed_at!,
      content: { incident: i } }, []);
    expect(generated.incidents[0].id).toBe(i.id);
    expect(generated.stats.total).toBe(1);
  });
  it('requiere función SQL con control de rol, bloqueo transaccional y auditoría', () => {
    const sql = source('supabase/migrations/20261118_shared_history_multiuser.sql');
    expect(sql).toContain('where id=p_incident_id for update');
    expect(sql).toContain("v_role is distinct from 'supervisor'");
    expect(sql).toContain('vision_incident_audit');
    expect(sql).toContain('vision_ai_00_preserve_shared_decisions');
    expect(sql).toContain('vision_report_audit_member_read');
    expect(sql).toContain("m.role in ('administrador','auditor')");
    expect(sql).toContain('on conflict (key) do nothing');
    expect(sql).toContain('grant execute on function public.vision_act_on_incident');
    expect(sql).not.toContain('grant execute on function public.vision_act_on_incident(text,text,text) to anon');
  });
  it('lee la historia común para los cuatro roles y mantiene la captura local aislada', () => {
    const provider = source('src/app/providers/SharedHistoryProvider.tsx');
    expect(provider).toContain("fetchAll<SharedIncidentRow>('vision_incidents'");
    expect(provider).toContain("fetchAll<SharedReportRow>('vision_reports'");
    expect(provider).toContain('center.reconcileSharedDecisions');
    expect(source('src/app/providers/AccountStorageProvider.tsx')).toContain('createAccountScopedStorage');
    expect(source('src/modules/incidents/IncidentsPage.tsx')).toContain('shared.actOnIncident');
  });
});
