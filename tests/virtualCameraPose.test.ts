import { describe, expect, it } from 'vitest';
import { INITIAL_CAMERAS } from '../src/core/domain/camera';
import { registerCamera, updateCamera } from '../src/application/cameras/CameraRegistry';
import { validateConfig } from '../src/application/config/configSchema';
import { DEFAULT_VIRTUAL_POSES, NEW_VIRTUAL_POSE, validateVirtualCameraPose, virtualPoseFor } from '../src/core/domain/virtualCameraPose';
import { VersionedLocalConfigRepository } from '../src/infrastructure/config/VersionedLocalConfigRepository';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';

const date = new Date('2026-11-14T14:00:00.000Z');
const base = () => ({ schemaVersion: 1, cameras: INITIAL_CAMERAS, zones: [STARTER_RESTRICTED_ZONE], rules: [STARTER_PERSON_RULE] });
const draft = { name: 'Tercer ángulo', location: 'Muelles', sourceType: 'virtual-3d' as const, enabled: true, virtualPose: { ...NEW_VIRTUAL_POSE } };

function memoryStore() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
}

describe('Etapa 4 · perspectivas 3D dinámicas', () => {
  it('conserva los ángulos originales sin pose explícita (compatibilidad v1.4.1)', () => {
    expect(virtualPoseFor('CAM-01')).toEqual(DEFAULT_VIRTUAL_POSES['CAM-01']);
    expect(virtualPoseFor('CAM-02')).toEqual(DEFAULT_VIRTUAL_POSES['CAM-02']);
  });
  it('registra CAM-03 con pose propia sin duplicar mundo', () => {
    const cameras = registerCamera(INITIAL_CAMERAS, draft, date);
    expect(cameras).toHaveLength(3);
    expect(cameras[2]).toMatchObject({ id: 'CAM-03', sourceType: 'virtual-3d', virtualPose: NEW_VIRTUAL_POSE });
    expect(INITIAL_CAMERAS).toHaveLength(2);
  });
  it('edita solo el registro correspondiente', () => {
    const cameras = registerCamera(INITIAL_CAMERAS, draft, date);
    const changed = updateCamera(cameras, 'CAM-03', { ...draft, virtualPose: { ...NEW_VIRTUAL_POSE, fov: 70 } }, date);
    expect(changed[2].virtualPose?.fov).toBe(70);
    expect(cameras[2].virtualPose?.fov).toBe(50);
  });
  it('rechaza distancia degenerada y valores fuera de rango', () => {
    expect(validateVirtualCameraPose({ ...NEW_VIRTUAL_POSE, fov: 180 })).not.toHaveLength(0);
    expect(validateVirtualCameraPose({ ...NEW_VIRTUAL_POSE, x: 0, y: 1, z: 0, targetX: 0, targetY: 1, targetZ: 0 })).not.toHaveLength(0);
  });
  it('valida la importación con un nuevo ángulo 3D', () => {
    const cameras = registerCamera(INITIAL_CAMERAS, draft, date);
    const valid = validateConfig({ ...base(), cameras });
    expect(valid.cameras[2].virtualPose?.fov).toBe(50);
    const invalid = cameras.map(c => c.id === 'CAM-03' ? { ...c, virtualPose: { ...NEW_VIRTUAL_POSE, x: 999 } } : c);
    expect(() => validateConfig({ ...base(), cameras: invalid })).toThrow(/x debe estar/);
  });
  it('no permite incluir poses 3D en cámaras MP4', () => {
    const cameras = [...INITIAL_CAMERAS, { ...INITIAL_CAMERAS[0], id: 'CAM-03', sourceType: 'video-loop', virtualPose: NEW_VIRTUAL_POSE }];
    expect(() => validateConfig({ ...base(), cameras })).toThrow(/fuente externa|perspectiva 3D/i);
  });
  it('versiona la pose y preserva los dos ángulos originales', () => {
    const repo = new VersionedLocalConfigRepository(memoryStore(), () => date);
    repo.load();
    const next = repo.commit({ ...base(), cameras: registerCamera(INITIAL_CAMERAS, draft, date) }, 'camera');
    expect(next.state.active).toBe(2);
    expect(repo.current().snapshot.cameras).toHaveLength(3);
    expect(repo.commit(repo.current().snapshot, 'import').changed).toBe(false);
  });
});
