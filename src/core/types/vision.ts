// Tipos propios del dominio experimental: nunca dependen de React ni de ONNX Runtime.
export type Provider = 'wasm' | 'webgpu';

export interface Detection {
  classId: number;
  label: 'persona';
  confidence: number;
  // Coordenadas normalizadas en la imagen ORIGINAL, todas entre 0 y 1.
  box: { x: number; y: number; width: number; height: number };
}

export interface FrameResult {
  detections: Detection[];
  timestamp: number;
  metrics: {
    preprocessingMs: number;
    inferenceMs: number;
    postprocessingMs: number;
    totalMs: number;
  };
}

export interface ModelDetails {
  provider: Provider;
  inputName: string;
  outputName: string;
  inputShape: readonly number[];
}
