/** Estadística de FPS sobre el tramo continuo más reciente, no sobre toda la sesión. */
export interface AnalysisTimestamp { atMs: number }

/**
 * Calcula muestras/segundo por cámara sobre hasta 12 s recientes.
 * Ignora muestras anteriores a la última activación de la pestaña y descarta
 * tramos separados por pausas anómalas del navegador.
 * No es el FPS del renderizador Three.js ni promete una frecuencia mínima.
 */
export function recentAnalysisFps(
  samples: readonly AnalysisTimestamp[], nowMs: number, foregroundSinceMs: number,
  intervalMs: number, camerasInRotation: number, windowMs = 12_000,
): number {
  const cutoff = Math.max(foregroundSinceMs, nowMs - windowMs);
  const maxGapMs = Math.max(2_000, intervalMs * Math.max(1, camerasInRotation) * 3);
  const eligible = samples.filter(sample => sample.atMs >= cutoff && sample.atMs <= nowMs);
  if (eligible.length < 2 || nowMs - eligible[eligible.length - 1].atMs > maxGapMs) return 0;

  // Si el hilo principal quedó bloqueado, esperar muestras nuevas en vez de
  // promediar una discontinuidad de muchos segundos como FPS actuales.
  let start = eligible.length - 1;
  while (start > 0 && eligible[start].atMs - eligible[start - 1].atMs <= maxGapMs) start--;
  const last = eligible[eligible.length - 1].atMs;
  const first = eligible[start].atMs;
  return start < eligible.length - 1 && last > first
    ? (eligible.length - 1 - start) * 1000 / (last - first) : 0;
}
