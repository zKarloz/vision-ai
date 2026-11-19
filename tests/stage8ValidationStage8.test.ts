import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  boxIoU,
  evaluateDataset,
  type EvaluationDataset,
} from '../scripts/evaluate-vision-stage8.mjs';

// Dataset determinista y ficticio: prueba el evaluador, NO la precisión del YOLO instalado.
const box = { x: 0.2, y: 0.2, width: 0.25, height: 0.45 };
const far = { x: 0.7, y: 0.65, width: 0.1, height: 0.2 };
const dataset = (truth: EvaluationDataset['frames'][number]['truth'],
  predictions: EvaluationDataset['frames'][number]['predictions']): EvaluationDataset => ({
  schema: 'vision-ai-eval-v1',
  dataset: 'PRUEBA-SINTETICA',
  frames: [{ cameraId: 'CAM-02', frameId: 'f001', truth, predictions }],
});
const person = { class: 'persona' as const, box };
const predicted = { ...person, confidence: 0.9 };

describe('Bloque E1: evaluación offline sobre datos etiquetados', () => {
  it('calcula IoU de cajas idénticas, separadas y con intersección parcial', () => {
    expect(boxIoU(box, box)).toBe(1);
    expect(boxIoU(box, far)).toBe(0);
    expect(boxIoU(box, { ...box, x: 0.3 })).toBeGreaterThan(0);
  });

  it('cuenta correctamente un verdadero positivo en clase persona', () => {
    const result = evaluateDataset(dataset([person], [predicted]));
    expect(result.perClass.persona).toMatchObject({ tp: 1, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 });
    expect(result.summary.tp).toBe(1);
  });

  it('una predicción de clase equivocada no satisface la etiqueta humana', () => {
    const result = evaluateDataset(dataset([person], [{ class: 'cono', box, confidence: 0.9 }]));
    expect(result.summary).toMatchObject({ tp: 0, fp: 1, fn: 1, f1: 0 });
  });

  it('una caja alejada cuenta como falso positivo y falso negativo', () => {
    const result = evaluateDataset(dataset([person], [{ ...predicted, box: far }]));
    expect(result.perClass.persona).toMatchObject({ tp: 0, fp: 1, fn: 1 });
  });

  it('no permite contar dos predicciones sobre una sola etiqueta como dos aciertos', () => {
    const result = evaluateDataset(dataset([person], [predicted, { ...predicted, confidence: 0.8 }]));
    expect(result.perClass.persona).toMatchObject({ tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 });
  });

  it('respeta el umbral de confianza sin inventar personas ausentes', () => {
    const result = evaluateDataset(dataset([person], [{ ...predicted, confidence: 0.3 }]), { confidence: 0.6 });
    expect(result.perClass.persona).toMatchObject({ tp: 0, fp: 0, fn: 1 });
  });

  it('acepta fotogramas sin etiquetas ni detecciones y evita dividir entre cero', () => {
    const result = evaluateDataset(dataset([], []));
    expect(result.summary).toMatchObject({ tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 });
  });

  it('rechaza cajas fuera de imagen, en vez de producir una métrica engañosa', () => {
    const invalid = dataset([{ ...person, box: { ...box, x: 0.9 } }], []);
    expect(() => evaluateDataset(invalid)).toThrow('fuera de [0,1]');
  });

  it('rechaza identificadores repetidos dentro de la misma cámara', () => {
    const invalid = dataset([person], [predicted]);
    invalid.frames.push({ ...invalid.frames[0] });
    expect(() => evaluateDataset(invalid)).toThrow('fotograma duplicado');
  });

  it('permite reutilizar frameId en cámaras distintas sin mezclar cajas', () => {
    const valid = dataset([person], [predicted]);
    valid.frames.push({ ...valid.frames[0], cameraId: 'CAM-01', truth: [], predictions: [] });
    expect(evaluateDataset(valid).framesEvaluated).toBe(2);
  });

  it('el script Node produce JSON consumible sin acceder a Supabase o a modelos ONNX', () => {
    const output = execFileSync(process.execPath, [
      resolve('scripts/evaluate-vision-stage8.mjs'),
      '--input', resolve('examples/vision-stage8-ejemplo.json'),
    ], { cwd: resolve('.'), encoding: 'utf8' });
    const result = JSON.parse(output) as ReturnType<typeof evaluateDataset>;
    expect(result.dataset).toBe('EJEMPLO-SINTETICO-NO-VALIDACION');
    expect(result.summary).toMatchObject({ tp: 1, fp: 0, fn: 1 });
  });
});
