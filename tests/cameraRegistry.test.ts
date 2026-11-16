import { describe, expect, it } from 'vitest';
import { INITIAL_CAMERAS, nextCameraId, summarizeCameras, validateCameraDraft } from '../src/core/domain/camera';
import { registerCamera, removeCamera, setCameraEnabled, updateCamera } from '../src/application/cameras/CameraRegistry';

const draft = { name: 'Muelle 3', location: 'Zona de descarga', sourceType: 'video-loop' as const, enabled: true };
const date = new Date('2026-11-14T12:00:00Z');

describe('Registro de cámaras de Etapa 1', () => {
  it('calcula el próximo ID a partir de los registros existentes', () => {
    expect(nextCameraId(INITIAL_CAMERAS)).toBe('CAM-03');
    expect(nextCameraId([...INITIAL_CAMERAS, { ...INITIAL_CAMERAS[0], id: 'CAM-07' }])).toBe('CAM-08');
  });
  it('registra cámaras con metadatos normalizados', () => {
    const cameras = registerCamera(INITIAL_CAMERAS, { ...draft, name: '  Muelle 3  ' }, date);
    expect(cameras).toHaveLength(3);
    expect(cameras[2]).toMatchObject({ id: 'CAM-03', name: 'Muelle 3', sourceType: 'video-loop' });
    expect(cameras[2].createdAt).toBe(date.toISOString());
    expect(summarizeCameras(cameras)).toMatchObject({ total: 3, enabled: 3, virtual: 2, other: 1 });
  });
  it('rechaza entradas inválidas sin alterar el origen', () => {
    expect(validateCameraDraft({ ...draft, name: '' })).toHaveLength(1);
    expect(() => registerCamera(INITIAL_CAMERAS, { ...draft, location: '' })).toThrow();
    expect(INITIAL_CAMERAS).toHaveLength(2);
  });
  it('actualiza, habilita y elimina registros de forma inmutable', () => {
    const cameras = registerCamera(INITIAL_CAMERAS, draft, date);
    const changed = updateCamera(cameras, 'CAM-03', { ...draft, name: 'Muelle 4' }, date);
    const disabled = setCameraEnabled(changed, 'CAM-03', false, date);
    expect(disabled[2].name).toBe('Muelle 4');
    expect(disabled[2].enabled).toBe(false);
    expect(cameras[2].name).toBe('Muelle 3');
    expect(removeCamera(disabled, 'CAM-03')).toHaveLength(2);
    expect(() => removeCamera(cameras, 'CAM-99')).toThrow('Cámara no encontrada');
  });
});
