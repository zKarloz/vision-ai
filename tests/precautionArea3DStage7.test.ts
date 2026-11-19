import { describe, expect, it } from 'vitest';
import { isPointInsidePolygon, restrictedZone } from '../src/domain/rules';
import { CONE_POSITIONS, PRECAUTION_ZONE, createPrecautionArea } from '../src/infrastructure/simulation/PrecautionArea';

/** Las pruebas de geometría no necesitan WebGL ni un navegador. */
describe('Mundo 3D · sector de conos de precaución', () => {
  it('crea seis conos, un pavimento ámbar y materiales de obra en un solo grupo', () => {
    const zone = createPrecautionArea();
    expect(zone.name).toContain('precaución');
    expect(zone.children.filter(part => part.name.startsWith('Cono de seguridad'))).toHaveLength(6);
    expect(zone.children.some(part => part.name === 'Superficie de precaución')).toBe(true);
    expect(zone.children.some(part => part.name === 'Materiales de obra')).toBe(true);
    expect(zone.userData.isDetection).toBe(false);
  });

  it('mantiene todos los conos dentro de la zona ámbar, sin invadir maquinaria', () => {
    const xmin = PRECAUTION_ZONE.centerX - PRECAUTION_ZONE.width / 2;
    const xmax = PRECAUTION_ZONE.centerX + PRECAUTION_ZONE.width / 2;
    const zmin = PRECAUTION_ZONE.centerZ - PRECAUTION_ZONE.depth / 2;
    const zmax = PRECAUTION_ZONE.centerZ + PRECAUTION_ZONE.depth / 2;
    for (const cone of CONE_POSITIONS) {
      expect(cone.x).toBeGreaterThan(xmin);
      expect(cone.x).toBeLessThan(xmax);
      expect(cone.z).toBeGreaterThan(zmin);
      expect(cone.z).toBeLessThan(zmax);
      expect(isPointInsidePolygon(cone, restrictedZone.polygon)).toBe(false);
    }
  });

  it('no añade ninguna clase YOLO ni crea incidentes por la sola presencia visual de conos', () => {
    const zone = createPrecautionArea();
    expect(zone.userData.type).toBe('visual-precaution-area');
    expect(zone.userData.isDetection).toBe(false);
    expect(zone.children.every(part => part.userData.isDetection !== true)).toBe(true);
  });
});
