import { describe, expect, it } from 'vitest';
import { fpsAssessment, measurePerformanceWindow, type PerformanceSample } from '../src/modules/monitoring/performanceEvidence';

/** D2: evidencia determinista antes de afirmar FPS reales de una máquina. */
const samples = (times: number[], inference = 60): PerformanceSample[] =>
  times.map(atMs => ({ atMs, inferenceMs: inference, cycleMs: inference + 18 }));

const measure = (items: PerformanceSample[], nowMs: number, foregroundSinceMs = 0,
  visible = true, intervalMs = 100, cameras = 1) =>
  measurePerformanceWindow(items, nowMs, foregroundSinceMs, intervalMs, cameras, visible);

describe('Bloque D2 · diagnóstico de rendimiento de YOLO', () => {
  it('registra 10 FPS en muestras de una cámara a 100 ms', () => {
    const result = measure(samples(Array.from({ length: 41 }, (_, i) => 1_000 + 100 * i)), 5_100);
    expect(result.summary.state).toBe('ready');
    expect(result.summary.fps).toBeCloseTo(10);
    expect(result.summary.inferenceAverageMs).toBe(60);
    expect(result.summary.inferenceP95Ms).toBe(60);
    expect(result.summary.cycleP95Ms).toBe(78);
  });

  it('calcula FPS reales por cámara, no FPS agregados del worker', () => {
    const result = measure(samples(Array.from({ length: 15 }, (_, i) => 1000 + 300 * i)),
      5_300, 0, true, 100, 3);
    expect(result.summary.fps).toBeCloseTo(10 / 3);
    expect(fpsAssessment(result.summary.fps)).toBe('below');
  });

  it('exige cinco observaciones y dos segundos antes de informar FPS', () => {
    const result = measure(samples([100, 200, 300, 400, 500]), 550);
    expect(result.summary.state).toBe('collecting');
    expect(result.summary.fps).toBeNull();
  });

  it('reinicia la muestra tras regresar de una pestaña oculta', () => {
    const result = measure(samples([100, 200, 300, 400, 500, 5500, 6000, 6500, 7000, 7500]), 7600, 5400);
    expect(result.summary.samples).toBe(5);
    expect(result.samples.every(item => item.atMs >= 5400)).toBe(true);
  });

  it('descarta un tramo anterior si hay pausa grande del navegador', () => {
    const result = measure(samples([500, 1000, 1500, 2000, 2500, 6000, 6500, 7000, 7500, 8000]), 8100,
      0, true, 500);
    expect(result.summary.state).toBe('ready');
    expect(result.summary.samples).toBe(5);
    expect(result.summary.fps).toBeCloseTo(2);
  });

  it('no inventa resultados si la cámara dejó de entregar frames', () => {
    expect(measure(samples([100, 600, 1100, 1600, 2100]), 5000).summary.state).toBe('no-data');
    expect(measure(samples([100, 600, 1100, 1600, 2100]), 2200, 0, false).summary.state).toBe('paused');
  });

  it('calcula P95 con nearest-rank y no oculta ciclos lentos', () => {
    const values = Array.from({ length: 20 }, (_, i) => ({
      atMs: i * 200, inferenceMs: i === 18 ? 400 : 30, cycleMs: i === 18 ? 450 : 45,
    }));
    const result = measure(values, 3900, 0, true, 200);
    expect(result.summary.inferenceP95Ms).toBe(30); // El peor 5 % no aparece en P95 nearest-rank.
    expect(result.summary.cycleP95Ms).toBe(45);
  });

  it('filtra valores negativos o no finitos y limita la ventana a 12 segundos', () => {
    const observations = [
      ...samples([100, 600, 1100]),
      ...samples(Array.from({ length: 25 }, (_, i) => 20_000 + 500 * i)),
      { atMs: 32_100, inferenceMs: Number.NaN, cycleMs: 20 },
      { atMs: 32_200, inferenceMs: -1, cycleMs: 20 },
    ];
    const result = measure(observations, 32_300, 0, true, 500);
    expect(result.summary.state).toBe('ready');
    expect(result.samples.every(item => item.atMs >= 20_300)).toBe(true);
    expect(result.summary.samples).toBe(24);
  });

  it('distingue objetivo de 5–15 FPS de métricas ausentes', () => {
    expect(fpsAssessment(null)).toBe('unmeasured');
    expect(fpsAssessment(4.99)).toBe('below');
    expect(fpsAssessment(5)).toBe('within');
    expect(fpsAssessment(15)).toBe('within');
    expect(fpsAssessment(15.01)).toBe('above');
  });
});
