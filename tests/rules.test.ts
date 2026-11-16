import { describe, expect, it } from 'vitest';
import { isPointInsidePolygon, restrictedZone, workerRestrictedPath, ZonePresenceRule } from '../src/domain/rules';

describe('reglas de seguridad desacopladas de la interfaz', () => {
  it('identifica la presencia geométrica dentro de un polígono', () => {
    expect(isPointInsidePolygon({ x: 8, z: 0 }, restrictedZone.polygon)).toBe(true);
    expect(isPointInsidePolygon({ x: 4, z: 0 }, restrictedZone.polygon)).toBe(false);
  });
  it('solo abre tras confirmación temporal y cierra con histéresis', () => {
    const rule = new ZonePresenceRule(500, 750);
    expect(rule.update(true, 0)).toBeNull();
    expect(rule.update(true, 400)).toBeNull();
    expect(rule.update(true, 501)).toBe('entered');
    expect(rule.update(true, 750)).toBeNull();
    expect(rule.update(false, 800)).toBeNull();
    expect(rule.update(false, 1551)).toBe('left');
  });
  it('los movimientos ocurren independientemente de la cámara elegida', () => {
    expect(isPointInsidePolygon(workerRestrictedPath(1), restrictedZone.polygon)).toBe(false);
    expect(isPointInsidePolygon(workerRestrictedPath(6), restrictedZone.polygon)).toBe(true);
    expect(isPointInsidePolygon(workerRestrictedPath(17), restrictedZone.polygon)).toBe(false);
  });
  it('no abre incidentes por cruces de menos de 550 ms', () => {
    const rule = new ZonePresenceRule(550, 900);
    expect(rule.update(true, 100)).toBeNull();
    expect(rule.update(false, 200)).toBeNull();
    expect(rule.update(true, 300)).toBeNull();
    expect(rule.update(true, 700)).toBeNull();
    expect(rule.update(true, 851)).toBe('entered');
  });
});
