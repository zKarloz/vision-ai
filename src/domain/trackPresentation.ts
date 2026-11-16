import type { VisionTrack } from './visualTracking';

export type TrackPresentation = 'observed' | 'last-known' | 'hidden';

/** Control puramente visual: mostrar una caja antigua no equivale a inferir un objeto. */
export function getTrackPresentation(
  track: Pick<VisionTrack, 'seen' | 'lastSeenAt'>,
  nowMs: number,
  maxLastKnownAgeMs = 1600,
): TrackPresentation {
  if (track.seen) return 'observed';
  if (!Number.isFinite(nowMs) || !Number.isFinite(track.lastSeenAt)) return 'hidden';
  const elapsed = nowMs - track.lastSeenAt;
  if (elapsed < 0 || elapsed > maxLastKnownAgeMs) return 'hidden';
  return 'last-known';
}
