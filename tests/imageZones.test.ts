import { describe, expect, it } from 'vitest';
import { footPoint, pointInImagePolygon, validateImagePolygon } from '../src/domain/imageZones';
const square = [{x:0.25,y:0.25},{x:0.75,y:0.25},{x:0.75,y:0.75},{x:0.25,y:0.75}];
describe('zonas de imagen 2D', () => {
  it('detecta interior y exterior con coordenadas normalizadas', () => {
    expect(pointInImagePolygon({x:0.5,y:0.5}, square)).toBe(true);
    expect(pointInImagePolygon({x:0.9,y:0.5}, square)).toBe(false);
    expect(pointInImagePolygon({x:0.25,y:0.5}, square)).toBe(true);
  });
  it('calcula punto de apoyo en la base del bbox YOLO', () => {
    const foot = footPoint({x:0.2,y:0.3,width:0.2,height:0.5});
    expect(foot.x).toBeCloseTo(0.3);
    expect(foot.y).toBeCloseTo(0.8);
  });
  it('valida polígonos erróneos y evita autointersecciones', () => {
    expect(validateImagePolygon(square)).toBe(null);
    expect(validateImagePolygon(square.slice(0,2))).toMatch(/tres/);
    expect(validateImagePolygon([{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}])).toMatch(/cruzan/);
    expect(validateImagePolygon([{x:0,y:0},{x:1.1,y:0},{x:1,y:1}])).toMatch(/entre 0 y 1/);
  });
});
