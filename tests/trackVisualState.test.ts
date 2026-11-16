import { describe, expect, it } from 'vitest';
import { trackVisualState } from '../src/modules/monitoring/trackVisualState';

describe('Semáforo de etiquetas YOLO', () => {
  it('usa verde para observación fuera de la zona', () => {
    expect(trackVisualState({ seen: true, state: 'outside' })).toMatchObject({ status: 'safe', color: '#167d4a' });
  });
  it('usa rojo cuando el pie detectado entra al polígono', () => {
    expect(trackVisualState({ seen: true, state: 'inside' })).toMatchObject({ status: 'restricted', color: '#b42318' });
  });
  it('no presenta un estado seguro sin zona configurada', () => {
    expect(trackVisualState({ seen: true, state: 'pending' }).status).toBe('unconfigured');
  });
  it('no confunde un track perdido con una salida segura', () => {
    expect(trackVisualState({ seen: false, state: 'inside' }).status).toBe('unknown');
  });
});
