import type { Incident } from './incident';

/** La sirena sólo depende de incidentes reales sin reconocer, nunca del color de una caja. */
export function pendingAlarms(incidents: readonly Pick<Incident, 'status'>[]): number {
  return incidents.filter(item => item.status === 'open' || item.status === 'escalated').length;
}

export function shouldSound(soundEnabled: boolean, incidents: readonly Pick<Incident, 'status'>[]): boolean {
  return soundEnabled && pendingAlarms(incidents) > 0;
}
