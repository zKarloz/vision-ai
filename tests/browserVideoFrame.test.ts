import { describe, expect, it } from 'vitest';
import { fitVideoFrame, validateLocalVideo, VIDEO_MAX_BYTES } from '../src/infrastructure/video/browserVideoFrame';

describe('captura fiel de fuentes externas', () => {
  it('encaja un vídeo horizontal sin deformarlo', () => {
    expect(fitVideoFrame(1920, 1080)).toEqual({ x: 0, y: 60, width: 640, height: 360 });
  });
  it('encaja un vídeo vertical con barras laterales', () => {
    expect(fitVideoFrame(1080, 1920)).toEqual({ x: 185, y: 0, width: 270, height: 480 });
  });
  it('rechaza dimensiones inválidas', () => {
    expect(() => fitVideoFrame(0, 1080)).toThrow();
    expect(() => fitVideoFrame(Number.NaN, 1080)).toThrow();
  });
  it('acepta MP4 y WebM hasta 150 MB sin subirlo al servidor', () => {
    expect(validateLocalVideo({ name: 'planta.mp4', type: 'video/mp4', size: 1000 })).toBe(null);
    expect(validateLocalVideo({ name: 'planta.WEBM', type: 'video/webm', size: VIDEO_MAX_BYTES })).toBe(null);
  });
  it('rechaza archivos incompatibles, vacíos o excesivos', () => {
    expect(validateLocalVideo({ name: 'archivo.png', type: 'image/png', size: 1000 })).toMatch(/MP4/);
    expect(validateLocalVideo({ name: 'planta.mp4', type: 'video/mp4', size: 0 })).toMatch(/vacío/);
    expect(validateLocalVideo({ name: 'planta.mp4', type: 'video/mp4', size: VIDEO_MAX_BYTES+1 })).toMatch(/150 MB/);
  });
});
