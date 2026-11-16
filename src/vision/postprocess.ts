import type { Detection } from '../core/types/vision';
import { clamp, type Letterbox } from './geometry';

interface Candidate {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

/** Calcula la intersección sobre unión de dos cajas. */
function iou(a: Candidate, b: Candidate): number {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = width * height;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection;
  return union > 0 ? intersection / union : 0;
}

/** NMS elimina cajas superpuestas manteniendo la de mayor confianza. */
function nms(candidates: Candidate[], overlapThreshold = 0.45, maximum = 30): Candidate[] {
  const selected: Candidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    if (selected.every(previous => iou(previous, candidate) < overlapThreshold)) {
      selected.push(candidate);
      if (selected.length >= maximum) break;
    }
  }
  return selected;
}

/**
 * Decodifica solamente la clase 0 (persona) de YOLOv8n COCO.
 * Modelo esperado: [1,84,6300], channel-first, sin objectness por separado.
 * 4 canales de caja (cx,cy,w,h) + 80 canales de clases.
 */
export function decodePeople(
  data: Float32Array,
  dimensions: readonly number[],
  confidenceThreshold: number,
  letterbox: Letterbox,
  originalWidth: number,
  originalHeight: number,
): Detection[] {
  const count = 6300;
  if (dimensions.length !== 3 || dimensions[0] !== 1 || dimensions[1] !== 84 || dimensions[2] !== count) {
    throw new Error(`Salida ONNX inesperada [${dimensions.join(', ')}]; se espera [1,84,6300].`);
  }
  if (data.length !== 84 * count) throw new Error('El tensor de salida tiene una longitud inesperada.');
  const candidates: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    const confidence = data[4 * count + i]; // COCO clase 0: persona.
    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) continue;

    const cx = data[i];
    const cy = data[count + i];
    const width = data[2 * count + i];
    const height = data[3 * count + i];
    if (![cx, cy, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;

    // Deshace padding y escala, y recorta a los bordes originales.
    const x1 = clamp((cx - width / 2 - letterbox.padX) / letterbox.scale, 0, originalWidth);
    const y1 = clamp((cy - height / 2 - letterbox.padY) / letterbox.scale, 0, originalHeight);
    const x2 = clamp((cx + width / 2 - letterbox.padX) / letterbox.scale, 0, originalWidth);
    const y2 = clamp((cy + height / 2 - letterbox.padY) / letterbox.scale, 0, originalHeight);
    if (x2 <= x1 || y2 <= y1) continue;
    candidates.push({ x1, y1, x2, y2, confidence });
  }

  return nms(candidates).map(box => ({
    classId: 0,
    label: 'persona',
    confidence: box.confidence,
    box: {
      x: box.x1 / originalWidth,
      y: box.y1 / originalHeight,
      width: (box.x2 - box.x1) / originalWidth,
      height: (box.y2 - box.y1) / originalHeight,
    },
  }));
}
