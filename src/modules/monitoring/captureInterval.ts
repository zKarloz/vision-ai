/**
 * Intervalos de captura consolidados tras las mediciones reales de tres cámaras
 * realizadas durante la etapa 7. No modifican el modelo ni el planificador.
 * La inferencia sigue siendo única y las capturas se omiten si está ocupada.
 */
export const CAPTURE_INTERVAL_OPTIONS = [60, 75, 100] as const;
export type CaptureIntervalMs = (typeof CAPTURE_INTERVAL_OPTIONS)[number];

/** Equilibrio observado entre FPS, uso de GPU y temperatura. */
export const DEFAULT_CAPTURE_INTERVAL_MS: CaptureIntervalMs = 75;

/** 60 ms es el perfil más exigente; 75 ms es el equilibrado y 100 ms el de menor carga. */
export function isHighLoadCaptureInterval(ms: CaptureIntervalMs): boolean {
  return ms === 60;
}

/** Etiquetas coherentes en los selectores de 3D, vídeo y webcam. */
export function captureIntervalLabel(ms: CaptureIntervalMs): string {
  switch (ms) {
    case 60: return '60 ms · máximo rendimiento';
    case 75: return '75 ms · equilibrado (recomendado)';
    case 100: return '100 ms · menor carga';
  }
}

/**
 * Rechaza intervalos antiguos y valores inválidos: migran al predeterminado
 * sin conservar opciones que se retiraron del selector.
 */
export function parseCaptureIntervalMs(value: string): CaptureIntervalMs {
  const valueAsNumber = Number(value);
  const interval = CAPTURE_INTERVAL_OPTIONS.find(option => option === valueAsNumber);
  return interval ?? DEFAULT_CAPTURE_INTERVAL_MS;
}
