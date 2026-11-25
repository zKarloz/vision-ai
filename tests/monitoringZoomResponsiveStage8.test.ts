import { describe, expect, it } from 'vitest';
import {
  CAPTURE_ZOOM_STORAGE_KEY, loadCaptureZooms, reprojectCapturePolygon,
} from '../src/modules/monitoring/captureZoom';
import type { ImagePoint } from '../src/core/domain/spatial';

// Se comprueba la geometría exacta usada por el encuadre PerspectiveCamera.zoom.
const restricted: ImagePoint[] = [
  { x: 0.32, y: 0.72 }, { x: 0.46, y: 0.42 },
  { x: 0.76, y: 0.52 }, { x: 0.68, y: 0.82 },
];

describe('E2 UI: zoom y persistencia de cámara', () => {
  it('preserva el centro de proyección y mueve vértices al ampliar', () => {
    const result = reprojectCapturePolygon(restricted, 1.5, 1.6);
    expect(result.error).toBeNull();
    if (!result.points) throw new Error('Polígono no disponible');
    expect(result.points[0].x).toBeCloseTo(0.308);
    expect(result.points[0].y).toBeCloseTo(0.734667, 5);
  });

  it('permite volver del zoom 1.6 al zoom 1.5 sin desplazar la zona', () => {
    const expanded = reprojectCapturePolygon(restricted, 1.5, 1.6);
    if (!expanded.points) throw new Error(expanded.error);
    const restored = reprojectCapturePolygon(expanded.points, 1.6, 1.5);
    expect(restored.error).toBeNull();
    restored.points?.forEach((point, index) => {
      expect(point.x).toBeCloseTo(restricted[index].x, 8);
      expect(point.y).toBeCloseTo(restricted[index].y, 8);
    });
  });

  it('impide recortar zonas por un aumento excesivo del zoom', () => {
    const nearEdge: ImagePoint[] = [
      { x: 0.05, y: 0.1 }, { x: 0.35, y: 0.15 }, { x: 0.2, y: 0.3 },
    ];
    const result = reprojectCapturePolygon(nearEdge, 1, 1.6);
    expect(result.points).toBeNull();
    expect(result.error).toMatch(/fuera del encuadre/i);
  });

  it('rechaza factores arbitrarios y evita alterar la zona', () => {
    const result = reprojectCapturePolygon(restricted, 1.5, 3);
    expect(result.points).toBeNull();
  });

  it('carga la preferencia guardada por la cuenta autenticada', () => {
    const zooms = loadCaptureZooms({
      getItem: key => key === CAPTURE_ZOOM_STORAGE_KEY
        ? JSON.stringify({ 'CAM-01': 1.25, 'CAM-02': 1.6, 'CAM-08': 1.5, 'CAM-99': 100 })
        : null,
    });
    expect(zooms).toMatchObject({ 'CAM-01': 1.25, 'CAM-02': 1.6, 'CAM-08': 1.5 });
    expect(zooms['CAM-99']).toBeUndefined();
  });

  it('usa valores seguros si las preferencias están dañadas', () => {
    const zooms = loadCaptureZooms({ getItem: () => '{malformed' });
    expect(zooms['CAM-02']).toBe(1.5);
    expect(zooms['CAM-01']).toBe(1);
  });
});
