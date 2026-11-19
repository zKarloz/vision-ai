import { describe, expect, it } from 'vitest';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { IncidentCenter } from '../src/application/incidents/IncidentCenter';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import { VisualZoneMonitor } from '../src/domain/visualTracking';
import type { VisionEvent } from '../src/domain/visualTracking';
import type { Detection } from '../src/core/types/vision';

const area = STARTER_RESTRICTED_ZONE;
const rule = STARTER_PERSON_RULE;
const box = { x: 0.45, y: 0.38, width: 0.18, height: 0.45 };
const at = (seconds: number) => new Date(Date.UTC(2026, 10, 19, 3, 0, seconds)).toISOString();
const event = (id: number, trackId: number, type: VisionEvent['type'], time: number,
  position = box, cameraId = area.cameraId): VisionEvent => ({
  id, trackId, type, atMs: time * 1_000, cameraId, confidence: 0.93, source: 'yolo', box: position,
});

// Se prueban fragmentaciones de YOLO sin emplear la posición de los personajes 3D.
describe('Continuidad conservadora de incidentes con tracking interrumpido', () => {
  it('incorpora una caja geométrica real en el evento emitido por el monitor', () => {
    const zone = { id: area.id, cameraId: area.cameraId, polygon: [
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.95 }, { x: 0.1, y: 0.95 },
    ] };
    const track = new VisualZoneMonitor();
    // Tipado explícito: el dominio exige el literal 'persona', no un string general.
    const detection: Detection = { classId: 0, label: 'persona', confidence: 0.93, box };
    for (let i = 0; i < 2; i++) track.step(area.cameraId, [detection], zone, i * 100);
    const result = track.step(area.cameraId, [detection], zone, 200);
    expect(result.events[0]).toMatchObject({ type: 'opened', box });
  });

  it('el centro oficial recibe un solo ID y una sola auditoría opened aunque se repitan snapshots', () => {
    const coordinator = new VisualIncidentCoordinator();
    const official = new IncidentCenter();
    coordinator.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    official.ingest(coordinator.snapshot().incidents);
    coordinator.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    coordinator.ingest([event(3, 2, 'opened', 3)], area, rule, at(3));
    coordinator.ingest([event(4, 2, 'lost', 4)], area, rule, at(4));
    coordinator.ingest([event(5, 3, 'opened', 5)], area, rule, at(5));
    official.ingest(coordinator.snapshot().incidents);
    official.ingest(coordinator.snapshot().incidents);
    expect(official.getSnapshot().incidents).toHaveLength(1);
    expect(official.getSnapshot().audit.filter(audit => audit.action === 'opened')).toHaveLength(1);
    expect(official.getSnapshot().incidents[0].requiresReview).toBe(true);
  });

  it('no abre otro incidente por una trayectoria casi idéntica después de perder la anterior', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 3)], area, rule, at(3));
    center.ingest([event(4, 2, 'left', 4)], area, rule, at(4));
    expect(center.snapshot().incidents).toHaveLength(1);
    expect(center.snapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true });
    expect(center.snapshot().log.map(e => e.eventType)).toEqual(['lost','opened']);
  });

  it('tolera fragmentaciones consecutivas sin cerrar automáticamente el incidente pendiente', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 3)], area, rule, at(3));
    center.ingest([event(4, 2, 'lost', 4)], area, rule, at(4));
    center.ingest([event(5, 3, 'opened', 5)], area, rule, at(5));
    center.ingest([event(6, 3, 'lost', 6)], area, rule, at(6));
    center.ingest([event(7, 4, 'opened', 7)], area, rule, at(7));
    expect(center.snapshot().incidents).toHaveLength(1);
    expect(center.snapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true });
  });

  it('no fusiona una intrusión posterior tras salida de un track provisional', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 3)], area, rule, at(3));
    center.ingest([event(4, 2, 'left', 4)], area, rule, at(4));
    center.ingest([event(5, 3, 'opened', 5)], area, rule, at(5));
    expect(center.snapshot().incidents).toHaveLength(2);
  });

  it('no fusiona un segundo trabajador lejano de la trayectoria perdida', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 3, { ...box, x: 0.1 })], area, rule, at(3));
    expect(center.snapshot().incidents).toHaveLength(2);
  });

  it('no fusiona dos personas con tracks activos ni sin evidencia de caja', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1), event(2, 2, 'opened', 1, { ...box, x: 0.5 })], area, rule, at(1));
    expect(center.snapshot().incidents).toHaveLength(2);
    center.reset();
    const noBox = { ...event(1, 1, 'opened', 1), box: undefined };
    center.ingest([noBox], area, rule, at(1));
    center.ingest([{ ...noBox, id: 2, type: 'lost', atMs: 2000 }], area, rule, at(2));
    center.ingest([{ ...noBox, id: 3, trackId: 2, atMs: 3000 }], area, rule, at(3));
    expect(center.snapshot().incidents).toHaveLength(2);
  });

  it('mantiene incidentes distintos entre cámaras y tras cierre real', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'left', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 3)], area, rule, at(3));
    expect(center.snapshot().incidents).toHaveLength(2);
    const other = { ...area, cameraId: 'CAM-03' };
    center.ingest([event(4, 1, 'opened', 3, box, 'CAM-03')], other, rule, at(3));
    expect(center.snapshot().incidents).toHaveLength(3);
  });

  it('rechaza una coincidencia tardía y más de un candidato posible', () => {
    const center = new VisualIncidentCoordinator();
    center.ingest([event(1, 1, 'opened', 1)], area, rule, at(1));
    center.ingest([event(2, 1, 'lost', 2)], area, rule, at(2));
    center.ingest([event(3, 2, 'opened', 20)], area, rule, at(20));
    expect(center.snapshot().incidents).toHaveLength(2);
  });
});
