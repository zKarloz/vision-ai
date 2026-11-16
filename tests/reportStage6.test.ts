import { describe, expect, it } from 'vitest';
import { buildDailyReport, buildIncidentReport, calculateReportStats, limaDayKey, limaDayPeriod, previousLimaDay } from '../src/core/domain/report';
import { ReportCenter, REPORT_STORAGE_KEY } from '../src/application/reports/ReportCenter';
import { reportCsv, reportPdf } from '../src/infrastructure/reports/reportDownloads';
import type { CenterIncident, IncidentAuditEvent } from '../src/application/incidents/IncidentCenter';

const closed: CenterIncident = {
  id: 'INC-000001', sourceKey: 's', cameraId: 'CAM-01', zoneId: 'Z01', ruleId: 'R01', trackId: '1',
  source: 'yolo', severity: 'high', status: 'closed', confidence: 0.84,
  openedAt: '2026-11-15T06:00:00.000Z', acknowledgedAt: '2026-11-15T06:00:05.000Z', acknowledgedBy: 'Supervisor',
  closedAt: '2026-11-15T06:00:15.000Z', durationSec: 15, requiresReview: false, closureType: 'yolo-confirmed',
};
const audit: IncidentAuditEvent[] = [{ id: 'AUD-1', incidentId: closed.id, cameraId: closed.cameraId,
  action: 'closed', at: closed.closedAt!, actor: 'YOLO' }];
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
}

describe('Etapa 6: reportes automáticos DEMO estructurados', () => {
  it('usa el huso horario de Lima y días semiabiertos', () => {
    expect(limaDayKey(new Date('2026-11-15T04:59:59Z'))).toBe('2026-11-14');
    expect(limaDayKey(new Date('2026-11-15T05:00:00Z'))).toBe('2026-11-15');
    expect(previousLimaDay(new Date('2026-11-16T06:00:00Z'))).toBe('2026-11-15');
    expect(limaDayPeriod('2026-11-15')).toEqual({ dayLima: '2026-11-15', start: '2026-11-15T05:00:00.000Z', end: '2026-11-16T05:00:00.000Z' });
    expect(() => limaDayPeriod('2026-02-31')).toThrow();
  });
  it('resume indicadores verificables y no considera falta de ack como cero segundos', () => {
    expect(calculateReportStats([closed])).toMatchObject({ total: 1, high: 1, critical: 0,
      closed: 1, acknowledged: 1, averageResponseSec: 5, averageDurationSec: 15 });
    expect(calculateReportStats([]).averageResponseSec).toBeNull();
  });
  it('genera un reporte de incidente cerrado con cronología pertinente', () => {
    const report = buildIncidentReport(closed, audit, '2026-11-16T10:00:00Z');
    expect(report.key).toBe(`incident:${closed.id}`);
    expect(report.stats.total).toBe(1);
    expect(report.audit).toHaveLength(1);
    expect(report.origin).toBe('local-demo');
  });
  it('rechaza incidentes abiertos y registros DEMO como fuentes de reporte individual', () => {
    expect(() => buildIncidentReport({ ...closed, status: 'open' }, audit, closed.closedAt!)).toThrow();
    expect(() => buildIncidentReport({ ...closed, source: 'demo' }, audit, closed.closedAt!)).toThrow();
  });
  it('selecciona las aperturas del día en Lima, aunque el cierre sea posterior', () => {
    const before = { ...closed, id: 'OLD', openedAt: '2026-11-15T04:59:59Z' };
    const report = buildDailyReport('2026-11-15', [before, closed], audit, '2026-11-16T06:00:00Z');
    expect(report.incidents.map(item => item.id)).toEqual([closed.id]);
    expect(report.audit).toHaveLength(1);
    expect(report.stats.total).toBe(1);
  });
  it('es idempotente al recibir el mismo cierre varias veces, conserva auditorio y restaura', () => {
    const store = storage(); const center = new ReportCenter(store);
    const source = { incidents: [closed], audit };
    expect(center.syncClosedIncidents(source)).toBe(1);
    expect(center.syncClosedIncidents(source)).toBe(0);
    expect(center.getSnapshot().reports).toHaveLength(1);
    center.recordExport(`incident:${closed.id}`, 'PDF');
    expect(center.getSnapshot().audit).toHaveLength(2);
    expect(new ReportCenter(store).getSnapshot().reports).toHaveLength(1);
    expect(store.data.has(REPORT_STORAGE_KEY)).toBe(true);
  });
  it('genera un diario sólo una vez y lo conserva aunque lleguen nuevas detecciones', () => {
    const center = new ReportCenter(storage());
    expect(center.generateDay('2026-11-15', [closed], audit)).toBe(true);
    expect(center.generateDay('2026-11-15', [closed], audit)).toBe(false);
    expect(center.getSnapshot().reports).toHaveLength(1);
    expect(center.getSnapshot().reports[0].stats.total).toBe(1);
  });
  it('prepara el día anterior automáticamente solo si hubo detecciones YOLO', () => {
    const center = new ReportCenter(storage());
    expect(center.generatePreviousDayIfNeeded({ incidents: [], audit }, new Date('2026-11-16T06:00:00Z'))).toBe(false);
    expect(center.generatePreviousDayIfNeeded({ incidents: [closed], audit }, new Date('2026-11-16T06:00:00Z'))).toBe(true);
    expect(center.generatePreviousDayIfNeeded({ incidents: [closed], audit }, new Date('2026-11-16T06:00:00Z'))).toBe(false);
  });
  it('descarga CSV con cabecera, BOM y evita fórmulas maliciosas', () => {
    const report = buildIncidentReport({ ...closed, zoneId: '=2+3' }, audit, closed.closedAt!);
    const csv = reportCsv(report);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=2+3"');
    expect(csv).toContain('"INC-000001"');
  });
  it('construye PDF con cabecera válida, xref y sin contenido binario externo', () => {
    const report = buildIncidentReport(closed, audit, closed.closedAt!);
    const file = reportPdf(report);
    const text = new TextDecoder('latin1').decode(file);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Page');
    expect(text).toContain('startxref');
    expect(text).toContain('VISION AI');
  });
  it('el centro sin almacenamiento no afirma persistencia', () => {
    const center = new ReportCenter(null);
    center.syncClosedIncidents({ incidents: [closed], audit });
    expect(center.getSnapshot().storageOk).toBe(false);
  });
});
