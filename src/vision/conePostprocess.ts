/**
 * Decodificación específica de la clase Safety Cone (índice 6) del modelo
 * construction-ppe-safety. No comparte tipos con el motor de incidentes de
 * personas, para que los conos nunca activen sirenas por accidente.
 */
export interface SafetyConeDetection {
  classId: 6;
  label: 'cono';
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

type Box = { x1: number; y1: number; x2: number; y2: number; confidence: number };
const MODEL_SIZE = 640;
const CHANNELS = 14; // 4 coords XYWH + 10 puntuaciones de clase.
const ANCHORS = 8400; // YOLOv8n 640x640: 80^2 + 40^2 + 20^2.
const CONE_CLASS_INDEX = 6; // Definición oficial del data.yaml del modelo.

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function overlap(a: Box, b: Box): number {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = width * height;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * El modelo entrenado se exportó con 640x640 **stretch**, no con letterbox.
 * Al normalizar coordenadas por 640, se recupera el punto equivalente en la
 * imagen original, incluso si la cámara tiene aspecto 4:3.
 *
 * No interpreta las clases Hardhat, Person ni NO-Hardhat del modelo candidato.
 */
export function decodeSafetyCones(
  data: Float32Array,
  dimensions: readonly number[],
  confidenceThreshold = 0.4,
  iouThreshold = 0.45,
): SafetyConeDetection[] {
  if (dimensions.length !== 3 || dimensions[0] !== 1 ||
      dimensions[1] !== CHANNELS || dimensions[2] !== ANCHORS ||
      data.length !== CHANNELS * ANCHORS) {
    throw new Error(`Salida ONNX de conos incompatible: [${dimensions.join(', ')}]. Se espera [1,14,8400].`);
  }
  if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1 ||
      !Number.isFinite(iouThreshold) || iouThreshold <= 0 || iouThreshold > 1) {
    throw new Error('Umbrales fuera del intervalo admitido para conos.');
  }

  const candidates: Box[] = [];
  for (let i = 0; i < ANCHORS; i++) {
    const confidence = data[(4 + CONE_CLASS_INDEX) * ANCHORS + i];
    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) continue;
    const cx = data[i];
    const cy = data[ANCHORS + i];
    const width = data[2 * ANCHORS + i];
    const height = data[3 * ANCHORS + i];
    if (![cx, cy, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const x1 = clamp01((cx - width / 2) / MODEL_SIZE);
    const y1 = clamp01((cy - height / 2) / MODEL_SIZE);
    const x2 = clamp01((cx + width / 2) / MODEL_SIZE);
    const y2 = clamp01((cy + height / 2) / MODEL_SIZE);
    if (x2 <= x1 || y2 <= y1) continue;
    candidates.push({ x1, y1, x2, y2, confidence });
  }

  // NMS específico de conos; nunca suprime cajas de personas.
  candidates.sort((a, b) => b.confidence - a.confidence);
  const accepted: Box[] = [];
  for (const candidate of candidates) {
    if (accepted.every(previous => overlap(candidate, previous) < iouThreshold)) {
      accepted.push(candidate);
      if (accepted.length === 25) break;
    }
  }
  return accepted.map(box => ({
    classId: 6,
    label: 'cono',
    confidence: box.confidence,
    box: { x: box.x1, y: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 },
  }));
}
