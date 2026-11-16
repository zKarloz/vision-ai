import type { FrameResult, ModelDetails, Provider } from '../types/vision';

// Puerto para aislar la inferencia de cualquier implementación (Worker, ONNX, etc.).
export interface VisionEngine {
  initialize(provider: Provider): Promise<ModelDetails>;
  analyze(frame: ImageBitmap, confidenceThreshold: number): Promise<FrameResult>;
  dispose(): void;
}
