import { describe, expect, it } from 'vitest';
import type { Detection } from '../src/core/types/vision';
import { VisualZoneMonitor } from '../src/domain/visualTracking';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { CameraRoundRobin } from '../src/modules/monitoring/cameraScheduler';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';

/** Fotogramas sintéticos del CONTRATO YOLO: pruebas de reglas, no de precisión del modelo. */
const detection = (x: number): Detection => ({
  classId: 0, label: 'persona', confidence: 0.9,
  box: { x, y: 0.45, width: 0.12, height: 0.35 },
});
const polygon = [
  { x: 0.30, y: 0.30 }, { x: 0.80, y: 0.30 },
  { x: 0.80, y: 0.90 }, { x: 0.30, y: 0.90 },
];
const zone = { ...STARTER_RESTRICTED_ZONE, polygon };
const spatialZone = { id: zone.id, cameraId: zone.cameraId, polygon };
const baseDate = '2026-11-14T12:00:00Z';

function pipeline() {
  const tracker = new VisualZoneMonitor();
  const coordinator = new VisualIncidentCoordinator();
  const process = (frames: readonly Detection[], ms: number) => {
    const observed = tracker.step('CAM-02', frames, spatialZone, ms);
    coordinator.ingest(observed.events, zone, STARTER_PERSON_RULE,
      new Date(Date.parse(baseDate) + ms).toISOString());
    return observed;
  };
  return { process, coordinator };
}

describe('Etapa 4 · contrato YOLO → tracking → incidentes', () => {
  it('solo abre tras tres capturas consecutivas con el pie dentro; cierra tras dos fuera', () => {
    const { process, coordinator } = pipeline();
    process([detection(0.17)], 0); // pie fuera
    process([detection(0.35)], 300);
    process([detection(0.35)], 600);
    expect(coordinator.snapshot().incidents).toHaveLength(0);
    process([detection(0.35)], 900);
    expect(coordinator.snapshot().incidents[0]).toMatchObject({ source: 'yolo', status: 'open' });
    process([detection(0.35)], 1200);
    expect(coordinator.snapshot().incidents).toHaveLength(1);
    process([detection(0.17)], 1500);
    expect(coordinator.snapshot().incidents[0].status).toBe('open');
    process([detection(0.17)], 1800);
    expect(coordinator.snapshot().incidents[0].status).toBe('closed');
  });

  it('sin fotogramas nuevos no se cierra un incidente ni se inventa salida', () => {
    const { process, coordinator } = pipeline();
    for (let n = 1; n <= 3; n++) process([detection(0.35)], n * 300);
    expect(coordinator.snapshot().incidents[0].status).toBe('open');
    // Pausa de pestaña o pérdida de señal: no llamamos step(...,[]) como salida.
    expect(coordinator.snapshot().incidents[0].status).toBe('open');
  });

  it('el planificador incluye una tercera perspectiva sin cambiar la escena', () => {
    const scheduler = new CameraRoundRobin();
    const ids = ['CAM-01', 'CAM-02', 'CAM-03'];
    expect([1, 2, 3, 4].map(() => scheduler.next(ids, 'CAM-01', 'all'))).toEqual([
      'CAM-01', 'CAM-02', 'CAM-03', 'CAM-01',
    ]);
    expect(scheduler.next(ids, 'CAM-03', 'selected')).toBe('CAM-03');
    expect(scheduler.next(ids, 'CAM-04', 'selected')).toBeNull();
  });
});
