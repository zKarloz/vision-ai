import type { Provider } from '../core/types/vision';
import type { SafetyConeDetection } from '../vision/conePostprocess';

/** Contrato aislado: las respuestas de conos no entran al motor de incidentes. */
export type ConeWorkerRequest =
  | { type: 'init'; id: number; provider: Provider; modelUrl: string; assetUrl: string }
  | { type: 'analyze'; id: number; frame: ImageBitmap; threshold: number };

export type ConeWorkerResponse =
  | { type: 'ready'; id: number; inputName: string; outputName: string }
  | { type: 'result'; id: number; detections: SafetyConeDetection[]; inferenceMs: number }
  | { type: 'error'; id: number; message: string };
