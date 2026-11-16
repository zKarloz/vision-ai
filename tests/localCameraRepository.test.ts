import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalCameraRepository } from '../src/infrastructure/persistence/LocalCameraRepository';
import { INITIAL_CAMERAS } from '../src/core/domain/camera';

/** Simula localStorage sin depender de jsdom en los tests de dominio. */
function installStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('vision-ai.camera-registry.v1', initial);
  vi.stubGlobal('localStorage', {
    getItem(key: string) { return map.get(key) ?? null; },
    setItem(key: string, value: string) { map.set(key, value); },
  });
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe('Adaptador de cámara local', () => {
  it('inicia con las cámaras de referencia cuando no hay configuración', () => {
    installStorage();
    expect(new LocalCameraRepository().load().map((item) => item.id)).toEqual(['CAM-01', 'CAM-02']);
  });
  it('guarda y recupera la configuración, sin compartir referencias', () => {
    installStorage();
    const repo = new LocalCameraRepository();
    repo.save(INITIAL_CAMERAS);
    expect(repo.load()).toEqual(INITIAL_CAMERAS);
  });
  it('rechaza cargas corruptas y duplicadas sin aceptar datos parciales', () => {
    installStorage('{malformado');
    expect(new LocalCameraRepository().load()).toHaveLength(2);
    installStorage(JSON.stringify([INITIAL_CAMERAS[0], INITIAL_CAMERAS[0]]));
    expect(new LocalCameraRepository().load()).toHaveLength(2);
  });
});
