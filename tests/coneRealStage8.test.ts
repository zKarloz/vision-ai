import { describe, expect, it } from 'vitest';
import { decodeSafetyCones } from '../src/vision/conePostprocess';

// Modelo ONNX E2 declarado: [1, 14, 8400] (XYWH + 10 clases).
const width = 8400;
const dims = [1, 14, width] as const;
function tensor(): Float32Array { return new Float32Array(14 * width); }
function cone(data: Float32Array, index: number, options: {
  cx?: number; cy?: number; w?: number; h?: number; confidence?: number; classIndex?: number;
} = {}) {
  data[index] = options.cx ?? 320;
  data[width + index] = options.cy ?? 320;
  data[2 * width + index] = options.w ?? 100;
  data[3 * width + index] = options.h ?? 200;
  data[(4 + (options.classIndex ?? 6)) * width + index] = options.confidence ?? 0.8;
}

describe('E2: clase Safety Cone aislada del detector de personas', () => {
  it('devuelve cero conos cuando no hay puntuaciones válidas', () => {
    expect(decodeSafetyCones(tensor(), dims)).toEqual([]);
  });
  it('decodifica un cono real con caja normalizada', () => {
    const data = tensor(); cone(data, 0);
    const [result] = decodeSafetyCones(data, dims);
    expect(result.classId).toBe(6);
    expect(result.label).toBe('cono');
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.box).toEqual({ x: 270 / 640, y: 220 / 640, width: 100 / 640, height: 200 / 640 });
  });
  it('no identifica Person (clase 5) como cono de seguridad', () => {
    const data = tensor(); cone(data, 0, { classIndex: 5 });
    expect(decodeSafetyCones(data, dims)).toHaveLength(0);
  });
  it('no identifica Hardhat (clase 0) como cono', () => {
    const data = tensor(); cone(data, 0, { classIndex: 0 });
    expect(decodeSafetyCones(data, dims)).toHaveLength(0);
  });
  it('aplica el umbral de confianza específico para conos', () => {
    const data = tensor(); cone(data, 0, { confidence: 0.35 });
    expect(decodeSafetyCones(data, dims, 0.4)).toHaveLength(0);
    expect(decodeSafetyCones(data, dims, 0.3)).toHaveLength(1);
  });
  it('NMS conserva una sola caja para detecciones casi idénticas', () => {
    const data = tensor(); cone(data, 0, { confidence: 0.9 }); cone(data, 1, { confidence: 0.7, cx: 322 });
    expect(decodeSafetyCones(data, dims)).toHaveLength(1);
  });
  it('mantiene dos conos distantes como detecciones independientes', () => {
    const data = tensor(); cone(data, 0, { cx: 160 }); cone(data, 1, { cx: 470 });
    expect(decodeSafetyCones(data, dims)).toHaveLength(2);
  });
  it('recorta correctamente los bordes de la cámara', () => {
    const data = tensor(); cone(data, 0, { cx: 20, cy: 20, w: 150, h: 100 });
    const [result] = decodeSafetyCones(data, dims);
    expect(result.box.x).toBe(0);
    expect(result.box.y).toBe(0);
    expect(result.box.width).toBeGreaterThan(0);
    expect(result.box.height).toBeGreaterThan(0);
  });
  it('rechaza un modelo DeepStream con forma distinta', () => {
    expect(() => decodeSafetyCones(new Float32Array(8400 * 6), [1, 8400, 6])).toThrow(/incompatible/);
  });
  it('ignora cajas no finitas y de tamaño nulo', () => {
    const data = tensor(); cone(data, 0, { w: 0 }); cone(data, 1, { confidence: Number.NaN });
    expect(decodeSafetyCones(data, dims)).toHaveLength(0);
  });
  it('rechaza umbrales fuera de rango', () => {
    expect(() => decodeSafetyCones(tensor(), dims, -0.5)).toThrow(/Umbrales/);
    expect(() => decodeSafetyCones(tensor(), dims, 0.5, 2)).toThrow(/Umbrales/);
  });
});
