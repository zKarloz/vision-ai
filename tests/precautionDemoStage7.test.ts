import { describe, expect, it } from 'vitest';
import { restrictedZone, isPointInsidePolygon } from '../src/domain/rules';
import {
  cautionWorkerPosition, nearestCautionConeDistance,
  PrecautionDemoRule, PRECAUTION_RADIUS,
} from '../src/infrastructure/simulation/PrecautionDemo';

/** Regresión del adaptador DEMO: no prueba ni sustituye el detector YOLO. */
describe('Precaución por conos · recorrido DEMO aislado', () => {
  it('mantiene la trayectoria simulada fuera de la zona roja de maquinaria', () => {
    for (let t = 0; t <= 54; t += 0.1) {
      expect(isPointInsidePolygon(cautionWorkerPosition(t), restrictedZone.polygon)).toBe(false);
    }
  });

  it('se aproxima a conos reales de la escena, y comienza fuera de su radio', () => {
    expect(nearestCautionConeDistance(cautionWorkerPosition(0))).toBeGreaterThan(PRECAUTION_RADIUS);
    expect(nearestCautionConeDistance(cautionWorkerPosition(7))).toBeLessThan(PRECAUTION_RADIUS);
  });

  it('confirma proximidad y retirada sin duplicar avisos por fotograma', () => {
    const rule = new PrecautionDemoRule();
    const events = [];
    for (let t = 0; t < 18; t += 0.05) {
      const event = rule.update(t);
      if (event) events.push(event);
    }
    expect(events.map(event => event.type)).toEqual(['near', 'clear']);
    expect(events.every(event => event.source === 'DEMO')).toBe(true);
    expect(rule.isActive).toBe(false);
  });

  it('no confirma una proximidad de menos de 500 milisegundos', () => {
    const rule = new PrecautionDemoRule();
    expect(rule.update(2)).toBeNull();
    expect(rule.update(2.15)).toBeNull();
    expect(rule.update(2.4)).toBeNull();
    expect(rule.isActive).toBe(false);
  });

  it('al detenerse cierra el aviso activo exactamente una vez', () => {
    const rule = new PrecautionDemoRule();
    rule.update(4);
    expect(rule.update(5)?.type).toBe('near');
    const stopped = rule.stop(5);
    expect(stopped?.type).toBe('clear');
    expect(stopped?.reason).toBe('stopped');
    expect(rule.stop(5)).toBeNull();
    expect(rule.isActive).toBe(false);
  });

  it('permite reiniciar la secuencia sin heredar el estado anterior', () => {
    const rule = new PrecautionDemoRule();
    rule.update(5);
    rule.update(6);
    expect(rule.isActive).toBe(true);
    rule.reset();
    expect(rule.isActive).toBe(false);
    expect(rule.update(0)).toBeNull();
    expect(rule.update(5)).toBeNull();
    expect(rule.update(5.6)?.type).toBe('near');
  });
});
