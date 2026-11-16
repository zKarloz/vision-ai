import { describe, expect, it } from 'vitest';
import { decodePeople } from '../src/vision/postprocess';
import { computeLetterbox } from '../src/vision/geometry';

const N = 6300;
function sample(person: { cx: number; cy: number; width: number; height: number; score: number }, index: number, output: Float32Array) {
  output[index] = person.cx;
  output[N + index] = person.cy;
  output[N * 2 + index] = person.width;
  output[N * 3 + index] = person.height;
  output[N * 4 + index] = person.score; // Clase COCO 0 = persona
}

describe('postproceso de detección real YOLOv8n', () => {
  it('decodifica personas y rechaza predicciones bajo el umbral', () => {
    const data = new Float32Array(84 * N);
    sample({ cx: 320, cy: 240, width: 100, height: 200, score: 0.88 }, 0, data);
    sample({ cx: 100, cy: 100, width: 80, height: 60, score: 0.12 }, 1, data);
    const result = decodePeople(data, [1, 84, N], .5,
      computeLetterbox(640, 480, 640, 480), 640, 480);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('persona');
    expect(result[0].box.x).toBeCloseTo(270 / 640);
  });

  it('NMS elimina cajas duplicadas', () => {
    const data = new Float32Array(84 * N);
    sample({ cx: 320, cy: 240, width: 100, height: 200, score: 0.92 }, 0, data);
    sample({ cx: 321, cy: 241, width: 100, height: 200, score: 0.81 }, 1, data);
    const result = decodePeople(data, [1, 84, N], .5,
      computeLetterbox(640, 480, 640, 480), 640, 480);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBeCloseTo(.92);
  });

  it('deshace el padding de una webcam panorámica sin desplazar las cajas', () => {
    const data = new Float32Array(84 * N);
    sample({ cx: 320, cy: 240, width: 100, height: 200, score: 0.91 }, 0, data);
    const result = decodePeople(data, [1, 84, N], .5,
      computeLetterbox(1280, 720, 640, 480), 1280, 720);
    expect(result).toHaveLength(1);
    expect(result[0].box.x).toBeCloseTo(540 / 1280);
    expect(result[0].box.y).toBeCloseTo(160 / 720);
    expect(result[0].box.width).toBeCloseTo(200 / 1280);
    expect(result[0].box.height).toBeCloseTo(400 / 720);
  });

  it('rechaza modelos con una forma de tensor incompatible', () => {
    expect(() => decodePeople(new Float32Array(10), [1, 85, N], .5,
      computeLetterbox(640, 480, 640, 480), 640, 480)).toThrow();
  });
});
