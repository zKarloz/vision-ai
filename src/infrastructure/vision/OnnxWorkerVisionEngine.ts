import type { VisionEngine } from '../../core/ports/VisionEngine';
import type { FrameResult, ModelDetails, Provider } from '../../core/types/vision';
import type { WorkerRequest, WorkerResponse } from '../../workers/protocol';

interface Pending {
  resolve: (message: WorkerResponse) => void;
  reject: (error: Error) => void;
}

/** Adaptador de VisionEngine: encapsula el ciclo de vida del Web Worker ONNX. */
export class OnnxWorkerVisionEngine implements VisionEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private request(message: WorkerRequest, transfers: Transferable[] = []): Promise<WorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('El Worker está detenido.'));
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      try {
        this.worker?.postMessage(message, transfers);
      } catch (error) {
        this.pending.delete(message.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async initialize(provider: Provider): Promise<ModelDetails> {
    this.dispose();
    this.worker = new Worker(new URL('../../workers/vision.worker.ts', import.meta.url), {
      type: 'module', name: 'vision-ai-onnx-inference',
    });
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.type === 'error') pending.reject(new Error(response.message));
      else pending.resolve(response);
    });
    this.worker.addEventListener('error', (event: ErrorEvent) => {
      const error = new Error(`El Worker falló: ${event.message || 'error desconocido'}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });

    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const response = await this.request({
      type: 'init', id: this.nextId++, provider,
      modelUrl: new URL('models/yolov8n.onnx', base).href,
      assetUrl: new URL('ort/', base).href,
    });
    if (response.type !== 'ready') throw new Error('Respuesta inesperada al iniciar el modelo.');
    return response.details;
  }

  async analyze(frame: ImageBitmap, confidenceThreshold: number): Promise<FrameResult> {
    // El bitmap se transfiere (no se copia) al Worker para evitar presión de memoria.
    const response = await this.request({ type: 'analyze', id: this.nextId++, frame,
      threshold: confidenceThreshold }, [frame]);
    if (response.type !== 'result') throw new Error('Respuesta inesperada del detector.');
    return response.result;
  }

  dispose(): void {
    for (const pending of this.pending.values()) pending.reject(new Error('Motor detenido.'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
