import { describe, expect, it } from 'vitest';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE, validateSafetyRule, validateZone } from '../src/core/domain/zone';
import { footPoint, pointInImagePolygon, validateImagePolygon } from '../src/core/domain/spatial';

describe('Dominio: zonas y polígonos normalizados', () => {
  it('valida la zona restrictiva inicial de CAM-02', () => {
    expect(validateZone(STARTER_RESTRICTED_ZONE)).toEqual([]);
    expect(validateSafetyRule(STARTER_PERSON_RULE)).toEqual([]);
  });
  it('rechaza polígonos fuera de rango, autointersecados y sin área', () => {
    expect(validateImagePolygon([{ x:0.1,y:0.1 },{ x:1.1,y:0.2 },{ x:0.7,y:0.8 }])).toContain('entre 0 y 1');
    expect(validateImagePolygon([{ x:.1,y:.1 },{ x:.9,y:.9 },{ x:.1,y:.9 },{ x:.9,y:.1 }])).not.toBeNull();
    expect(validateImagePolygon([{ x:.1,y:.1 },{ x:.2,y:.2 },{ x:.3,y:.3 }])).not.toBeNull();
  });
  it('usa el punto inferior central de la caja y considera el borde', () => {
    const polygon = [{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}];
    expect(footPoint({x:.4,y:.2,width:.2,height:.6})).toEqual({x:.5,y:.8});
    expect(pointInImagePolygon({x:.5,y:.8},polygon)).toBe(true);
    expect(pointInImagePolygon({x:.9,y:.8},polygon)).toBe(false);
  });
  it('rechaza reglas de confianza y confirmación fuera de rango', () => {
    expect(validateSafetyRule({...STARTER_PERSON_RULE,minConfidence:1.2,minFrames:0}).length).toBe(2);
  });
});
