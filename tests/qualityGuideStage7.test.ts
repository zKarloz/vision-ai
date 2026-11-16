import { describe, expect, it } from 'vitest';
import { QUALITY_STEPS, qualityProgress } from '../src/application/qualityGuide';

/** Integridad del guion: no puede afirmar que una prueba humana fue ejecutada. */
describe('Etapa 7 · guion de aceptación', () => {
  it('incluye seguridad, flujo, accesibilidad e integración remota', () => {
    const categories = new Set(QUALITY_STEPS.map(step => step.category));
    expect([...categories].sort()).toEqual(['funcional', 'interfaz', 'remoto', 'seguridad']);
  });
  it('los pasos tienen claves únicas y acciones en rutas protegidas existentes', () => {
    expect(new Set(QUALITY_STEPS.map(step => step.id)).size).toBe(QUALITY_STEPS.length);
    expect(QUALITY_STEPS.every(step => step.path.startsWith('/') && step.action.trim().length > 0)).toBe(true);
  });
  it('se inicia en 0% y solo cuenta marcaciones válidas', () => {
    expect(qualityProgress(new Set())).toEqual({ completed: 0, total: QUALITY_STEPS.length, percent: 0 });
    expect(qualityProgress(new Set(['desconocido']))).toEqual(qualityProgress(new Set()));
  });
  it('al marcar todos los pasos calcula exactamente 100%', () => {
    expect(qualityProgress(new Set(QUALITY_STEPS.map(step => step.id)))).toEqual({ completed: QUALITY_STEPS.length, total: QUALITY_STEPS.length, percent: 100 });
  });
  it('mantiene la evidencia externa como paso humano, no como estado falseado del frontend', () => {
    expect(QUALITY_STEPS.find(step => step.id === 'email')?.description).toContain('Cron');
    expect(QUALITY_STEPS.find(step => step.id === 'remote')?.description).toContain('Supabase');
  });
});
