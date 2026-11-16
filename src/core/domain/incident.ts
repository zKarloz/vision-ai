/** Estados explícitos según la máquina de incidentes del PDF rector. */
export type IncidentStatus = 'open' | 'acknowledged' | 'escalated' | 'closed';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Incident {
  id: string;
  cameraId: string;
  zoneId: string;
  ruleId: string;
  trackId: string;
  source: 'yolo' | 'demo';
  severity: Severity;
  status: IncidentStatus;
  confidence: number;
  openedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  closedAt?: string;
  durationSec?: number;
  /** Una pérdida de tracking NO confirma que la persona salió. */
  requiresReview: boolean;
}

export type IncidentTransition =
  | { action: 'acknowledge'; by: string; at: string }
  | { action: 'escalate'; at: string }
  | { action: 'close'; at: string }
  | { action: 'tracking-lost'; at: string };

/** Inmutable, comprobable con reloj inyectado en las pruebas. */
export function transitionIncident(incident: Incident, transition: IncidentTransition): Incident {
  if (incident.status === 'closed') throw new Error('Un incidente cerrado no admite cambios.');
  const at = Date.parse(transition.at);
  if (!Number.isFinite(at) || at < Date.parse(incident.openedAt)) throw new Error('Fecha de transición inválida.');
  switch (transition.action) {
    case 'acknowledge':
      if (!transition.by.trim()) throw new Error('Debe identificarse al supervisor.');
      if (incident.status !== 'open' && incident.status !== 'escalated') throw new Error('Incidente ya reconocido.');
      return { ...incident, status: 'acknowledged', acknowledgedAt: transition.at, acknowledgedBy: transition.by };
    case 'escalate':
      if (incident.status === 'acknowledged') throw new Error('No se escala un incidente ya reconocido.');
      return { ...incident, status: 'escalated' };
    case 'tracking-lost':
      return { ...incident, requiresReview: true };
    case 'close':
      return { ...incident, status: 'closed', closedAt: transition.at,
        durationSec: Math.max(0, (at - Date.parse(incident.openedAt)) / 1000), requiresReview: false };
  }
}

export function openIncident(data: Omit<Incident, 'status' | 'requiresReview'>): Incident {
  if (!Number.isFinite(Date.parse(data.openedAt))) throw new Error('Fecha de apertura inválida.');
  if (data.confidence < 0 || data.confidence > 1) throw new Error('Confianza inválida.');
  return { ...data, status: 'open', requiresReview: false };
}

/** Interfaz orientada a casos de uso para la misma máquina de estados pura. */
export class IncidentStateMachine {
  transition(incident: Incident, event: IncidentTransition): Incident {
    return transitionIncident(incident, event);
  }
}
