/** Geometría en coordenadas de imagen normalizadas [0,1]. Independiente del mundo 3D. */
export interface ImagePoint { x: number; y: number }
export interface ImageZone { id: string; cameraId: string; polygon: ImagePoint[] }

const EPS = 1e-8;
export function pointOnSegment(point: ImagePoint, a: ImagePoint, b: ImagePoint): boolean {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  return Math.abs(cross) < EPS &&
    point.x >= Math.min(a.x, b.x) - EPS && point.x <= Math.max(a.x, b.x) + EPS &&
    point.y >= Math.min(a.y, b.y) - EPS && point.y <= Math.max(a.y, b.y) + EPS;
}

/** El borde pertenece a la zona para no ignorar cruces tangenciales. */
export function pointInImagePolygon(point: ImagePoint, polygon: readonly ImagePoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (pointOnSegment(point, a, b)) return true;
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orientation(a: ImagePoint, b: ImagePoint, c: ImagePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function segmentsCross(a: ImagePoint, b: ImagePoint, c: ImagePoint, d: ImagePoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 * o2 < -EPS && o3 * o4 < -EPS) return true;
  return (Math.abs(o1) < EPS && pointOnSegment(c, a, b)) ||
    (Math.abs(o2) < EPS && pointOnSegment(d, a, b)) ||
    (Math.abs(o3) < EPS && pointOnSegment(a, c, d)) ||
    (Math.abs(o4) < EPS && pointOnSegment(b, c, d));
}

/** Rechaza polígonos degenerados, fuera de rango o autointersecados. */
export function validateImagePolygon(points: readonly ImagePoint[]): string | null {
  if (points.length < 3) return 'La zona necesita al menos tres vértices.';
  if (points.length > 16) return 'La zona admite un máximo de 16 vértices.';
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) {
    return 'Los vértices deben tener coordenadas entre 0 y 1.';
  }
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < EPS) return 'Hay vértices consecutivos duplicados.';
    twiceArea += a.x * b.y - b.x * a.y;
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsCross(points[i], points[(i + 1) % points.length],
        points[j], points[(j + 1) % points.length])) return 'El polígono tiene lados que se cruzan.';
    }
  }
  if (Math.abs(twiceArea) < 0.0002) return 'El polígono debe delimitar un área real.';
  return null;
}

export function footPoint(box: { x: number; y: number; width: number; height: number }): ImagePoint {
  return { x: box.x + box.width / 2, y: box.y + box.height };
}
