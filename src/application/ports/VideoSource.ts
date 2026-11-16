/** Metadatos de fotograma según el contrato de flujo continuo del PDF rector. */
export interface FrameMetadata {
  frameId: string;
  cameraId: string;
  timestamp: string; // ISO 8601 con zona horaria.
}

/** La imagen es genérica para admitir ImageBitmap o un transporte futuro de backend. */
export interface VideoFrame<TImage> {
  metadata: FrameMetadata;
  image: TImage;
}

export type VideoSourceStatus = 'stopped' | 'connecting' | 'online' | 'no-signal' | 'error';

/** Puerto futuro para vídeo 3D, bucles, webcam y adaptadores IP (Etapa 4). */
export interface VideoSource<TImage> {
  start(onFrame: (frame: VideoFrame<TImage>) => void, onStatus: (status: VideoSourceStatus) => void): Promise<void>;
  stop(): void;
}

/** Puerto de captura bajo demanda: permite procesar sólo fotogramas recientes. */
export interface VideoFrameSampler<TCanvas> {
  readonly status: VideoSourceStatus;
  drawFrame(target: TCanvas): boolean;
  stop(): void;
}
