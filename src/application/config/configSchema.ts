import { z } from 'zod';
import { CAMERA_SOURCE_TYPES, type Camera } from '../../core/domain/camera';
import { validateVirtualCameraPose, validateVirtualCameraSweep } from '../../core/domain/virtualCameraPose';
import { validateImagePolygon } from '../../core/domain/spatial';
import type { SafetyRule, Zone } from '../../core/domain/zone';

/** Carga formal según la sección 7 del PDF: esquema + semántica, sin dependencias UI. */
const dateTime = z.string().datetime({ offset: true });
const id = z.string().trim().min(1).max(80);
const virtualPoseSchema = z.object({
  x: z.number().finite(), y: z.number().finite(), z: z.number().finite(),
  targetX: z.number().finite(), targetY: z.number().finite(), targetZ: z.number().finite(),
  fov: z.number().finite(),
}).strict().superRefine((pose, ctx) => {
  for (const problem of validateVirtualCameraPose(pose)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }
});
const virtualSweepSchema = z.object({
  mode: z.literal('sweep'),
  amplitudeDeg: z.number().finite(),
  periodSec: z.number().finite(),
}).strict().superRefine((value, ctx) => {
  for (const error of validateVirtualCameraSweep(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
});
const cameraSchema = z.object({
  id: id.regex(/^CAM-[A-Za-z0-9-]+$/, 'Identificador de cámara inválido.'),
  name: z.string().trim().min(3).max(60),
  location: z.string().trim().min(3).max(100),
  sourceType: z.enum(CAMERA_SOURCE_TYPES),
  virtualPose: virtualPoseSchema.optional(),
  virtualSweep: virtualSweepSchema.optional(),
  enabled: z.boolean(),
  createdAt: dateTime,
  updatedAt: dateTime,
}).strict().superRefine((camera, ctx) => {
  if (camera.sourceType !== 'virtual-3d' && camera.virtualSweep !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['virtualSweep'], message: 'Una fuente externa no admite barrido 3D.' });
  }
  if (camera.sourceType !== 'virtual-3d' && camera.virtualPose !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['virtualPose'], message: 'Una fuente externa no puede tener perspectiva 3D.' });
  }
});
const pointSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
const zoneSchema = z.object({
  id, cameraId: id, name: z.string().trim().min(3).max(100),
  type: z.enum(['restricted', 'caution', 'free']),
  polygon: z.array(pointSchema).min(3).max(16),
  configVersion: z.number().int().positive(),
  enabled: z.boolean(),
}).strict().superRefine((zone, ctx) => {
  const error = validateImagePolygon(zone.polygon);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['polygon'], message: error });
});
const ruleSchema = z.object({
  id, zoneId: id,
  classId: z.enum(['person', 'cone', 'helmet', 'vest']),
  name: z.string().trim().min(3).max(100),
  minConfidence: z.number().finite().min(0).max(1),
  minFrames: z.number().int().positive().max(30),
  exitFrames: z.number().int().positive().max(30),
  cooldownSec: z.number().finite().min(0).max(3600),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  enabled: z.boolean(),
}).strict();

export const configSchema = z.object({
  schemaVersion: z.literal(1),
  cameras: z.array(cameraSchema).min(2).max(100),
  zones: z.array(zoneSchema).max(250),
  rules: z.array(ruleSchema).max(500),
}).strict().superRefine((config, ctx) => {
  const unique = (values: readonly {id: string}[], field: string) => {
    const seen = new Set<string>();
    values.forEach((value, i) => {
      if (seen.has(value.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field, i, 'id'], message: `Identificador duplicado: ${value.id}` });
      seen.add(value.id);
    });
  };
  unique(config.cameras, 'cameras'); unique(config.zones, 'zones'); unique(config.rules, 'rules');
  const cameraIds = new Set(config.cameras.map(c => c.id));
  const zoneIds = new Set(config.zones.map(zone => zone.id));
  config.zones.forEach((zone, i) => {
    if (!cameraIds.has(zone.cameraId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zones', i, 'cameraId'], message: `La cámara ${zone.cameraId} no existe.` });
  });
  config.rules.forEach((rule, i) => {
    if (!zoneIds.has(rule.zoneId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', i, 'zoneId'], message: `La zona ${rule.zoneId} no existe.` });
  });
  // Las dos perspectivas semilla siguen protegidas para importar configuraciones anteriores.
  for (const required of ['CAM-01', 'CAM-02']) {
    const camera = config.cameras.find(item => item.id === required);
    if (!camera) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cameras'], message: `No puede faltar ${required}: es una perspectiva fija del mundo 3D.` });
    else if (camera.sourceType !== 'virtual-3d') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cameras', config.cameras.indexOf(camera), 'sourceType'], message: `${required} debe seguir vinculada al mundo 3D.` });
  }
});

export type ConfigSnapshot = { schemaVersion: 1; cameras: Camera[]; zones: Zone[]; rules: SafetyRule[] };

/** Errores legibles por campo: la operación se rechaza íntegra antes de persistir. */
export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) { super(issues.join('\n')); this.name = 'ConfigValidationError'; }
}

export function validateConfig(data: unknown): ConfigSnapshot {
  const result = configSchema.safeParse(data);
  if (!result.success) throw new ConfigValidationError(result.error.issues.map(issue =>
    `${issue.path.length ? issue.path.join('.') : 'configuración'}: ${issue.message}`));
  return result.data;
}

/** El orden del JSON no debe crear versiones nuevas con datos idénticos. */
export function normalizedConfig(data: ConfigSnapshot): ConfigSnapshot {
  return {
    schemaVersion: 1,
    cameras: [...data.cameras].sort((a, b) => a.id.localeCompare(b.id)),
    zones: [...data.zones].sort((a, b) => a.id.localeCompare(b.id)),
    rules: [...data.rules].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
