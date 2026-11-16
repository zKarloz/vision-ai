import { describe, expect, it } from 'vitest';
import { CameraRoundRobin, freshObservedCount } from '../src/modules/monitoring/cameraScheduler';

describe('Muestreo multicámara con un motor YOLO', () => {
  it('alterna las perspectivas y no duplica cámaras', () => {
    const scheduler = new CameraRoundRobin();
    const ids = ['CAM-01', 'CAM-01', 'CAM-02'];
    expect([0, 1, 2, 3].map(() => scheduler.next(ids, 'CAM-01', 'all')))
      .toEqual(['CAM-01', 'CAM-02', 'CAM-01', 'CAM-02']);
  });
  it('sólo usa la cámara seleccionada si está habilitada', () => {
    const scheduler = new CameraRoundRobin();
    expect(scheduler.next(['CAM-01', 'CAM-02'], 'CAM-02', 'selected')).toBe('CAM-02');
    expect(scheduler.next(['CAM-01'], 'CAM-02', 'selected')).toBeNull();
  });
  it('se adapta a cámaras deshabilitadas o sin cámaras', () => {
    const scheduler = new CameraRoundRobin();
    expect(scheduler.next(['CAM-01', 'CAM-02'], 'CAM-02', 'all')).toBe('CAM-01');
    expect(scheduler.next(['CAM-02'], 'CAM-01', 'all')).toBe('CAM-02');
    expect(scheduler.next([], 'CAM-01', 'all')).toBeNull();
  });
  it('no suma observaciones antiguas ni tracks no vistos', () => {
    expect(freshObservedCount([{seen:true},{seen:false}], 1000, 1200, 1000)).toBe(1);
    expect(freshObservedCount([{seen:true}], 1000, 5000, 1000)).toBe(0);
    expect(freshObservedCount([{seen:true}], null, 5000, 1000)).toBe(0);
  });
});
