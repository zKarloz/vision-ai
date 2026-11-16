import type { FrameResult, ModelDetails, Provider } from '../core/types/vision';

// Contrato de mensajes entre la interfaz y el Worker: no se envían imágenes a redes.
export type WorkerRequest =
  | { type: 'init'; id: number; provider: Provider; modelUrl: string; assetUrl: string }
  | { type: 'analyze'; id: number; frame: ImageBitmap; threshold: number };

export type WorkerResponse =
  | { type: 'ready'; id: number; details: ModelDetails }
  | { type: 'result'; id: number; result: FrameResult }
  | { type: 'error'; id: number; message: string };
