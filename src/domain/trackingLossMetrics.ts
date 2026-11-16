import type { VisionTrack } from './visualTracking';

/** Cada interrupción mide la ausencia de una observación YOLO; no es una detección simulada. */
export interface TrackingLossEpisode {
  cameraId: string;
  trackId: number;
  startedAtMs: number;
  endedAtMs: number;
  /** Tiempo entre última detección real y recuperación/expiración del track. */
  gapMs: number;
  missedFrames: number;
  outcome: 'recovered' | 'expired';
}

export interface TrackingLossSummary {
  interruptions: number;
  recovered: number;
  expired: number;
  currentMissing: number;
  missedFramesTotal: number;
  longestGapMs: number;
  longestMissStreak: number;
  averageRecoveredGapMs: number | null;
}

export const EMPTY_LOSS_SUMMARY: TrackingLossSummary = {
  interruptions: 0, recovered: 0, expired: 0, currentMissing: 0,
  missedFramesTotal: 0, longestGapMs: 0, longestMissStreak: 0,
  averageRecoveredGapMs: null,
};

interface ActiveLoss {
  cameraId: string;
  trackId: number;
  startedAtMs: number;
  missedFrames: number;
}

/** Estadísticas por Track ID; no altera el motor de reglas ni genera incidentes. */
export class TrackingLossMonitor {
  private active = new Map<string, ActiveLoss>();
  private history: TrackingLossEpisode[] = [];
  private missedFramesTotal = 0;
  private longestMissStreak = 0;
  private recoveriesMsTotal = 0;
  private recoveryCount = 0;

  reset(): void {
    this.active.clear();
    this.history = [];
    this.missedFramesTotal = 0;
    this.longestMissStreak = 0;
    this.recoveriesMsTotal = 0;
    this.recoveryCount = 0;
  }

  observe(cameraId: string, tracks: readonly VisionTrack[], atMs: number): void {
    const trackIds = new Set<number>();
    for (const track of tracks) {
      trackIds.add(track.id);
      const key = `${cameraId}:${track.id}`;
      const active = this.active.get(key);
      if (!track.seen) {
        this.missedFramesTotal++;
        this.longestMissStreak = Math.max(this.longestMissStreak, track.missed);
        if (active) active.missedFrames = Math.max(active.missedFrames, track.missed);
        else this.active.set(key, {
          cameraId, trackId: track.id,
          startedAtMs: track.lastSeenAt, missedFrames: track.missed,
        });
      } else if (active) {
        this.finish(key, active, atMs, 'recovered');
      }
    }
    // El track que excedió maxMisses ya no aparece en el resultado: se contabiliza
    // como expirado, no como salida confirmada de la zona.
    for (const [key, active] of this.active) {
      if (active.cameraId === cameraId && !trackIds.has(active.trackId)) {
        // El último fotograma sin observación provocó la expiración; el tracker
        // ya no devuelve el track, pero debe contar como una pérdida más.
        active.missedFrames++;
        this.missedFramesTotal++;
        this.longestMissStreak = Math.max(this.longestMissStreak, active.missedFrames);
        this.finish(key, active, atMs, 'expired');
      }
    }
  }

  private finish(key: string, active: ActiveLoss, atMs: number, outcome: TrackingLossEpisode['outcome']): void {
    const gapMs = Math.max(0, atMs - active.startedAtMs);
    this.history.push({
      cameraId: active.cameraId, trackId: active.trackId,
      startedAtMs: active.startedAtMs, endedAtMs: atMs,
      gapMs, missedFrames: active.missedFrames, outcome,
    });
    if (outcome === 'recovered') {
      this.recoveryCount++;
      this.recoveriesMsTotal += gapMs;
    }
    this.active.delete(key);
  }

  getSummary(nowMs: number): TrackingLossSummary {
    const interruptions = this.history.length + this.active.size;
    const longestFinished = this.history.reduce((max, entry) => Math.max(max, entry.gapMs), 0);
    const longestActive = [...this.active.values()].reduce((max, loss) => Math.max(max, nowMs - loss.startedAtMs), 0);
    return {
      interruptions,
      recovered: this.recoveryCount,
      expired: this.history.length - this.recoveryCount,
      currentMissing: this.active.size,
      missedFramesTotal: this.missedFramesTotal,
      longestGapMs: Math.max(longestFinished, longestActive),
      longestMissStreak: this.longestMissStreak,
      averageRecoveredGapMs: this.recoveryCount ? this.recoveriesMsTotal / this.recoveryCount : null,
    };
  }

  getHistory(): TrackingLossEpisode[] {
    return this.history.map(entry => ({ ...entry }));
  }
}
