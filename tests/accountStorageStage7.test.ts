import { describe, expect, it } from 'vitest';
import { IncidentCenter, INCIDENT_STORAGE_KEY } from '../src/application/incidents/IncidentCenter';
import { ReportCenter, REPORT_STORAGE_KEY } from '../src/application/reports/ReportCenter';
import { CONFIG_STORAGE_KEY } from '../src/infrastructure/config/VersionedLocalConfigRepository';
import {
  accountStorageKey, createAccountScopedStorage, migrateLegacyAccountData,
  PRIVATE_STORAGE_KEYS, type KeyValueStorage,
} from '../src/infrastructure/persistence/AccountScopedStorage';

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function memoryStore(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  const storage: KeyValueStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

/** Reproduce el formato persistido por el centro sin inventar detecciones YOLO. */
function storedIncidents(id: string): string {
  return JSON.stringify({
    incidents: [{ id, sourceKey: `CAM-02:track:${id}`, cameraId: 'CAM-02', zoneId: 'Z-VIS-CAM-02',
      ruleId: 'RULE', trackId: '1', source: 'yolo', severity: 'high', status: 'closed',
      confidence: 0.9, openedAt: '2026-11-16T22:00:00Z', closedAt: '2026-11-16T22:00:02Z',
      requiresReview: false }],
    audit: [], sequence: 5, auditSequence: 1,
  });
}

describe('Etapa 7: privacidad del almacenamiento por cuenta', () => {
  it('usa claves por usuario con formato válido y rechaza IDs arbitrarios', () => {
    expect(accountStorageKey(userA, INCIDENT_STORAGE_KEY)).toContain(userA);
    expect(accountStorageKey(userB, INCIDENT_STORAGE_KEY)).not.toBe(accountStorageKey(userA, INCIDENT_STORAGE_KEY));
    expect(() => accountStorageKey('../../local', INCIDENT_STORAGE_KEY)).toThrow();
    expect(() => createAccountScopedStorage(memoryStore().storage, 'invalido')).toThrow();
  });

  it('aísla los incidentes de dos cuentas en el mismo navegador', () => {
    const shared = memoryStore();
    const alice = createAccountScopedStorage(shared.storage, userA);
    alice.setItem(INCIDENT_STORAGE_KEY, storedIncidents('INC-000004'));
    expect(new IncidentCenter(alice).getSnapshot().incidents).toHaveLength(1);
    const bob = createAccountScopedStorage(shared.storage, userB);
    expect(new IncidentCenter(bob).getSnapshot().incidents).toHaveLength(0);
    bob.setItem(INCIDENT_STORAGE_KEY, storedIncidents('INC-000001'));
    expect(new IncidentCenter(alice).getSnapshot().incidents[0].id).toBe('INC-000004');
    expect(new IncidentCenter(bob).getSnapshot().incidents[0].id).toBe('INC-000001');
  });

  it('separa bandejas de reportes y configuraciones de cuentas distintas', () => {
    const shared = memoryStore();
    const a = createAccountScopedStorage(shared.storage, userA);
    a.setItem(REPORT_STORAGE_KEY, 'reportes-A');
    a.setItem(CONFIG_STORAGE_KEY, 'config-A');
    const b = createAccountScopedStorage(shared.storage, userB);
    expect(b.getItem(REPORT_STORAGE_KEY)).toBeNull();
    expect(b.getItem(CONFIG_STORAGE_KEY)).toBeNull();
    b.setItem(REPORT_STORAGE_KEY, 'reportes-B');
    expect(a.getItem(REPORT_STORAGE_KEY)).toBe('reportes-A');
    expect(new ReportCenter(b).getSnapshot().reports).toHaveLength(0);
  });

  it('mantiene el mismo historial tras recargar con la misma identidad', () => {
    const shared = memoryStore();
    createAccountScopedStorage(shared.storage, userA).setItem(INCIDENT_STORAGE_KEY, storedIncidents('INC-000015'));
    const reloaded = createAccountScopedStorage(shared.storage, userA);
    expect(new IncidentCenter(reloaded).getSnapshot().incidents[0].id).toBe('INC-000015');
  });

  it('migra el historial global anterior a la primera cuenta administradora', () => {
    const shared = memoryStore({
      [INCIDENT_STORAGE_KEY]: storedIncidents('INC-000004'),
      [REPORT_STORAGE_KEY]: 'reportes-v1.9.1',
      [CONFIG_STORAGE_KEY]: 'config-v1.9.1',
    });
    const a = createAccountScopedStorage(shared.storage, userA);
    expect(new IncidentCenter(a).getSnapshot().incidents[0].id).toBe('INC-000004');
    expect(a.getItem(REPORT_STORAGE_KEY)).toBe('reportes-v1.9.1');
    expect(a.getItem(CONFIG_STORAGE_KEY)).toBe('config-v1.9.1');
    expect(shared.values.get('vision-ai:legacy-data-owner:v1')).toBe(userA);
  });

  it('nunca importa el historial heredado a una segunda cuenta', () => {
    const shared = memoryStore({ [INCIDENT_STORAGE_KEY]: storedIncidents('INC-000004') });
    createAccountScopedStorage(shared.storage, userA);
    const b = createAccountScopedStorage(shared.storage, userB);
    expect(b.getItem(INCIDENT_STORAGE_KEY)).toBeNull();
    expect(new IncidentCenter(b).getSnapshot().incidents).toHaveLength(0);
  });

  it('no sobrescribe los datos del usuario cuando se repite una migración', () => {
    const shared = memoryStore({ [INCIDENT_STORAGE_KEY]: storedIncidents('INC-000004') });
    const a = createAccountScopedStorage(shared.storage, userA);
    a.setItem(INCIDENT_STORAGE_KEY, storedIncidents('INC-000008'));
    expect(migrateLegacyAccountData(shared.storage, userA)).toBe(0);
    expect(new IncidentCenter(createAccountScopedStorage(shared.storage, userA)).getSnapshot().incidents[0].id).toBe('INC-000008');
  });

  it('migra las claves legadas de zonas y cámaras sin compartirlas', () => {
    const keys = PRIVATE_STORAGE_KEYS.slice(3);
    const shared = memoryStore(Object.fromEntries(keys.map((key, i) => [key, `legacy-${i}`])));
    const a = createAccountScopedStorage(shared.storage, userA);
    const b = createAccountScopedStorage(shared.storage, userB);
    keys.forEach((key, i) => { expect(a.getItem(key)).toBe(`legacy-${i}`); expect(b.getItem(key)).toBeNull(); });
  });

  it('no marca la migración como completada si el navegador rechaza una escritura', () => {
    const shared = memoryStore({ [INCIDENT_STORAGE_KEY]: 'antiguo' });
    let fail = true;
    const rejecting: KeyValueStorage = {
      getItem: shared.storage.getItem,
      setItem: (key, value) => {
        if (fail) throw new Error('Cuota excedida');
        shared.storage.setItem(key, value);
      },
    };
    expect(() => createAccountScopedStorage(rejecting, userA)).toThrow('Cuota excedida');
    expect(shared.values.get('vision-ai:legacy-data-owner:v1')).toBeUndefined();
    fail = false;
    expect(createAccountScopedStorage(rejecting, userA).getItem(INCIDENT_STORAGE_KEY)).toBe('antiguo');
  });

  it('resiste migraciones parciales sin sobrescribir los cambios ya guardados', () => {
    const shared = memoryStore({ [INCIDENT_STORAGE_KEY]: 'viejo', [REPORT_STORAGE_KEY]: 'viejo-reporte' });
    const scopedKey = accountStorageKey(userA, INCIDENT_STORAGE_KEY);
    shared.storage.setItem(scopedKey, 'nuevo');
    const a = createAccountScopedStorage(shared.storage, userA);
    expect(a.getItem(INCIDENT_STORAGE_KEY)).toBe('nuevo');
    expect(a.getItem(REPORT_STORAGE_KEY)).toBe('viejo-reporte');
  });

  it('una sesión nueva sin datos legados comienza con registros vacíos', () => {
    const shared = memoryStore();
    expect(new IncidentCenter(createAccountScopedStorage(shared.storage, userA)).getSnapshot().incidents).toEqual([]);
    expect(new ReportCenter(createAccountScopedStorage(shared.storage, userA)).getSnapshot().reports).toEqual([]);
  });
});
