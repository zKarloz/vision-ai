import { describe, expect, it } from 'vitest';
import { INITIAL_CAMERAS } from '../src/core/domain/camera';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import { ConfigValidationError, validateConfig } from '../src/application/config/configSchema';
import { CONFIG_STORAGE_KEY, VersionedLocalConfigRepository, configChecksum } from '../src/infrastructure/config/VersionedLocalConfigRepository';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const store = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
  return { map, store };
}
const sample = () => ({ schemaVersion: 1, cameras: INITIAL_CAMERAS, zones: [STARTER_RESTRICTED_ZONE], rules: [STARTER_PERSON_RULE] });
const clock = () => new Date('2026-11-14T12:00:00.000Z');

describe('Etapa 3 · carga validada', () => {
  it('carga semilla íntegra en una única clave con versión y auditoría', () => {
    const {map, store} = memoryStorage();
    const repository = new VersionedLocalConfigRepository(store, clock);
    const data = repository.load();
    expect(data.active).toBe(1);
    expect(data.versions[0].snapshot.cameras.map(c => c.id)).toEqual(['CAM-01', 'CAM-02']);
    expect(data.versions[0].snapshot.zones).toHaveLength(1);
    expect(data.audit).toHaveLength(1);
    expect(map.has(CONFIG_STORAGE_KEY)).toBe(true);
  });
  it('rechaza polígonos con coordenadas mayores que uno y no cambia la versión', () => {
    const { map, store } = memoryStorage();
    const repo = new VersionedLocalConfigRepository(store, clock);
    repo.load();
    const before = map.get(CONFIG_STORAGE_KEY);
    const broken = sample();
    broken.zones = [{...STARTER_RESTRICTED_ZONE, polygon: [{x:1.2,y:0.2}, ...STARTER_RESTRICTED_ZONE.polygon.slice(1)]}];
    expect(() => repo.commit(broken, 'import')).toThrow(ConfigValidationError);
    expect(map.get(CONFIG_STORAGE_KEY)).toBe(before);
  });
  it('valida las referencias cruzadas, duplicados y las vistas físicas fijas', () => {
    expect(() => validateConfig({ ...sample(), cameras: [INITIAL_CAMERAS[0], INITIAL_CAMERAS[0]] })).toThrow(/duplicado/i);
    expect(() => validateConfig({ ...sample(), rules: [{...STARTER_PERSON_RULE, zoneId:'INEXISTENTE'}] })).toThrow(/no existe/i);
    expect(() => validateConfig({ ...sample(), cameras: [INITIAL_CAMERAS[0]] })).toThrow(/CAM-02/);
  });
  it('reimportar la misma configuración es idempotente y no crea versiones nuevas', () => {
    const {store} = memoryStorage();
    const repo = new VersionedLocalConfigRepository(store, clock);
    const changed = sample();
    changed.cameras = sample().cameras.map(c => ({...c, name: c.id === 'CAM-01' ? 'Zona de despacho' : c.name}));
    const first = repo.commit(changed, 'import');
    const again = repo.commit(changed, 'import');
    expect(first.changed).toBe(true);
    expect(again.changed).toBe(false);
    expect(again.state.versions).toHaveLength(2);
  });
  it('permite revertir sin borrar el historial original y comprueba el checksum', () => {
    const { map, store } = memoryStorage();
    const repo = new VersionedLocalConfigRepository(store, clock);
    const original = repo.load();
    const changed = {...repo.current(original).snapshot, cameras: original.versions[0].snapshot.cameras.map(c => ({...c, name: c.id === 'CAM-01' ? 'Almacén actualizado' : c.name}))};
    const next = repo.commit(changed, 'camera');
    expect(next.state.active).toBe(2);
    const restored = repo.rollback(1);
    expect(restored.changed).toBe(true);
    expect(restored.state.active).toBe(3);
    expect(repo.current(restored.state).snapshot.cameras[0].name).toBe('Almacén central');
    const broken = JSON.parse(map.get(CONFIG_STORAGE_KEY)!) as { versions: Array<{checksum:string}> };
    broken.versions[0].checksum = '00000000';
    map.set(CONFIG_STORAGE_KEY, JSON.stringify(broken));
    expect(() => repo.load()).toThrow(/Checksum inválido/);
  });
  it('el hash no depende del orden de cámaras o reglas ni de configVersion', () => {
    const config = validateConfig(sample());
    const same = { ...config, cameras: [...config.cameras].reverse(), zones: config.zones.map(zone => ({...zone, configVersion: 42})) };
    expect(configChecksum(same)).toBe(configChecksum(config));
  });
  it('migra los registros de cámaras y zonas de las etapas 1 y 2', () => {
    const legacy = { 'vision-ai.camera-registry.v1': JSON.stringify(INITIAL_CAMERAS),
      'vision-ai-visual-zones-stage2': JSON.stringify({'CAM-01': [], 'CAM-02': []}) };
    const repo = new VersionedLocalConfigRepository(memoryStorage(legacy).store, clock);
    expect(repo.current().snapshot.zones).toHaveLength(0);
    expect(repo.current().snapshot.rules).toHaveLength(0);
  });
});
