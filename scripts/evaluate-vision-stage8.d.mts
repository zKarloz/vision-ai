/** Contrato de métricas del evaluador sin dependencias de navegador ni Supabase. */
export type Label = 'persona' | 'cono' | 'casco' | 'chaleco';
export type Box = { x: number; y: number; width: number; height: number };
export type Annotation = { class: Label; box: Box };
export type Prediction = Annotation & { confidence: number };
export interface EvaluationDataset {
  schema: 'vision-ai-eval-v1';
  dataset: string;
  frames: Array<{ cameraId: string; frameId: string; truth: Annotation[]; predictions: Prediction[] }>;
}
export interface Metric { tp: number; fp: number; fn: number; support: number; precision: number; recall: number; f1: number }
export interface EvaluationResult {
  schema: 'vision-ai-eval-result-v1'; dataset: string; framesEvaluated: number;
  thresholds: { confidence: number; iou: number }; summary: Metric;
  perClass: Record<Label, Metric>; limitations: string[];
}
export const CLASS_LABELS: readonly Label[];
export function boxIoU(a: Box, b: Box): number;
export function evaluateDataset(dataset: EvaluationDataset, options?: { confidence?: number; iou?: number }): EvaluationResult;
