import type { Detection } from '../core/types/vision';
import { footPoint, pointInImagePolygon, type ImagePoint, type ImageZone } from './imageZones';

export interface VisionTrack {
  id: number;
  box: Detection['box'];
  confidence: number;
  missed: number;
  /** Último instante (reloj monotónico) en que YOLO realmente observó este objeto. */
  lastSeenAt: number;
  seen: boolean;
  inside: boolean;
  foot: ImagePoint;
  state: 'pending' | 'outside' | 'inside' | 'unknown';
  alertOpen: boolean;
}
export interface VisionEvent {
  id: number;
  trackId: number;
  cameraId: string;
  type: 'opened' | 'left' | 'lost';
  atMs: number;
  confidence: number;
  source: 'yolo';
  /** Caja observada, no identificador biométrico; se utiliza para detectar fragmentación del track. */
  box?: Detection['box'];
}
export interface VisionStepResult { tracks: VisionTrack[]; events: VisionEvent[] }

interface InternalTrack extends VisionTrack {
  insideHits: number;
  outsideHits: number;
}
export interface TrackingOptions {
  confirmFrames: number;
  exitFrames: number;
  maxMisses: number;
  /**
   * Gracia temporal opcional para no retirar un track por varios fotogramas vacíos
   * consecutivos. Es útil en video 3D con detecciones intermitentes (reloj monotónico).
   * No conserva una persona fuera de la zona ni confirma su salida automáticamente.
   */
  lossGraceMs?: number;
  /** Distancia normalizada máxima entre centros de dos cajas consecutivas. */
  maxCenterDistance: number;
}
export const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
  confirmFrames: 3,
  exitFrames: 2,
  maxMisses: 4,
  maxCenterDistance: 0.25,
};

/** Seguimiento IoU+centro ligero. NO recibe posiciones del simulador ni inventa cajas YOLO. */
export class VisualZoneMonitor {
  private tracks: InternalTrack[] = [];
  private nextTrackId = 1;
  private nextEventId = 1;
  private cameraId = '';

  constructor(private readonly options: TrackingOptions = DEFAULT_TRACKING_OPTIONS) {}

  reset(): void {
    this.tracks = [];
    this.nextTrackId = 1;
    this.nextEventId = 1;
    this.cameraId = '';
  }

  step(cameraId: string, detections: readonly Detection[], zone: ImageZone | null, atMs: number): VisionStepResult {
    // La asociación nunca debe continuar a través de cámaras diferentes.
    if (this.cameraId !== cameraId) { this.tracks = []; this.cameraId = cameraId; }
    const previous = this.tracks;
    const candidates: Array<{ ti: number; di: number; score: number }> = [];
    for (let ti = 0; ti < previous.length; ti++) {
      for (let di = 0; di < detections.length; di++) {
        const old = previous[ti]; const det = detections[di];
        // No reutilizar el track si el reloj avanza más allá de la gracia,
        // aunque aún no haya fotogramas marcados como perdidos. Esto sucede si
        // el navegador se suspende o la cámara deja de entregar imágenes.
        // Sin gracia temporal se mantiene la política clásica por fotogramas.
        if (this.options.lossGraceMs !== undefined &&
          atMs - old.lastSeenAt > this.options.lossGraceMs) continue;
        const overlap = intersectionOverUnion(old.box, det.box);
        const dist = centerDistance(old.box, det.box);
        if (overlap >= 0.08 || dist <= this.options.maxCenterDistance) {
          candidates.push({ ti, di, score: overlap * 2 - dist });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const assignedTracks = new Set<number>();
    const assignedDetections = new Set<number>();
    const matches = new Map<number, number>();
    for (const c of candidates) {
      if (assignedTracks.has(c.ti) || assignedDetections.has(c.di)) continue;
      assignedTracks.add(c.ti);
      assignedDetections.add(c.di);
      matches.set(c.ti, c.di);
    }
    const events: VisionEvent[] = [];
    const updated: InternalTrack[] = [];
    const zonePolygon = zone?.cameraId === cameraId ? zone.polygon : null;
    const emit = (track: InternalTrack, type: VisionEvent['type']) => events.push({
      id: this.nextEventId++, trackId: track.id, cameraId, type, atMs,
      confidence: track.confidence, source: 'yolo', box: { ...track.box },
    });

    for (let ti = 0; ti < previous.length; ti++) {
      const track = previous[ti];
      const di = matches.get(ti);
      if (di === undefined) {
        track.missed++;
        track.insideHits = 0; // Se exigen observaciones realmente consecutivas.
        track.outsideHits = 0;
        track.seen = false;
        track.state = 'unknown';
        // Una pérdida de imagen no equivale a una salida de la zona.
        // Con gracia 3D, el reloj es la referencia: una pausa larga debe
        // caducar el seguimiento incluso en la primera captura posterior.
        // Sin gracia se conserva el criterio clásico de maxMisses.
        const expired = this.options.lossGraceMs === undefined
          ? track.missed >= this.options.maxMisses
          : atMs - track.lastSeenAt > this.options.lossGraceMs;
        if (expired) {
          if (track.alertOpen) emit(track, 'lost');
          continue;
        }
        updated.push(track);
        continue;
      }
      const det = detections[di];
      // Usamos la caja OBSERVADA para analizar zona: ninguna extrapolación abre alertas.
      track.box = det.box;
      track.confidence = det.confidence;
      track.missed = 0;
      track.seen = true;
      track.lastSeenAt = atMs;
      track.foot = footPoint(det.box);
      track.inside = Boolean(zonePolygon && pointInImagePolygon(track.foot, zonePolygon));
      track.state = !zonePolygon ? 'pending' : track.inside ? 'inside' : 'outside';
      if (!zonePolygon) {
        track.insideHits = 0;
        track.outsideHits = 0;
      } else if (track.inside) {
        track.insideHits++;
        track.outsideHits = 0;
        if (!track.alertOpen && track.insideHits >= this.options.confirmFrames) {
          track.alertOpen = true;
          emit(track, 'opened');
        }
      } else {
        track.outsideHits++;
        track.insideHits = 0;
        if (track.alertOpen && track.outsideHits >= this.options.exitFrames) {
          track.alertOpen = false;
          emit(track, 'left');
        }
      }
      updated.push(track);
    }
    for (let di = 0; di < detections.length; di++) {
      if (assignedDetections.has(di)) continue;
      const det = detections[di];
      const foot = footPoint(det.box);
      const inside = Boolean(zonePolygon && pointInImagePolygon(foot, zonePolygon));
      const track: InternalTrack = {
        id: this.nextTrackId++, box: det.box, confidence: det.confidence, seen: true,
        missed: 0, foot, inside, state: !zonePolygon ? 'pending' : inside ? 'inside' : 'outside',
        alertOpen: false, insideHits: inside ? 1 : 0, outsideHits: inside ? 0 : 1,
        lastSeenAt: atMs,
      };
      if (inside && this.options.confirmFrames <= 1) { track.alertOpen = true; emit(track, 'opened'); }
      updated.push(track);
    }
    this.tracks = updated;
    return { tracks: updated.map(track => ({
      id: track.id, box: { ...track.box }, confidence: track.confidence, missed: track.missed,
      seen: track.seen, lastSeenAt: track.lastSeenAt, inside: track.inside, foot: { ...track.foot }, state: track.state,
      alertOpen: track.alertOpen,
    })), events };
  }
}

export function intersectionOverUnion(a: Detection['box'], b: Detection['box']): number {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
function centerDistance(a: Detection['box'], b: Detection['box']): number {
  return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2,
    a.y + a.height / 2 - b.y - b.height / 2);
}
