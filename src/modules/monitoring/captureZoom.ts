import { validateImagePolygon, type ImagePoint } from '../../core/domain/spatial';

/** El encuadre ONNX depende de la cuenta, pero no forma parte del esquema remoto. */
export const CAPTURE_ZOOM_STORAGE_KEY = 'vision-ai.capture-zoom-by-camera.v1';
export const CAPTURE_ZOOM_OPTIONS = [1, 1.25, 1.5, 1.6] as const;
export const DEFAULT_CAPTURE_ZOOMS: Readonly<Record<string, number>> = { 'CAM-01': 1, 'CAM-02': 1.5 };

export function isCaptureZoom(value: number): boolean {
  return CAPTURE_ZOOM_OPTIONS.some(option => option === value);
}

/**
 * Una perspectiva Three.PerspectiveCamera con zoom óptico = z conserva el centro
 * de la imagen y escala x/y respecto de 0.5. Esta reproyección mantiene la misma
 * región física del suelo al cambiar la ampliación de captura.
 *
 * Rechazamos cambios cuyo polígono quede total o parcialmente fuera del visor:
 * recortar vértices silenciosamente alteraría la región de alarma.
 */
export function reprojectCapturePolygon(
  points: readonly ImagePoint[], oldZoom: number, newZoom: number,
): { points: ImagePoint[]; error: null } | { points: null; error: string } {
  if (!isCaptureZoom(oldZoom) || !isCaptureZoom(newZoom)) {
    return { points: null, error: 'El zoom debe ser 1×, 1.25×, 1.5× o 1.6×.' };
  }
  const ratio = newZoom / oldZoom;
  const projected = points.map(point => ({
    x: Number((0.5 + (point.x - 0.5) * ratio).toFixed(10)),
    y: Number((0.5 + (point.y - 0.5) * ratio).toFixed(10)),
  }));
  if (projected.some(point => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
    return { points: null, error: 'La zona quedaría fuera del encuadre. Reduce el zoom o vuelve a dibujar la zona.' };
  }
  const error = validateImagePolygon(projected);
  return error ? { points: null, error } : { points: projected, error: null };
}

/** Los valores ajenos al selector se ignoran sin bloquear el arranque del visor. */
export function loadCaptureZooms(storage: { getItem(key: string): string | null }): Record<string, number> {
  const defaults: Record<string, number> = { ...DEFAULT_CAPTURE_ZOOMS };
  try {
    const raw = storage.getItem(CAPTURE_ZOOM_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    for (const [id, zoom] of Object.entries(parsed)) {
      if (/^CAM-[A-Za-z0-9-]{1,40}$/.test(id) && typeof zoom === 'number' && isCaptureZoom(zoom)) {
        defaults[id] = zoom;
      }
    }
  } catch { /* Preferimos los zooms iniciales si falta o está corrupta la preferencia. */ }
  return defaults;
}
