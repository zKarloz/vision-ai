import { validateImagePolygon, type ImagePoint } from './spatial';

/** Tipos de área establecidos por la especificación VISION AI v2.0. */
export type ZoneType = 'restricted' | 'caution' | 'free';

/** Polígono relativo a la imagen de una cámara, nunca a posiciones del mundo 3D. */
export interface Zone {
  id: string;
  cameraId: string;
  name: string;
  type: ZoneType;
  polygon: ImagePoint[];
  configVersion: number;
  enabled: boolean;
}

export interface SafetyRule {
  id: string;
  zoneId: string;
  classId: 'person' | 'cone' | 'helmet' | 'vest';
  name: string;
  minConfidence: number;
  minFrames: number;
  exitFrames: number;
  cooldownSec: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

/** Validación de objetos de dominio; la carga versionada formal llega en etapa 3. */
export function validateZone(zone: Zone): string[] {
  const errors: string[] = [];
  if (!zone.id.trim() || !zone.cameraId.trim() || !zone.name.trim()) errors.push('La zona requiere identificador, cámara y nombre.');
  if (!(['restricted', 'caution', 'free'] as const).includes(zone.type)) errors.push('Tipo de zona desconocido.');
  if (!Number.isInteger(zone.configVersion) || zone.configVersion < 1) errors.push('La versión debe ser un entero positivo.');
  const polygonError = validateImagePolygon(zone.polygon);
  if (polygonError) errors.push(polygonError);
  return errors;
}

export function validateSafetyRule(rule: SafetyRule): string[] {
  const errors: string[] = [];
  if (!rule.id.trim() || !rule.zoneId.trim()) errors.push('La regla necesita identificador y zona.');
  if (!Number.isFinite(rule.minConfidence) || rule.minConfidence < 0 || rule.minConfidence > 1) errors.push('La confianza debe estar entre 0 y 1.');
  if (!Number.isInteger(rule.minFrames) || rule.minFrames < 1) errors.push('La confirmación necesita al menos un fotograma.');
  if (!Number.isInteger(rule.exitFrames) || rule.exitFrames < 1) errors.push('La salida necesita al menos un fotograma.');
  if (!Number.isFinite(rule.cooldownSec) || rule.cooldownSec < 0) errors.push('Cooldown inválido.');
  return errors;
}

/** Configuración inicial de CAM-02 basada en la evidencia visual aportada por el usuario. */
export const STARTER_RESTRICTED_ZONE: Zone = {
  id: 'Z-VIS-CAM-02', cameraId: 'CAM-02', name: 'Zona restringida - maquinaria',
  type: 'restricted', configVersion: 1, enabled: true,
  polygon: [
    { x: 0.30394307923771313, y: 0.7116349047141425 },
    { x: 0.46241850551654967, y: 0.4263206285523236 },
    { x: 0.7733513039117352, y: 0.5065613507188231 },
    { x: 0.6890985456369108, y: 0.8489217652958877 },
  ],
};

export const STARTER_PERSON_RULE: SafetyRule = {
  id: 'R-PERSON-RESTRICTED', zoneId: STARTER_RESTRICTED_ZONE.id,
  classId: 'person', name: 'Persona en zona restringida',
  minConfidence: 0.25, minFrames: 3, exitFrames: 2, cooldownSec: 5,
  severity: 'high', enabled: true,
};
