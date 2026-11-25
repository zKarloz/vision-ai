/// <reference lib="webworker" />
import { decodeSafetyCones } from '../vision/conePostprocess';
import type { Provider } from '../core/types/vision';
import type { ConeWorkerRequest, ConeWorkerResponse } from './cone.protocol';

// Modelo PPE seleccionado: entrada [1,3,640,640], RGB float32, stretch.
// Su salida debe ser exactamente [1,14,8400]. NO se acepta model-deepstream.onnx.
const side = 640;
const worker = self as DedicatedWorkerGlobalScope;
let runtime: typeof import('onnxruntime-web') | null = null;
let session: import('onnxruntime-web').InferenceSession | null = null;
let inputName = '';
let outputName = '';
const notify = (reply: ConeWorkerResponse) => worker.postMessage(reply);

async function initialize(provider: Provider, modelUrl: string, assetUrl: string) {
  if (provider === 'webgpu' && !('gpu' in navigator)) {
    throw new Error('WebGPU no disponible. Prueba el motor WASM.');
  }
  runtime = provider === 'webgpu'
    ? await import('onnxruntime-web/webgpu')
    : await import('onnxruntime-web/wasm');
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.wasmPaths = assetUrl;
  const answer = await fetch(modelUrl, { method: 'HEAD' });
  if (!answer.ok || answer.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Falta el modelo de conos. Ejecuta node scripts/download-cone-model-stage8.mjs antes de iniciar la detección real.');
  }
  session = await runtime.InferenceSession.create(modelUrl, {
    executionProviders: [provider], graphOptimizationLevel: 'all',
  });
  inputName = session.inputNames[0] ?? '';
  outputName = session.outputNames[0] ?? '';
  if (!inputName || !outputName) throw new Error('El modelo de conos no expone entradas/salidas compatibles.');
  return { inputName, outputName };
}

/** Preprocesamiento en OffscreenCanvas, sin guardar ni transmitir imágenes. */
function preprocess(frame: ImageBitmap): Float32Array {
  const canvas = new OffscreenCanvas(side, side);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('OffscreenCanvas 2D no disponible para conos.');
  context.drawImage(frame, 0, 0, side, side);
  const rgba = context.getImageData(0, 0, side, side).data;
  const pixels = side * side;
  const chw = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    chw[i] = rgba[i * 4] / 255;
    chw[pixels + i] = rgba[i * 4 + 1] / 255;
    chw[pixels * 2 + i] = rgba[i * 4 + 2] / 255;
  }
  return chw;
}

async function analyze(frame: ImageBitmap, threshold: number) {
  if (!runtime || !session) { frame.close(); throw new Error('El modelo de conos no está listo.'); }
  let prepared: Float32Array;
  try { prepared = preprocess(frame); }
  finally { frame.close(); }
  const tensor = new runtime.Tensor('float32', prepared, [1, 3, side, side]);
  const started = performance.now();
  const output = await session.run({ [inputName]: tensor });
  const inferenceMs = performance.now() - started;
  const result = output[outputName];
  if (!result || !(result.data instanceof Float32Array)) {
    throw new Error('La salida ONNX de conos no es un tensor float32.');
  }
  return { detections: decodeSafetyCones(result.data, result.dims, threshold), inferenceMs };
}

worker.addEventListener('message', (event: MessageEvent<ConeWorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === 'init') notify({ type: 'ready', id: request.id,
        ...await initialize(request.provider, request.modelUrl, request.assetUrl) });
      else notify({ type: 'result', id: request.id, ...await analyze(request.frame, request.threshold) });
    } catch (error) {
      notify({ type: 'error', id: request.id,
        message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
