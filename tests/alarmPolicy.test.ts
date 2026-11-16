import { describe, expect, it } from 'vitest';
import { pendingAlarms, shouldSound } from '../src/core/domain/alarmPolicy';

describe('Etapa 5 · política de sirena Web Audio', () => {
  it('la alarma no suena sin gesto de habilitación', () => {
    expect(shouldSound(false, [{ status: 'open' }])).toBe(false);
  });
  it('una apertura YOLO habilitada requiere sirena', () => {
    expect(shouldSound(true, [{ status: 'open' }])).toBe(true);
  });
  it('un incidente escalado conserva sirena hasta reconocimiento', () => {
    expect(shouldSound(true, [{ status: 'escalated' }])).toBe(true);
  });
  it('reconocer una alerta no silencia otra pendiente', () => {
    expect(pendingAlarms([{ status: 'acknowledged' }, { status: 'open' }])).toBe(1);
    expect(shouldSound(true, [{ status: 'acknowledged' }, { status: 'open' }])).toBe(true);
  });
  it('el reconocimiento y cierre de todos los incidentes silencian la sirena', () => {
    expect(shouldSound(true, [{ status: 'acknowledged' }, { status: 'closed' }])).toBe(false);
  });
});
