import type { VisionTrack } from '../../domain/visualTracking';

/**
 * Semáforo visual de una detección real. El color indica la posición observada
 * frente al polígono de imagen, NO confirma por sí solo que exista un incidente.
 * Sin polígono o sin una observación vigente nunca se presenta «seguro».
 */
export function trackVisualState(track: Pick<VisionTrack, 'seen' | 'state'>) {
  if (!track.seen || track.state === 'unknown') {
    return { label: 'SIN DETECCIÓN', color: '#64748b', status: 'unknown' as const };
  }
  if (track.state === 'inside') {
    return { label: 'RESTRINGIDA', color: '#b42318', status: 'restricted' as const };
  }
  if (track.state === 'outside') {
    return { label: 'FUERA DE ZONA', color: '#167d4a', status: 'safe' as const };
  }
  return { label: 'SIN ZONA', color: '#64748b', status: 'unconfigured' as const };
}
