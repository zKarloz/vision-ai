import { describe, expect, it } from 'vitest';
import { countDailySeverities, htmlReport, type DailySnapshot, type SummaryIncident } from '../supabase/functions/_shared/dailySummary';

// Fixture sin identidades de usuarios, fotografías, tokens ni correos reales.
const incident: SummaryIncident = {
  id: 'INC-A', camera_id: 'CAM-01', track_id: 'track-1', zone_id: 'ZONA-01',
  rule_id: 'R-01', severity: 'critical', status: 'closed', confidence: 0.95,
  opened_at: '2026-11-18T06:00:00.000Z', acknowledged_at: null,
  closed_at: '2026-11-18T06:01:00.000Z', duration_sec: 60,
};
const snapshot: DailySnapshot = {
  day: '2026-11-18', timezone: 'America/Lima', start: '2026-11-18T05:00:00Z',
  end: '2026-11-19T05:00:00Z', total: 2,
  incidents: [incident, { ...incident, id: 'INC-B', severity: 'high' }],
};

describe('Bloques B/C · compatibilidad de correo diario con snapshots compartidos', () => {
  it('calcula severidad aun si el resumen archivado por RPC no trae critical/high', () => {
    // La RPC administrativa solo persiste day/timezone/start/end/total/incidents.
    expect(countDailySeverities(snapshot.incidents)).toEqual({ critical: 1, high: 1 });
    expect(htmlReport(snapshot)).toContain('Críticos: 1 · Altos: 1');
    expect(htmlReport(snapshot)).not.toContain('undefined');
  });

  it('no depende de agregados preexistentes desactualizados', () => {
    expect(htmlReport({ ...snapshot, critical: 0, high: 0 })).toContain('Críticos: 1 · Altos: 1');
  });

  it('mantiene contenido válido para un día sin incidentes', () => {
    expect(htmlReport({ ...snapshot, total: 0, incidents: [] })).toContain('Críticos: 0 · Altos: 0');
  });

  it('escapa los textos procedentes del servidor antes de componer HTML', () => {
    const unsafe = htmlReport({ ...snapshot, incidents: [{ ...incident, zone_id: '<script>alert(1)</script>' }] });
    expect(unsafe).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(unsafe).not.toContain('<script>');
  });
});
