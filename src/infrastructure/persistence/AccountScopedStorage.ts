import { INCIDENT_STORAGE_KEY } from '../../application/incidents/IncidentCenter';
import { REPORT_STORAGE_KEY } from '../../application/reports/ReportCenter';
import { CONFIG_STORAGE_KEY } from '../config/VersionedLocalConfigRepository';

/** Contrato mínimo inyectable: también permite pruebas sin navegador. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'vision-ai:account-data:v1:';
const LEGACY_OWNER_KEY = 'vision-ai:legacy-data-owner:v1';

/** Incluye la configuración y los polígonos de versiones anteriores para migración. */
export const PRIVATE_STORAGE_KEYS = [
  INCIDENT_STORAGE_KEY,
  REPORT_STORAGE_KEY,
  CONFIG_STORAGE_KEY,
  'vision-ai.camera-registry.v1',
  'vision-ai-visual-zones-stage2',
  'vision-ai-image-zones-v03',
] as const;

/** Nunca aceptar un identificador arbitrario como prefijo de almacenamiento. */
export function accountStorageKey(userId: string, key: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('Identidad de almacenamiento inválida.');
  }
  return `${PREFIX}${userId}:${key}`;
}

/**
 * Copia los datos heredados UNA VEZ a la primera cuenta administradora autorizada.
 * El indicador de propietario solo se escribe tras copiar todas las claves con éxito:
 * un fallo de cuota no deja una migración falsamente completada.
 * Nunca importa datos legados a una segunda cuenta del mismo navegador.
 */
export function migrateLegacyAccountData(storage: KeyValueStorage, userId: string): number {
  accountStorageKey(userId, INCIDENT_STORAGE_KEY); // Valida la identidad antes de acceder a datos.
  const owner = storage.getItem(LEGACY_OWNER_KEY);
  if (owner && owner !== userId) return 0;

  let copied = 0;
  let hasLegacy = false;
  for (const key of PRIVATE_STORAGE_KEYS) {
    const original = storage.getItem(key);
    if (original === null) continue;
    hasLegacy = true;
    const scoped = accountStorageKey(userId, key);
    // Si existe un estado más nuevo, la migración jamás debe sobrescribirlo.
    if (storage.getItem(scoped) !== null) continue;
    storage.setItem(scoped, original);
    copied++;
  }
  if (hasLegacy && !owner) storage.setItem(LEGACY_OWNER_KEY, userId);
  return copied;
}

/**
 * Devuelve una vista que SOLO lee/escribe datos de la identidad verificada.
 * No cambia la clave de sesión Supabase, tema ni checkpoint remoto; estos
 * siguen gestionados por sus módulos respectivos.
 */
export function createAccountScopedStorage(storage: KeyValueStorage, userId: string): KeyValueStorage {
  accountStorageKey(userId, INCIDENT_STORAGE_KEY);
  migrateLegacyAccountData(storage, userId);
  return {
    getItem(key: string) { return storage.getItem(accountStorageKey(userId, key)); },
    setItem(key: string, value: string) { storage.setItem(accountStorageKey(userId, key), value); },
  };
}
