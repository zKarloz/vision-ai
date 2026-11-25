import type { Provider } from '../../core/types/vision';
import type { SafetyConeDetection } from '../../vision/conePostprocess';
import type { ConeWorkerRequest, ConeWorkerResponse } from '../../workers/cone.protocol';

type Pending = { resolve: (value: ConeWorkerResponse) => void; reject: (error: Error) => void };

/** Adaptador E2 experimental, independiente del VisionEngine de personas. */
export class OnnxConeWorkerEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private request(payload: ConeWorkerRequest, transfers: Transferable[] = []): Promise<ConeWorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('Worker de conos detenido.'));
    return new Promise((resolve, reject) => {
      this.pending.set(payload.id, { resolve, reject });
      try { this.worker?.postMessage(payload, transfers); }
      catch (error) {
        this.pending.delete(payload.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async initialize(provider: Provider): Promise<void> {
    this.dispose();
    this.worker = new Worker(new URL('../../workers/cone.worker.ts', import.meta.url), {
      type: 'module', name: 'vision-ai-onnx-cone-experimental',
    });
    this.worker.addEventListener('message', (event: MessageEvent<ConeWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.type === 'error') pending.reject(new Error(response.message));
      else pending.resolve(response);
    });
    this.worker.addEventListener('error', (event: ErrorEvent) => {
      const error = new Error(`Worker de conos falló: ${event.message || 'error desconocido'}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const response = await this.request({
      type: 'init', id: this.nextId++, provider,
      modelUrl: new URL('models/vision-cones-ppe.onnx', base).href,
      assetUrl: new URL('ort/', base).href,
    });
    if (response.type !== 'ready') throw new Error('No se pudo inicializar el modelo de conos.');
  }

  async analyze(frame: ImageBitmap, threshold: number): Promise<{ detections: SafetyConeDetection[]; inferenceMs: number }> {
    const response = await this.request({ type: 'analyze', id: this.nextId++, frame, threshold }, [frame]);
    if (response.type !== 'result') throw new Error('El detector de conos devolvió una respuesta inesperada.');
    return { detections: response.detections, inferenceMs: response.inferenceMs };
  }

  dispose(): void {
    for (const pending of this.pending.values()) pending.reject(new Error('Detector de conos detenido.'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
