import { describe, expect, it } from 'vitest';
import type { Detection } from '../src/core/types/vision';
import { VisualZoneMonitor, type VisionEvent } from '../src/domain/visualTracking';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { IncidentCenter, type IncidentStorage } from '../src/application/incidents/IncidentCenter';
import { ReportCenter } from '../src/application/reports/ReportCenter';
import { shouldSound } from '../src/core/domain/alarmPolicy';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import { buildRemotePayload } from '../src/application/remote/remotePayload';
import { reportCsv, reportPdf } from '../src/infrastructure/reports/reportDownloads';

/**
 * Escenarios sintéticos del CONTRATO del modelo YOLO: no miden la exactitud de ONNX.
 * Prueban el recorrido completo sin navegador, medios externos ni envíos de correo.
 */
const baseMs = Date.parse('2026-11-15T15:00:00.000Z');
const polygon = [
  { x: .30, y: .30 }, { x: .80, y: .30 },
  { x: .80, y: .90 }, { x: .30, y: .90 },
];
const zone = { ...STARTER_RESTRICTED_ZONE, polygon };
const imageZone = { id: zone.id, cameraId: zone.cameraId, polygon };
const detection = (x: number): Detection => ({
  classId: 0, label: 'persona', confidence: .91,
  box: { x, y: .45, width: .12, height: .35 },
});
const memory = () => {
  const values = new Map<string, string>();
  const storage: IncidentStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  return { storage, values };
};

function harness() {
  const store = memory();
  const tracker = new VisualZoneMonitor();
  const coordinator = new VisualIncidentCoordinator();
  const incidents = new IncidentCenter(store.storage);
  const reports = new ReportCenter(store.storage);
  const observe = (detected: readonly Detection[], ms: number) => {
    const state = tracker.step('CAM-02', detected, imageZone, ms);
    const at = new Date(baseMs + ms).toISOString();
    coordinator.ingest(state.events, zone, STARTER_PERSON_RULE, at);
    incidents.ingest(coordinator.snapshot().incidents);
    reports.syncClosedIncidents(incidents.getSnapshot(), at);
    return state.events;
  };
  return { ...store, tracker, coordinator, incidents, reports, observe };
}

function enter(h: ReturnType<typeof harness>) {
  h.observe([detection(.35)], 100);
  h.observe([detection(.35)], 400);
  h.observe([detection(.35)], 700);
}
function exit(h: ReturnType<typeof harness>) {
  h.observe([detection(.17)], 1600);
  h.observe([detection(.17)], 1900);
}

const userId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';

