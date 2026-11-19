/**
 * VISION AI · E1. Evaluación offline de detecciones con etiquetas humanas.
 * No invoca YOLO ni almacena fotogramas: recibe únicamente metadatos y cajas [0..1].
 * Ejecutar: node scripts/evaluate-vision-stage8.mjs --input examples/vision-stage8-ejemplo.json
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLASS_LABELS = Object.freeze(['persona', 'cono', 'casco', 'chaleco']);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FRAMES = 5_000;
const MAX_BOXES_PER_FRAME = 50;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fraction = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;
const round = value => Math.round(value * 1_000_000) / 1_000_000;

/** Validación defensiva: coordenadas relativas, sin imágenes, etiquetas ni valores fuera de rango. */
function validateBox(box, context) {
  assert(isRecord(box), `${context}: falta box.`);
  const { x, y, width, height } = box;
  for (const [key, value] of Object.entries({ x, y, width, height })) {
    assert(typeof value === 'number' && Number.isFinite(value), `${context}: ${key} no es numérico finito.`);
  }
  assert(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1.00000001 && y + height <= 1.00000001,
    `${context}: caja fuera de [0,1] o de tamaño no positivo.`);
}

function validateAnnotation(item, context, prediction) {
  assert(isRecord(item), `${context}: la anotación debe ser un objeto.`);
  assert(CLASS_LABELS.includes(item.class), `${context}: clase no admitida (${String(item.class)}).`);
  validateBox(item.box, context);
  if (prediction) {
    assert(typeof item.confidence === 'number' && Number.isFinite(item.confidence)
      && item.confidence >= 0 && item.confidence <= 1, `${context}: confidence debe estar entre 0 y 1.`);
  }
}

/** Intersección sobre unión de dos cajas en coordenadas normalizadas. */
export function boxIoU(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return fraction(intersection, union);
}

/**
 * Relaciona predicciones y anotaciones de la misma clase, cuadro y fotograma.
 * Cada etiqueta humana puede emparejarse una sola vez. No infiere identidad personal.
 */
