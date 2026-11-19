/**
 * Evidencia reproducible de rendimiento YOLO. Solo incluye telemetría numérica:
 * nunca imágenes, audio, identidades, incidentes ni tokens del navegador.
 */
export interface PerformanceSample {
  /** Reloj monotónico del mismo contexto de navegador (performance.now). */
  atMs: number;
  /** Tiempo que informa el motor ONNX para la inferencia. */
  inferenceMs: number;
  /** Captura de fotograma → procesamiento de reglas y publicación local. */
  cycleMs: number;
}

export type MeasurementState = 'paused' | 'no-data' | 'collecting' | 'ready';

export interface PerformanceSummary {
  state: MeasurementState;
  samples: number;
  durationSec: number;
  fps: number | null;
  inferenceAverageMs: number | null;
  inferenceP95Ms: number | null;
  cycleP95Ms: number | null;
}

export interface PerformanceWindow {
  summary: PerformanceSummary;
  /** Segmento continuo que respalda el resumen; no toda la sesión histórica. */
  samples: PerformanceSample[];
}

const empty = (state: MeasurementState): PerformanceWindow => ({
  summary: { state, samples: 0, durationSec: 0, fps: null,
    inferenceAverageMs: null, inferenceP95Ms: null, cycleP95Ms: null },
  samples: [],
});

/** Percentil empírico nearest-rank, sin asumir distribución normal. */
function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

/**
 * Un cambio de pestaña o un bloqueo largo corta la serie. Evita publicar como
 * FPS actuales promedios de una sesión antigua o de una cámara suspendida.
 * Requiere al menos 5 muestras y 2 segundos para considerar fiable la ventana.
 */
export function measurePerformanceWindow(
  samples: readonly PerformanceSample[], nowMs: number, foregroundSinceMs: number,
  captureIntervalMs: number, camerasInRotation: number, visible: boolean,
  windowMs = 12_000,
): PerformanceWindow {
  if (!visible) return empty('paused');
  if (!Number.isFinite(nowMs) || !Number.isFinite(foregroundSinceMs)) return empty('no-data');

  const cutoff = Math.max(foregroundSinceMs, nowMs - windowMs);
  const maxGapMs = Math.max(2_000, captureIntervalMs * Math.max(1, camerasInRotation) * 3);
  const eligible = samples.filter(item =>
    Number.isFinite(item.atMs) && item.atMs >= cutoff && item.atMs <= nowMs &&
    Number.isFinite(item.inferenceMs) && item.inferenceMs >= 0 &&
    Number.isFinite(item.cycleMs) && item.cycleMs >= 0,
  );
  if (!eligible.length || nowMs - eligible[eligible.length - 1].atMs > maxGapMs) return empty('no-data');

  // La fuente almacena las muestras en orden temporal; se retiene solo la última racha.
  let start = eligible.length - 1;
  while (start > 0 && eligible[start].atMs >= eligible[start - 1].atMs &&
    eligible[start].atMs - eligible[start - 1].atMs <= maxGapMs) start--;
  const current = eligible.slice(start);
  const durationMs = current[current.length - 1].atMs - current[0].atMs;
  const ready = current.length >= 5 && durationMs >= 2_000;
  return {
    summary: {
      state: ready ? 'ready' : 'collecting',
      samples: current.length,
      durationSec: durationMs / 1_000,
      // Dos fotogramas delimitan un intervalo, no dos segundos de trabajo.
      fps: ready ? (current.length - 1) * 1_000 / durationMs : null,
      inferenceAverageMs: ready ? current.reduce((sum, sample) => sum + sample.inferenceMs, 0) / current.length : null,
      inferenceP95Ms: ready ? p95(current.map(item => item.inferenceMs)) : null,
      cycleP95Ms: ready ? p95(current.map(item => item.cycleMs)) : null,
    },
    samples: current.map(item => ({ atMs: item.atMs, inferenceMs: item.inferenceMs, cycleMs: item.cycleMs })),
  };
}

/** Semáforo descriptivo, sin confundir rendimiento sintético con un ensayo físico. */
export function fpsAssessment(fps: number | null): 'unmeasured' | 'below' | 'within' | 'above' {
  if (fps === null || !Number.isFinite(fps)) return 'unmeasured';
  if (fps < 5) return 'below';
  if (fps > 15) return 'above';
  return 'within';
}
