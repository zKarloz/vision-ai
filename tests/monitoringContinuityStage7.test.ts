import { describe, expect, it } from 'vitest';
import { IncidentCenter, type IncidentStorage } from '../src/application/incidents/IncidentCenter';
import { openIncident, transitionIncident, type Incident } from '../src/core/domain/incident';
import { buildRemotePayload } from '../src/application/remote/remotePayload';
import { ReportCenter } from '../src/application/reports/ReportCenter';

const first = '2026-11-16T23:00:00.000Z';
const stop = '2026-11-16T23:00:05.000Z';
const resumed = '2026-11-16T23:00:20.000Z';
const left = '2026-11-16T23:00:28.000Z';
const old = (id = 'CAM-02', trackId = '1', at = first): Incident => openIncident({
  id: 'COORD-1', cameraId: id, zoneId: `Z-${id}`, ruleId: `R-${id}`, trackId, source: 'yolo',
  severity: 'high', confidence: 0.91, openedAt: at,
});
function memory() {
  const values = new Map<string, string>();
  const storage: IncidentStorage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); } };
  return { values, storage };
}
const user = '11111111-1111-4111-8111-111111111111';
const device = '22222222-2222-4222-8222-222222222222';

describe('Etapa 7 · continuidad segura ante pausa y reanudación', () => {
  it('marcar interrupción mantiene estado y crea auditoría única', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]);
    center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true, observationInterruptedAt: stop });
    expect(center.getSnapshot().audit.map(e => e.action)).toEqual(['tracking-lost', 'opened']);
    expect(center.getSnapshot().audit[0].note).toContain('YOLO detenido');
  });
  it('filtra sólo la cámara interrumpida y nunca altera incidentes cerrados', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old('CAM-01'), old('CAM-02')]);
    center.markMonitoringInterrupted(['CAM-02'], 'cámara excluida', stop);
    expect(center.getSnapshot().incidents.find(i => i.cameraId === 'CAM-01')?.requiresReview).toBe(false);
    expect(center.getSnapshot().incidents.find(i => i.cameraId === 'CAM-02')?.requiresReview).toBe(true);
    center.ingest([transitionIncident(old('CAM-01'), { action: 'close', at: stop })]);
    center.markMonitoringInterrupted(undefined, 'toda sesión cerrada', resumed);
    expect(center.getSnapshot().incidents.find(i => i.cameraId === 'CAM-01')?.status).toBe('closed');
  });
  it('zona vacía después de parar: nunca cierra ni genera reporte', () => {
    const h = memory(); const center = new IncidentCenter(h.storage); const reports = new ReportCenter(h.storage);
    center.ingest([old()]);
    center.markMonitoringInterrupted(['CAM-02'], 'Pestaña oculta', stop);
    center.ingest([]); reports.syncClosedIncidents(center.getSnapshot());
    expect(center.getSnapshot().incidents[0].status).toBe('open');
    expect(reports.getSnapshot().reports).toHaveLength(0);
  });
  it('nueva trayectoria después de reanudar no duplica el incidente inicial', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    const newTrack = old('CAM-02','1',resumed); // IDs reiniciados, apertura distinta
    center.ingest([newTrack]); center.ingest([newTrack]);
    const entries = center.getSnapshot().incidents;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'open', recoverySourceKey: expect.stringContaining(resumed), requiresReview: true });
    expect(center.getSnapshot().audit.filter(e => e.action === 'opened')).toHaveLength(1);
  });
  it('salida del nuevo track no cierra falsamente el evento antes de la pausa', () => {
    const h = memory(); const center = new IncidentCenter(h.storage); const reports = new ReportCenter(h.storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    const newTrack = old('CAM-02','1',resumed);
    center.ingest([newTrack]);
    center.ingest([transitionIncident(newTrack, { action: 'close', at: left })]);
    center.ingest([transitionIncident(newTrack, { action: 'close', at: left })]);
    reports.syncClosedIncidents(center.getSnapshot());
    expect(center.getSnapshot().incidents).toHaveLength(1);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true, recoveryExitObservedAt: left });
    expect(center.getSnapshot().audit.filter(e => e.action === 'closed')).toHaveLength(0);
    expect(center.getSnapshot().audit.filter(e => e.note?.includes('Salida tras interrupción'))).toHaveLength(1);
    expect(reports.getSnapshot().reports).toHaveLength(0);
  });
  it('el cierre manual tras interrupción conserva actor, nota y naturaleza humana', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'Webcam desconectada', stop);
    const id = center.getSnapshot().incidents[0].id;
    expect(() => center.closeReviewed(id, 'Supervisor', 'Revisión humana', left)).toThrow(/Reconoce/);
    center.acknowledge(id, 'Supervisor', resumed);
    center.closeReviewed(id, 'Supervisor', 'Se verificó presencialmente que la zona está libre', left);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'closed', closureType: 'human-review' });
    expect(center.getSnapshot().audit[0].actor).toBe('Supervisor');
    expect(center.getSnapshot().audit[0].action).toBe('closed-by-supervisor');
  });
  it('sin pausa, una salida YOLO continua sí cierra normalmente', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.ingest([transitionIncident(old(), { action:'close', at: left })]);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'closed', closureType: 'yolo-confirmed' });
  });
  it('varios incidentes interrumpidos en la misma zona nunca se fusionan por conjetura', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old(), old('CAM-02','2','2026-11-16T23:00:02.000Z')]);
    center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    center.ingest([old('CAM-02','3',resumed)]);
    expect(center.getSnapshot().incidents).toHaveLength(3);
    expect(center.getSnapshot().incidents.filter(i => i.observationInterruptedAt)).toHaveLength(2);
  });
  it('una segunda trayectoria independiente no se fusiona después de la primera recuperación', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', stop);
    center.ingest([old('CAM-02','2',resumed), old('CAM-02','3','2026-11-16T23:00:22.000Z')]);
    expect(center.getSnapshot().incidents).toHaveLength(2);
  });
  it('restitución tras recarga mantiene pausa, auditoría y protección contra cierre', () => {
    const h = memory(); const center = new IncidentCenter(h.storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'Cambio de vista', stop);
    const restored = new IncidentCenter(h.storage);
    restored.ingest([transitionIncident(old(), { action: 'close', at: left })]);
    expect(restored.getSnapshot().incidents).toHaveLength(1);
    expect(restored.getSnapshot().incidents[0].status).toBe('open');
    expect(restored.getSnapshot().audit).toHaveLength(3);
  });
  it('payload Supabase conserva requires_review y audita interrupción sin cambiar SQL', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'Pestaña oculta', stop);
    const data = buildRemotePayload(center.getSnapshot(), user, device, resumed);
    expect(data.incidents[0].requires_review).toBe(true);
    expect(data.audit.map(a => a.action)).toEqual(['tracking-lost', 'opened']);
    expect(data.audit[0].note).toContain('Pestaña oculta');
  });
  it('al escalar no desaparece la condición de interrupción', () => {
    const center = new IncidentCenter(memory().storage);
    center.ingest([old()]); center.markMonitoringInterrupted(['CAM-02'], 'Pestaña oculta', stop);
    center.escalateOverdue('2026-11-16T23:01:02.000Z');
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'escalated', requiresReview: true, observationInterruptedAt: stop });
  });
});

