import { INITIAL_CAMERAS } from '../../core/domain/camera';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE, type Zone } from '../../core/domain/zone';
import type { ImagePoint } from '../../core/domain/spatial';
import { normalizedConfig, validateConfig, type ConfigSnapshot } from '../../application/config/configSchema';
import { readCameraPolygons } from '../persistence/LocalImageZoneRepository';

export const CONFIG_STORAGE_KEY = 'vision-ai.config.versions.v1';
export type ConfigAction = 'initial' | 'import' | 'camera' | 'zone' | 'rollback';
export interface ConfigVersion {
  number: number;
  at: string;
  actor: string;
  action: ConfigAction;
  checksum: string;
  snapshot: ConfigSnapshot;
}
export interface ConfigAudit {
  id: number;
  at: string;
  actor: string;
  action: ConfigAction | 'unchanged';
  version: number;
  checksum: string;
  details: string;
}
export interface ConfigState {
  format: 1;
  active: number;
  versions: ConfigVersion[];
  audit: ConfigAudit[];
}
export interface CommitResult { state: ConfigState; changed: boolean }

type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Huella FNV-1a de 32 bits para detectar cambios; NO equivale a una firma criptográfica. */
export function configChecksum(snapshot: ConfigSnapshot): string {
  const config = normalizedConfig(snapshot);
  // configVersion es metadato de publicación y no altera el contenido efectivo de la zona.
  const canonical = JSON.stringify({ ...config, zones: config.zones.map(({configVersion: _version, ...rest}) => rest) });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Configuración inicial, migrando registros locales de etapas previas si existen. */
function initialSnapshot(store: LocalStore): ConfigSnapshot {
  let cameras = INITIAL_CAMERAS.map(camera => ({...camera}));
  try {
    const raw = store.getItem('vision-ai.camera-registry.v1');
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const candidate = { schemaVersion: 1, cameras: parsed, zones: [STARTER_RESTRICTED_ZONE], rules: [STARTER_PERSON_RULE] };
      // Sólo importar legado que conserve las dos perspectivas obligatorias.
      cameras = validateConfig(candidate).cameras;
    }
  } catch { /* Entrada de etapa 1 corrupta: se conservan las cámaras conocidas. */ }
  let polygons: Record<'CAM-01' | 'CAM-02', ImagePoint[]>;
  try { polygons = readCameraPolygons(store); }
  catch { polygons = { 'CAM-01': [], 'CAM-02': STARTER_RESTRICTED_ZONE.polygon }; }
  const zones: Zone[] = (['CAM-01', 'CAM-02'] as const).flatMap(id => {
    if (polygons[id].length === 0) return [];
    return [{ ...STARTER_RESTRICTED_ZONE, id: `Z-VIS-${id}`, cameraId: id,
      name: id === 'CAM-02' ? STARTER_RESTRICTED_ZONE.name : `Zona restringida ${id}`,
      polygon: polygons[id] }];
  });
  const rules = zones.map(zone => ({ ...STARTER_PERSON_RULE, id: `R-PERSON-${zone.cameraId}`, zoneId: zone.id }));
  return validateConfig({ schemaVersion: 1, cameras, zones, rules });
}

/**
 * Guardado atómico local: UNA sola clave contiene versión, contenido y auditoría.
 * No emplea credenciales de Supabase ni simula escrituras remotas.
 */
export class VersionedLocalConfigRepository {
  constructor(private readonly storage: LocalStore, private readonly now: () => Date = () => new Date()) {}

  load(): ConfigState {
    const raw = this.storage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      const snapshot = initialSnapshot(this.storage);
      const stamp = this.now().toISOString();
      const checksum = configChecksum(snapshot);
      const state: ConfigState = { format: 1, active: 1,
        versions: [{ number: 1, at: stamp, actor: 'Sistema local', action: 'initial', checksum, snapshot }],
        audit: [{ id: 1, at: stamp, actor: 'Sistema local', action: 'initial', version: 1, checksum, details: 'Migración inicial o datos semilla' }],
      };
      this.persist(state);
      return state;
    }
    let stored: ConfigState;
    try { stored = JSON.parse(raw) as ConfigState; }
    catch { throw new Error('El historial de configuración está corrupto. No se modificó ningún dato.'); }
    if (stored?.format !== 1 || !Array.isArray(stored.versions) || !Array.isArray(stored.audit) ||
      !stored.versions.some(v => v.number === stored.active)) throw new Error('El historial local tiene un formato inválido; exporta una copia antes de modificarlo.');
    for (const version of stored.versions) {
      const valid = validateConfig(version.snapshot);
      if (configChecksum(valid) !== version.checksum) throw new Error(`Checksum inválido en la versión ${version.number}; no se aplicaron cambios.`);
    }
    return stored;
  }

  current(state = this.load()): ConfigVersion {
    const active = state.versions.find(version => version.number === state.active);
    if (!active) throw new Error('No existe la versión activa de configuración.');
    return active;
  }

  /** Toda validación ocurre antes de setItem: sin escrituras parciales. */
  commit(candidate: unknown, action: ConfigAction, actor = 'Administrador local', details = ''): CommitResult {
    const input = normalizedConfig(validateConfig(candidate));
    const state = this.load();
    const checksum = configChecksum(input);
    const latest = this.current(state);
    if (checksum === latest.checksum) {
      // Se audita también la carga repetida, sin crear otra versión de datos.
      const stamp = this.now().toISOString();
      const auditId = (state.audit.at(-1)?.id ?? 0) + 1;
      // Mantener el tipo de acción literal: en un array con spread TS puede ampliarlo a `string`.
      const auditEntry: ConfigAudit = {
        id: auditId, at: stamp, actor, action: 'unchanged', version: state.active,
        checksum, details: `Operación ${action} idempotente: sin cambios`,
      };
      const next: ConfigState = { ...state, audit: [...state.audit, auditEntry].slice(-100) };
      this.persist(next);
      return { state: next, changed: false };
    }
    const number = Math.max(...state.versions.map(v => v.number)) + 1;
    const snapshot = validateConfig({ ...input, zones: input.zones.map(zone => ({ ...zone, configVersion: number })) });
    const stamp = this.now().toISOString();
    const auditId = (state.audit.at(-1)?.id ?? 0) + 1;
    const next: ConfigState = { format: 1, active: number,
      versions: [...state.versions, { number, at: stamp, actor, action, checksum, snapshot }].slice(-20),
      audit: [...state.audit, { id: auditId, at: stamp, actor, action, version: number,
        checksum, details: details || `Configuración publicada como v${number}` }].slice(-100),
    };
    // La verificación posterior se hace sobre la misma representación que se persistirá.
    if (configChecksum(this.current(next).snapshot) !== checksum) throw new Error('La verificación del contenido no coincide.');
    this.persist(next);
    return { state: next, changed: true };
  }

  rollback(target: number, actor = 'Administrador local'): CommitResult {
    const current = this.load();
    const version = current.versions.find(item => item.number === target);
    if (!version) throw new Error(`La versión ${target} no existe en el historial conservado.`);
    return this.commit(version.snapshot, 'rollback', actor, `Reversión al contenido de v${target}`);
  }

  private persist(state: ConfigState) {
    // Ante QuotaExceeded o bloqueo, se informa el error y el contenido previo sigue activo.
    this.storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state));
  }
}