describe('Etapa 7 · aceptación integral con detecciones del contrato YOLO', () => {
  it('recorre detección confirmada → alarma → reconocimiento → cierre YOLO → reporte', () => {
    const h = harness();
    expect(h.observe([detection(.35)], 100)).toHaveLength(0);
    expect(h.observe([detection(.35)], 400)).toHaveLength(0);
    expect(h.observe([detection(.35)], 700).map(event => event.type)).toEqual(['opened']);
    expect(h.incidents.getSnapshot().incidents).toHaveLength(1);
    expect(shouldSound(true, h.incidents.getSnapshot().incidents)).toBe(true);
    const id = h.incidents.getSnapshot().incidents[0].id;
    h.incidents.acknowledge(id, 'Supervisor académico', new Date(baseMs + 900).toISOString());
    expect(shouldSound(true, h.incidents.getSnapshot().incidents)).toBe(false);
    expect(h.incidents.getSnapshot().incidents[0].status).toBe('acknowledged');
    exit(h);
    expect(h.incidents.getSnapshot().incidents[0]).toMatchObject({ status: 'closed', closureType: 'yolo-confirmed' });
    expect(h.reports.getSnapshot().reports).toHaveLength(1);
    expect(h.reports.getSnapshot().reports[0].stats.total).toBe(1);
    expect(h.incidents.getSnapshot().audit.map(event => event.action)).toEqual(['closed', 'acknowledged', 'opened']);
  });

  it('ningún rebote de menos de tres fotogramas abre un incidente', () => {
    const h = harness();
    h.observe([detection(.35)], 100);
    h.observe([detection(.35)], 400);
    h.observe([detection(.17)], 700);
    h.observe([detection(.35)], 1000);
    expect(h.incidents.getSnapshot().incidents).toHaveLength(0);
    expect(shouldSound(true, h.incidents.getSnapshot().incidents)).toBe(false);
  });

  it('una pérdida de tracking no cierra, no crea reportes y exige revisión', () => {
    const h = harness();
    enter(h);
    for (let n = 1; n <= 4; n++) h.observe([], 700 + n * 300);
    expect(h.incidents.getSnapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true });
    expect(h.reports.getSnapshot().reports).toHaveLength(0);
    expect(shouldSound(true, h.incidents.getSnapshot().incidents)).toBe(true);
  });

  it('el cierre manual necesita reconocimiento y una nota y queda distinguido de YOLO', () => {
    const h = harness(); enter(h);
    const id = h.incidents.getSnapshot().incidents[0].id;
    expect(() => h.incidents.closeReviewed(id, 'Supervisor', 'Cierre justificado', new Date(baseMs + 800).toISOString())).toThrow();
    h.incidents.acknowledge(id, 'Supervisor', new Date(baseMs + 900).toISOString());
    expect(() => h.incidents.closeReviewed(id, 'Supervisor', 'corta', new Date(baseMs + 1100).toISOString())).toThrow();
    h.incidents.closeReviewed(id, 'Supervisor', 'Revisión visual de la cámara', new Date(baseMs + 1200).toISOString());
    h.reports.syncClosedIncidents(h.incidents.getSnapshot(), new Date(baseMs + 1300).toISOString());
    expect(h.incidents.getSnapshot().incidents[0].closureType).toBe('human-review');
    expect(h.incidents.getSnapshot().audit[0].action).toBe('closed-by-supervisor');
    expect(h.reports.getSnapshot().reports[0].incidents[0].closureType).toBe('human-review');
  });

  it('fotogramas repetidos y restauración no generan informes duplicados', () => {
    const h = harness(); enter(h); exit(h);
    h.observe([detection(.17)], 2100);
    h.incidents.ingest(h.coordinator.snapshot().incidents);
    h.reports.syncClosedIncidents(h.incidents.getSnapshot());
    expect(h.reports.getSnapshot().reports).toHaveLength(1);
    expect(new ReportCenter(h.storage).getSnapshot().reports).toHaveLength(1);
    expect(new IncidentCenter(h.storage).getSnapshot().incidents).toHaveLength(1);
  });

  it('las auditorías y reportes pueden exportarse sin medios binarios ni secretos', () => {
    const h = harness(); enter(h); exit(h);
    const report = h.reports.getSnapshot().reports[0];
    expect(reportCsv(report)).toContain('INC-000001');
    expect(new TextDecoder('latin1').decode(reportPdf(report))).toContain('%PDF-1.4');
    const payload = buildRemotePayload(h.incidents.getSnapshot(), userId, deviceId, new Date(baseMs + 2100).toISOString());
    expect(payload.incidents).toHaveLength(1);
    expect(payload.audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toMatch(/data:image|webm|mp4|sb_secret_|re_[a-zA-Z0-9]{20}/);
  });

  it('origen distinto de YOLO nunca atraviesa el coordinador', () => {
    const h = harness();
    const forged: VisionEvent = { id: 1, trackId: 1, cameraId: 'CAM-02', type: 'opened', atMs: 700, confidence: .99, source: 'yolo' };
    h.coordinator.ingest([{ ...forged, source: 'demo' } as unknown as VisionEvent], zone, STARTER_PERSON_RULE, new Date(baseMs + 700).toISOString());
    h.incidents.ingest(h.coordinator.snapshot().incidents);
    expect(h.incidents.getSnapshot().incidents).toHaveLength(0);
  });

  it('eventos de cámara no correspondiente y regla desactivada son ignorados', () => {
    const h = harness();
    const event: VisionEvent = { id: 1, trackId: 1, cameraId: 'CAM-01', type: 'opened', atMs: 700, confidence: .99, source: 'yolo' };
    h.coordinator.ingest([event], zone, STARTER_PERSON_RULE, new Date(baseMs + 700).toISOString());
    h.coordinator.ingest([{ ...event, cameraId: 'CAM-02' }], zone, { ...STARTER_PERSON_RULE, enabled: false }, new Date(baseMs + 700).toISOString());
    expect(h.coordinator.snapshot().incidents).toHaveLength(0);
  });
});
