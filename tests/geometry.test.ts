import { describe, expect, it } from 'vitest';
import { computeLetterbox } from '../src/vision/geometry';

describe('letterbox', () => {
  it('conserva las proporciones para imagen 16:9', () => {
    const box = computeLetterbox(1280, 720, 640, 480);
    expect(box.scale).toBe(0.5);
    expect(box.padX).toBe(0);
    expect(box.padY).toBe(60);
    expect(box.scaledWidth).toBe(640);
    expect(box.scaledHeight).toBe(360);
  });
  it('evita dimensiones inválidas', () => {
    expect(() => computeLetterbox(0, 200, 640, 480)).toThrow();
  });
});
