import { describe, expect, it } from 'vitest';
import { workerRestrictedPath } from '../src/domain/rules';
import { evaluateDetections, iou, summarizeBenchmark } from '../src/vision/benchmark';

describe('comparación reproducible de personajes', () => {
  it('la trayectoria de simulación se reproduce para un mismo instante', () => {
    // La trayectoria real del escenario es determinista y no depende del diseño 3D.
    expect(workerRestrictedPath(20)).toEqual(workerRestrictedPath(20));
    expect(workerRestrictedPath(10)).not.toEqual(workerRestrictedPath(11));
  });
  it('IoU distingue coincidencias de falsos positivos', () => {
    expect(iou({ x:0, y:0, width:1, height:1 }, { x:0, y:0, width:1, height:1 })).toBe(1);
    expect(iou({ x:0, y:0, width:.2, height:.2 }, { x:.8, y:.8, width:.2, height:.2 })).toBe(0);
  });
  it('la confianza no se confunde con la tasa de aciertos', () => {
    const ref = { x:.25, y:.2, width:.3, height:.5 };
    const hit = evaluateDetections('A', 0, [{ classId: 0, label: 'persona', confidence:.35, box: ref }], ref, 35, 50);
    const miss = evaluateDetections('A', 1, [], ref, 50, 60);
    const summary = summarizeBenchmark('A', [hit, miss]);
    expect(summary.hitRate).toBe(.5);
    expect(summary.averageConfidence).toBeCloseTo(.35);
    expect(summary.hitRate50).toBe(0);
  });
});
