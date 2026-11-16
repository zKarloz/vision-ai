import type { NormalizedBoundingBox } from './ZoneEvaluator';
import type { Severity } from './incident';

/** Catálogo del dominio; las clases 3D no se confunden con clases reconocidas por YOLO. */
export interface ObjectClass {
  id: string;
  label: 'person' | 'cone' | 'helmet' | 'vest';
  minConfidence: number;
  enabled: boolean;
}
export interface Frame { frameId: string; cameraId: string; timestamp: string }
export interface Detection {
  id: string;
  frameId: string;
  classId: string;
  confidence: number;
  box: NormalizedBoundingBox;
  trackId?: string;
}
export interface Track {
  id: string;
  cameraId: string;
  classId: string;
  firstSeenAt: string;
  lastSeenAt: string;
}
export interface Alarm {
  id: string;
  incidentId: string;
  type: 'caution' | 'violation';
  startedAt: string;
  silencedAt?: string;
  silencedBy?: string;
}
export interface Report {
  id: string;
  type: 'incident' | 'shift' | 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  format: 'pdf' | 'csv' | 'json';
  generatedAt?: string;
}
export interface ReportSchedule { id: string; type: Report['type']; cron: string; recipients: string[]; enabled: boolean }
export interface User { id: string; name: string; role: 'administrator' | 'operator' | 'supervisor' | 'auditor' }
export interface DomainEvent {
  id: string;
  kind: 'person-entered-restricted-zone' | 'caution-cone-detected' | 'incident-opened' | 'incident-acknowledged' | 'incident-closed';
  cameraId: string;
  severity: Severity;
  occurredAt: string;
}
