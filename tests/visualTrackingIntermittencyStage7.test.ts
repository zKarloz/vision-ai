import { describe, expect, it } from 'vitest';
import type { Detection } from '../src/core/types/vision';
import { VisualZoneMonitor, DEFAULT_TRACKING_OPTIONS } from '../src/domain/visualTracking';
import type { ImageZone } from '../src/domain/imageZones';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { IncidentCenter } from '../src/application/incidents/IncidentCenter';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';

// Únicamente la secuencia de conteos del JSON real de CAM-02, 19/11/2026;
// el archivo no incluye cajas históricas, por eso la caja de esta prueba es
// deliberadamente sintética. No prueba una identidad biométrica.
const CAM02_TRACE =
  '100111111000011111100001110100011111110011111000011111100000010100001111100111111111011111110001111110001111111000111111';
const zone: ImageZone = { id: 'Z-VIS-CAM-02', cameraId: 'CAM-02', polygon: [
  { x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .95 }, { x: .1, y: .95 },
] };
const person = (x = .42): Detection => ({
  classId: 0, label: 'persona', confidence: .8,
  box: { x, y: .3, width: .12, height: .37 },
});

function replay(monitor: VisualZoneMonitor) {
  let opened = 0;
  let lost = 0;
  let left = 0;
  const ids = new Set<number>();
  for (let i = 0; i < CAM02_TRACE.length; i++) {
    const detections = CAM02_TRACE[i] === '1' ? [person()] : [];
    const result = monitor.step('CAM-02', detections, zone, 1_000_000 + i * 75);
    for (const event of result.events) {
      if (event.type === 'opened') { opened++; ids.add(event.trackId); }
      if (event.type === 'lost') lost++;
      if (event.type === 'left') left++;
    }
  }
  return { opened, lost, left, ids };
}

describe('D2: continuidad con detecciones intermitentes CAM-02', () => {
  it('reproduce la fragmentación del algoritmo clásico con 120 conteos reales', () => {
    expect(CAM02_TRACE).toHaveLength(120);
    const before = replay(new VisualZoneMonitor());
    expect(before.opened).toBeGreaterThan(1);
    expect(before.lost).toBeGreaterThan(0);
  });

  it('no multiplica alertas con la gracia temporal 3D para una trayectoria estable', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    const after = replay(monitor);
    expect(after.opened).toBe(1);
    expect(after.lost).toBe(0);
    expect(after.left).toBe(0);
    expect(after.ids.size).toBe(1);
  });

  it('persiste una sola apertura y auditoría al reproducir la intermitencia', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    const coordinator = new VisualIncidentCoordinator();
    const official = new IncidentCenter();
    for (let i = 0; i < CAM02_TRACE.length; i++) {
      const observed = monitor.step('CAM-02', CAM02_TRACE[i] === '1' ? [person()] : [],
        zone, 1_000_000 + i * 75);
      coordinator.observeTracks('CAM-02', observed.tracks, 1_000_000 + i * 75);
      coordinator.ingest(observed.events, STARTER_RESTRICTED_ZONE, STARTER_PERSON_RULE,
        new Date(Date.UTC(2026, 10, 19, 8, 15, 0) + i * 75).toISOString());
      official.ingest(coordinator.snapshot().incidents);
    }
    expect(official.getSnapshot().incidents).toHaveLength(1);
    expect(official.getSnapshot().audit.filter(entry => entry.action === 'opened')).toHaveLength(1);
  });

  it('no declara salida si la imagen desaparece durante seis capturas', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    for (let i = 0; i < 3; i++) monitor.step('CAM-02', [person()], zone, i * 75);
    for (let i = 3; i < 9; i++) {
      const result = monitor.step('CAM-02', [], zone, i * 75);
      expect(result.events).toEqual([]);
      expect(result.tracks[0]).toMatchObject({ id: 1, seen: false, alertOpen: true, state: 'unknown' });
    }
    const resumed = monitor.step('CAM-02', [person()], zone, 9 * 75);
    expect(resumed.events).toEqual([]);
    expect(resumed.tracks).toMatchObject([{ id: 1, seen: true, alertOpen: true }]);
  });

  it('marca pérdida si el seguimiento sigue ausente más de 1,2 segundos', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    for (let i = 0; i < 3; i++) monitor.step('CAM-02', [person()], zone, i * 75);
    const emitted = [];
    for (let i = 3; i <= 25; i++) emitted.push(...monitor.step('CAM-02', [], zone, i * 75).events);
    expect(emitted.map(item => item.type)).toEqual(['lost']);
    expect(emitted[0].trackId).toBe(1);
  });

  it('no reutiliza un track para una aparición lejana tras una pausa larga', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    for (let i = 0; i < 3; i++) monitor.step('CAM-02', [person()], zone, i * 75);
    // El salto de reloj supera la continuidad admisible: no se inventa seguimiento.
    const later = monitor.step('CAM-02', [person()], zone, 3_000);
    expect(later.events.map(item => item.type)).toEqual(['lost']);
    expect(later.tracks.map(item => item.id)).toEqual([2]);
  });

  it('mantiene dos trabajadores simultáneos como dos incidentes distintos', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    let opened: number[] = [];
    for (let i = 0; i < 3; i++) {
      const result = monitor.step('CAM-02', [person(.22), person(.68)], zone, i * 75);
      opened = [...opened, ...result.events.filter(item => item.type === 'opened').map(item => item.trackId)];
    }
    expect(opened).toEqual([1, 2]);
  });

  it('sigue cerrando por dos observaciones consecutivas fuera de la zona', () => {
    const monitor = new VisualZoneMonitor({ ...DEFAULT_TRACKING_OPTIONS, lossGraceMs: 1_200 });
    const boundary: ImageZone = { ...zone, polygon: [
      { x: .4, y: .4 }, { x: .7, y: .4 }, { x: .7, y: .85 }, { x: .4, y: .85 },
    ] };
    for (let i = 0; i < 3; i++) monitor.step('CAM-02', [person(.43)], boundary, i * 75);
    expect(monitor.step('CAM-02', [person(.29)], boundary, 225).events).toEqual([]);
    const result = monitor.step('CAM-02', [person(.28)], boundary, 300);
    expect(result.events.map(item => item.type)).toEqual(['left']);
  });
});