// Ejemplo de reinicio del coordinador entre sesiones. Comprueba que los IDs
// efímeros repetidos no se convierten en una nueva intrusión persistida.
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { VisualZoneMonitor } from '../src/domain/visualTracking';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import type { Detection } from '../src/core/types/vision';

describe('Etapa 7 · integración del reinicio del seguimiento', () => {
  it('confirma entrada, pausa, sigue viendo persona, observa salida y conserva revisión obligatoria', () => {
    const center = new IncidentCenter(memory().storage);
    const polygon = [{ x: .3, y: .3 }, { x: .8, y: .3 }, { x: .8, y: .9 }, { x: .3, y: .9 }];
    const zone = { ...STARTER_RESTRICTED_ZONE, polygon };
    const imgZone = { id: zone.id, cameraId: zone.cameraId, polygon };
    const detect = (x: number): Detection => ({ classId: 0, label: 'persona', confidence: .91,
      box: { x, y: .45, width: .12, height: .35 } });
    let tracker = new VisualZoneMonitor();
    let coordinator = new VisualIncidentCoordinator();
    let elapsed = 0;
    const tick = (x: number) => {
      elapsed += 300;
      const observed = tracker.step('CAM-02', [detect(x)], imgZone, elapsed);
      coordinator.ingest(observed.events, zone, STARTER_PERSON_RULE, new Date(Date.parse(first) + elapsed).toISOString());
      center.ingest(coordinator.snapshot().incidents);
    };
    tick(.35); tick(.35); tick(.35);
    expect(center.getSnapshot().incidents).toHaveLength(1);
    center.markMonitoringInterrupted(['CAM-02'], 'YOLO detenido', new Date(Date.parse(first) + 1200).toISOString());
    // Los hooks reinician el seguimiento y coordinador cuando se pierde continuidad.
    tracker = new VisualZoneMonitor(); coordinator = new VisualIncidentCoordinator();
    tick(.35); tick(.35); tick(.35);
    expect(center.getSnapshot().incidents).toHaveLength(1);
    tick(.17); tick(.17);
    expect(center.getSnapshot().incidents).toHaveLength(1);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true });
    expect(center.getSnapshot().audit.some(a => a.action === 'closed')).toBe(false);
  });
});


describe('Etapa 7 · aislamiento multicámara durante selección', () => {
  it('olvidar la cámara excluida no elimina los tracks de la otra perspectiva', () => {
    const coordinator = new VisualIncidentCoordinator();
    const cam1 = { ...STARTER_RESTRICTED_ZONE, id: 'Z-CAM-01', cameraId: 'CAM-01' };
    const cam2 = { ...STARTER_RESTRICTED_ZONE };
    const rule1 = { ...STARTER_PERSON_RULE, zoneId: cam1.id };
    const rule2 = { ...STARTER_PERSON_RULE, zoneId: cam2.id };
    const e1 = { id: 1, trackId: 1, cameraId: 'CAM-01', type: 'opened' as const, atMs: 1000, confidence: .91, source: 'yolo' as const };
    const e2 = { ...e1, cameraId: 'CAM-02' };
    coordinator.ingest([e1], cam1, rule1, first);
    coordinator.ingest([e2], cam2, rule2, first);
    coordinator.forgetCamera('CAM-01');
    expect(coordinator.snapshot().incidents.map(i => i.cameraId)).toEqual(['CAM-02']);
    // La cámara olvidada no conserva su trackId previo y puede abrir otra sesión.
    coordinator.ingest([e1], cam1, rule1, resumed);
    expect(coordinator.snapshot().incidents).toHaveLength(2);
  });
});
