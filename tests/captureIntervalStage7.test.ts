import { describe, expect, it } from 'vitest';
import {
  CAPTURE_INTERVAL_OPTIONS,
  DEFAULT_CAPTURE_INTERVAL_MS,
  captureIntervalLabel,
  isHighLoadCaptureInterval,
  parseCaptureIntervalMs,
} from '../src/modules/monitoring/captureInterval';

describe('Intervalos de captura consolidados en la etapa 7', () => {
  it('establece 75 ms como valor inicial equilibrado', () => {
    expect(DEFAULT_CAPTURE_INTERVAL_MS).toBe(75);
  });

  it('solo permite 60, 75 y 100 ms', () => {
    expect(CAPTURE_INTERVAL_OPTIONS).toEqual([60, 75, 100]);
  });

  it('identifica 60 ms como perfil más exigente', () => {
    expect(isHighLoadCaptureInterval(60)).toBe(true);
    expect(isHighLoadCaptureInterval(75)).toBe(false);
    expect(isHighLoadCaptureInterval(100)).toBe(false);
  });

  it('explica el propósito de cada perfil en el selector', () => {
    expect(captureIntervalLabel(60)).toContain('máximo rendimiento');
    expect(captureIntervalLabel(75)).toContain('recomendado');
    expect(captureIntervalLabel(100)).toContain('menor carga');
  });

  it('acepta exactamente los tres intervalos seleccionables', () => {
    for (const ms of CAPTURE_INTERVAL_OPTIONS) {
      expect(parseCaptureIntervalMs(String(ms))).toBe(ms);
    }
  });

  it('convierte las opciones retiradas a 75 ms', () => {
    for (const oldValue of ['150', '200', '300', '400', '550']) {
      expect(parseCaptureIntervalMs(oldValue)).toBe(DEFAULT_CAPTURE_INTERVAL_MS);
    }
  });

  it('rechaza intervalos no soportados o inválidos', () => {
    for (const badValue of ['1', '74', '99', 'NaN', '', '75.5', '-60']) {
      expect(parseCaptureIntervalMs(badValue)).toBe(DEFAULT_CAPTURE_INTERVAL_MS);
    }
  });
});
