import type { Detection } from '../core/types/vision';
// Tipo histórico de los ensayos de fase 0; A y B ya no se renderizan en el producto.
export type CharacterVariant = 'A' | 'B' | 'C';

export type Box = { x: number; y: number; width: number; height: number };
export interface BenchmarkSample {
  variant: CharacterVariant;
  index: number;
  matched: boolean;
  confidence: number | null;
  iou: number;
  falsePositives: number;
  inferenceMs: number;
  endToEndMs: number;
  referenceVisible: boolean;
}
export interface BenchmarkSummary {
  variant: CharacterVariant;
  samples: number;
  visibleSamples: number;
  matches: number;
  hitRate: number;
  averageConfidence: number | null;
  averageInferenceMs: number;
  p95InferenceMs: number;
  averageEndToEndMs: number;
  falsePositives: number;
  hitRate25: number;
  hitRate50: number;
}

/** Intersección / unión de cajas normalizadas (no confundir con confianza del modelo). */
export function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Un acierto exige que la caja coincida espacialmente con el personaje conocido. */
export function evaluateDetections(variant: CharacterVariant, index: number, detections: Detection[], reference: Box,
  inferenceMs: number, endToEndMs: number, minimumIoU = 0.20): BenchmarkSample {
  const visible = reference.width > 0.015 && reference.height > 0.025;
  const candidates = detections.map(d => ({ confidence: d.confidence, iou: iou(d.box, reference) }))
    .filter(d => d.iou >= minimumIoU)
    .sort((a, b) => b.iou - a.iou);
  return {
    variant, index, matched: visible && candidates.length > 0,
    confidence: visible && candidates.length > 0 ? candidates[0].confidence : null,
    iou: visible && candidates.length > 0 ? candidates[0].iou : 0,
    falsePositives: Math.max(0, detections.length - (visible && candidates.length > 0 ? 1 : 0)),
    inferenceMs, endToEndMs, referenceVisible: visible,
  };
}

const average = (data: number[]): number => data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);

export function summarizeBenchmark(variant: CharacterVariant, records: BenchmarkSample[]): BenchmarkSummary {
  const visible = records.filter(r => r.referenceVisible);
  const matched = visible.filter(r => r.matched);
  const times = records.map(r => r.inferenceMs).sort((a,b) => a-b);
  return {
    variant, samples: records.length, visibleSamples: visible.length, matches: matched.length,
    hitRate: visible.length ? matched.length / visible.length : 0,
    averageConfidence: matched.length ? average(matched.map(r => r.confidence ?? 0)) : null,
    averageInferenceMs: average(times),
    p95InferenceMs: times.length ? times[Math.max(0, Math.ceil(times.length * 0.95)-1)] : 0,
    averageEndToEndMs: average(records.map(r => r.endToEndMs)),
    falsePositives: records.reduce((sum, r) => sum + r.falsePositives, 0),
    hitRate25: visible.length ? matched.filter(r => (r.confidence ?? 0) >= .25).length / visible.length : 0,
    hitRate50: visible.length ? matched.filter(r => (r.confidence ?? 0) >= .50).length / visible.length : 0,
  };
}
