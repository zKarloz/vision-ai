import type { VideoSourceStatus, VideoFrameSampler } from '../../application/ports/VideoSource';
import { fitVideoFrame, validateLocalVideo } from './browserVideoFrame';

export type BrowserSourceKind = 'video-loop' | 'webcam';

/**
 * Fuente de fotogramas RGB desde el navegador. No realiza inferencia: sólo entrega
 * píxeles al adaptador VisionEngine. Ni vídeos ni pistas webcam salen del equipo.
 * Cada instancia corresponde a una cámara registrada y libera sus recursos al cerrar.
 */
export class BrowserMediaSource implements VideoFrameSampler<HTMLCanvasElement> {
  private readonly video = document.createElement('video');
  private stream: MediaStream | null = null;
  private localUrl: string | null = null;
  private disposed = false;
  private sequence = 0;
  private epoch = 0;
  private state: VideoSourceStatus = 'stopped';

  constructor(private readonly onStatus: (status: VideoSourceStatus) => void) {
    this.video.muted = true;
    this.video.autoplay = false;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.addEventListener('playing', () => this.setStatus('online'));
    this.video.addEventListener('waiting', () => this.setStatus('no-signal'));
    this.video.addEventListener('stalled', () => this.setStatus('no-signal'));
    this.video.addEventListener('error', () => this.setStatus('error'));
    this.video.addEventListener('ended', () => this.setStatus('no-signal'));
  }

  get status(): VideoSourceStatus { return this.state; }
  get nextFrameId(): number { return ++this.sequence; }

  private setStatus(status: VideoSourceStatus): void {
    if (this.disposed || this.state === status) return;
    this.state = status;
    this.onStatus(status);
  }

  private cleanupMedia(): void {
    this.epoch++;
    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.localUrl) URL.revokeObjectURL(this.localUrl);
    this.localUrl = null;
  }

  async openVideo(file: File): Promise<void> {
    const error = validateLocalVideo(file);
    if (error) throw new Error(error);
    if (this.disposed) throw new Error('La fuente ha sido cerrada.');
    this.cleanupMedia();
    const epoch = this.epoch;
    this.setStatus('connecting');
    this.localUrl = URL.createObjectURL(file);
    this.video.src = this.localUrl;
    try { await this.video.play(); }
    catch (cause) {
      if (this.epoch !== epoch || this.disposed) return;
      this.setStatus('error');
      throw new Error(`No se pudo reproducir el vídeo. Comprueba su códec: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    if (this.disposed || this.epoch !== epoch) return;
    this.setStatus('online');
  }

  async openWebcam(): Promise<void> {
    if (this.disposed) throw new Error('La fuente ha sido cerrada.');
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      throw new Error('La webcam requiere un contexto seguro (localhost/127.0.0.1 o HTTPS) y un navegador compatible.');
    }
    this.cleanupMedia();
    const epoch = this.epoch;
    this.setStatus('connecting');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }); }
    catch (cause) {
      if (this.epoch !== epoch || this.disposed) return;
      this.setStatus('error');
      const error = cause instanceof Error ? cause : new Error(String(cause));
      throw new Error(error.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Habilítalo en el navegador.'
        : `No se pudo abrir la webcam: ${error.message}`);
    }
    if (this.disposed || this.epoch !== epoch) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (this.epoch === epoch) this.setStatus('no-signal');
    }));
    this.video.srcObject = stream;
    try { await this.video.play(); }
    catch (cause) {
      if (this.epoch !== epoch || this.disposed) return;
      this.cleanupMedia();
      this.setStatus('error');
      throw new Error(`No se pudo reproducir la webcam: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    if (!this.disposed && this.epoch === epoch) this.setStatus('online');
  }

  /** Copia el fotograma en un canvas de captura. false implica ausencia de señal. */
  drawFrame(canvas: HTMLCanvasElement): boolean {
    if (this.disposed || this.state !== 'online' || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        this.video.videoWidth === 0 || this.video.videoHeight === 0) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const rect = fitVideoFrame(this.video.videoWidth, this.video.videoHeight, canvas.width, canvas.height);
    ctx.fillStyle = '#29343d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.video, rect.x, rect.y, rect.width, rect.height);
    return true;
  }

  stop(): void { this.cleanupMedia(); this.setStatus('stopped'); }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }
}
