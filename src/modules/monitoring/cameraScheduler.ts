/** Selección pura de cámaras: cada turno usa un único Worker ONNX compartido. */
export type AnalysisMode = 'selected' | 'all';

export class CameraRoundRobin {
  private index = 0;

  next(enabled: readonly string[], selected: string, mode: AnalysisMode): string | null {
    const ids = [...new Set(enabled)];
    if (mode === 'selected') return ids.includes(selected) ? selected : null;
    if (ids.length === 0) return null;
    const id = ids[this.index % ids.length];
    this.index = (this.index + 1) % ids.length;
    return id;
  }

  reset(): void { this.index = 0; }
}

/** El contador muestra sólo tracks observados recientemente; no convierte predicciones en detecciones. */
export function freshObservedCount(
  tracks: readonly {seen: boolean}[], lastAtMs: number | null,
  nowMs: number, maxAgeMs: number,
): number {
  if (lastAtMs === null || nowMs - lastAtMs > maxAgeMs || nowMs < lastAtMs) return 0;
  return tracks.filter(track => track.seen).length;
}
