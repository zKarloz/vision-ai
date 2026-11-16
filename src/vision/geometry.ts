// Geometría pura y comprobable del letterbox. Mantiene el ratio de la imagen.
export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  scaledWidth: number;
  scaledHeight: number;
}

export function computeLetterbox(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
): Letterbox {
  if (originalWidth <= 0 || originalHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('El fotograma y el tensor deben tener dimensiones positivas.');
  }
  const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);
  const scaledWidth = originalWidth * scale;
  const scaledHeight = originalHeight * scale;
  return {
    scale,
    padX: (targetWidth - scaledWidth) / 2,
    padY: (targetHeight - scaledHeight) / 2,
    scaledWidth,
    scaledHeight,
  };
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
