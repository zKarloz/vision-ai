/** Cálculos puros del encuadre: el canvas visible y el enviado a YOLO deben coincidir. */
export interface FrameRect { x: number; y: number; width: number; height: number }

/** Conserva la relación de aspecto y completa el resto con bandas neutras. */
export function fitVideoFrame(sourceWidth: number, sourceHeight: number, targetWidth = 640, targetHeight = 480): FrameRect {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('Las dimensiones del vídeo deben ser positivas.');
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;

/** Nunca se sube el archivo: se valida antes de utilizar una URL temporal local. */
export function validateLocalVideo(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const supportedExtension = /\.(mp4|webm|ogv|ogg)$/i.test(file.name);
  const supportedMime = !file.type || ['video/mp4', 'video/webm', 'video/ogg'].includes(file.type);
  if (!supportedExtension || !supportedMime) return 'Selecciona un vídeo MP4, WebM u Ogg.';
  if (file.size <= 0) return 'El archivo de vídeo está vacío.';
  if (file.size > VIDEO_MAX_BYTES) return 'El vídeo supera el límite local de 150 MB.';
  return null;
}