export function evaluateDataset(dataset, { confidence = 0.25, iou = 0.5 } = {}) {
  assert(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1, 'Umbral de confianza inválido.');
  assert(Number.isFinite(iou) && iou > 0 && iou <= 1, 'Umbral IoU inválido.');
  assert(isRecord(dataset) && dataset.schema === 'vision-ai-eval-v1', 'Esquema no reconocido; se espera vision-ai-eval-v1.');
  assert(typeof dataset.dataset === 'string' && dataset.dataset.trim().length > 0 && dataset.dataset.length <= 120,
    'Identificador de dataset requerido (máximo 120 caracteres).');
  assert(Array.isArray(dataset.frames) && dataset.frames.length > 0 && dataset.frames.length <= MAX_FRAMES,
    `Se requieren entre 1 y ${MAX_FRAMES} fotogramas etiquetados.`);

  const counts = Object.fromEntries(CLASS_LABELS.map(label => [label, { tp: 0, fp: 0, fn: 0 }]));
  const seenFrames = new Set();
  for (const [index, frame] of dataset.frames.entries()) {
    const context = `frames[${index}]`;
    assert(isRecord(frame) && typeof frame.cameraId === 'string' && frame.cameraId.length > 0
      && frame.cameraId.length <= 100 && typeof frame.frameId === 'string' && frame.frameId.length > 0
      && frame.frameId.length <= 100, `${context}: cameraId/frameId inválidos.`);
    const key = JSON.stringify([frame.cameraId, frame.frameId]);
    assert(!seenFrames.has(key), `${context}: fotograma duplicado (${frame.cameraId}/${frame.frameId}).`);
    seenFrames.add(key);
    assert(Array.isArray(frame.truth) && frame.truth.length <= MAX_BOXES_PER_FRAME
      && Array.isArray(frame.predictions) && frame.predictions.length <= MAX_BOXES_PER_FRAME,
    `${context}: truth/predictions deben ser arreglos de hasta ${MAX_BOXES_PER_FRAME} cajas.`);
    frame.truth.forEach((item, j) => validateAnnotation(item, `${context}.truth[${j}]`, false));
    frame.predictions.forEach((item, j) => validateAnnotation(item, `${context}.predictions[${j}]`, true));

    for (const label of CLASS_LABELS) {
      const truths = frame.truth.filter(item => item.class === label);
      const predictions = frame.predictions.filter(item => item.class === label && item.confidence >= confidence)
        .sort((a, b) => b.confidence - a.confidence);
      const matched = new Set();
      for (const prediction of predictions) {
        let bestIndex = -1;
        let bestIoU = -1;
        truths.forEach((truth, j) => {
          if (matched.has(j)) return;
          const overlap = boxIoU(prediction.box, truth.box);
          if (overlap >= iou && overlap > bestIoU) { bestIndex = j; bestIoU = overlap; }
        });
        if (bestIndex >= 0) { matched.add(bestIndex); counts[label].tp++; }
        else counts[label].fp++;
      }
      counts[label].fn += truths.length - matched.size;
    }
  }

  const metrics = ({ tp, fp, fn }) => {
    const precision = fraction(tp, tp + fp);
    const recall = fraction(tp, tp + fn);
    return { tp, fp, fn, support: tp + fn,
      precision: round(precision), recall: round(recall),
      f1: round(fraction(2 * precision * recall, precision + recall)) };
  };
  const perClass = Object.fromEntries(CLASS_LABELS.map(label => [label, metrics(counts[label])]));
  const totals = Object.values(counts).reduce((acc, row) => ({
    tp: acc.tp + row.tp, fp: acc.fp + row.fp, fn: acc.fn + row.fn,
  }), { tp: 0, fp: 0, fn: 0 });
  return {
    schema: 'vision-ai-eval-result-v1',
    dataset: dataset.dataset,
    framesEvaluated: dataset.frames.length,
    thresholds: { confidence, iou },
    summary: metrics(totals),
    perClass,
    limitations: [
      'Métricas sobre anotaciones proporcionadas; no ejecuta ni valida un modelo ONNX.',
      'Sin datos humanos etiquetados independientes no se puede afirmar precisión real.',
      'No calcula mAP, latencia audible ni capacidad de producción 24/7.',
    ],
  };
}

/** CLI: lectura local controlada, salida JSON compatible con Git Bash de Windows. */
function cli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Uso: node scripts/evaluate-vision-stage8.mjs --input <dataset.json> [--output <resultado.json>] [--confidence 0.25] [--iou 0.5]\n');
    return;
  }
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert(/^--(input|output|confidence|iou)$/.test(argv[i]) && i + 1 < argv.length,
      `Argumento no reconocido: ${argv[i]}`);
    assert(!(argv[i].slice(2) in options), `Argumento repetido: ${argv[i]}`);
    options[argv[i].slice(2)] = argv[i + 1];
  }
  assert(typeof options.input === 'string', 'Indica --input archivo.json.');
  const inputPath = resolve(options.input);
  const outputPath = options.output ? resolve(options.output) : null;
  assert(inputPath !== outputPath, 'No sobrescribas el dataset de entrada.');
  assert(statSync(inputPath).size <= MAX_BYTES, `El dataset supera ${MAX_BYTES} bytes.`);
  const raw = readFileSync(inputPath);
  const dataset = JSON.parse(raw.toString('utf8'));
  const thresholdOptions = {};
  for (const key of ['confidence', 'iou']) {
    if (options[key] !== undefined) {
      assert(options[key].trim() !== '', `${key}: valor vacío.`);
      thresholdOptions[key] = Number(options[key]);
    }
  }
  const result = `${JSON.stringify(evaluateDataset(dataset, thresholdOptions), null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, result, { flag: 'wx' }); // Evita sobrescribir evidencias previas.
    process.stdout.write(`Resultado guardado: ${outputPath}\n`);
  } else process.stdout.write(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { cli(process.argv.slice(2)); }
  catch (error) { console.error(`VISION AI E1: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
