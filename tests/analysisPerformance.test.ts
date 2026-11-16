import { describe, expect, it } from 'vitest';
import { recentAnalysisFps } from '../src/modules/monitoring/analysisPerformance';

const timestamps = (...times: number[]) => times.map(atMs => ({ atMs }));

describe('FPS de análisis reciente al volver de una pestaña oculta', () => {
  it('mide ~3,33 FPS en una cámara con intervalo de 300 ms', () => {
    expect(recentAnalysisFps(timestamps(100, 400, 700, 1000), 1100, 0, 300, 1)).toBeCloseTo(3.3333, 3);
  });
  it('mide ~1,67 FPS por cámara con alternancia de dos cámaras', () => {
    expect(recentAnalysisFps(timestamps(100, 700, 1300, 1900), 2000, 0, 300, 2)).toBeCloseTo(1.6667, 3);
  });
  it('excluye muestras anteriores al retorno de la pestaña', () => {
    const samples = timestamps(100, 400, 700, 15_200, 15_500, 15_800);
    expect(recentAnalysisFps(samples, 15_900, 15_000, 300, 1)).toBeCloseTo(3.3333, 3);
    expect(recentAnalysisFps(samples, 15_300, 15_000, 300, 1)).toBe(0);
  });
  it('descarta interrupciones largas, incluso dentro de la ventana reciente', () => {
    const samples = timestamps(1000, 1300, 1600, 6000, 6300, 6600);
    expect(recentAnalysisFps(samples, 6700, 0, 300, 1)).toBeCloseTo(3.3333, 3);
  });
  it('no conserva una frecuencia positiva si dejaron de llegar fotogramas', () => {
    expect(recentAnalysisFps(timestamps(1000, 1300, 1600), 5000, 0, 300, 1)).toBe(0);
  });
});
