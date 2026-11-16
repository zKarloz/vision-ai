/// <reference lib="webworker" />
import { computeLetterbox } from '../vision/geometry';
import { decodePeople } from '../vision/postprocess';
import type { Provider } from '../core/types/vision';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Este es un Worker dedicado creado por la aplicación; NO se usa env.wasm.proxy.
// Esto permite evaluar WASM/WebGPU sin bloquear el hilo de la interfaz.
const worker = self as DedicatedWorkerGlobalScope;
const WIDTH = 640;
const HEIGHT = 480;
let session: import('onnxruntime-web').InferenceSession | null = null;
let runtime: typeof import('onnxruntime-web') | null = null;
let inputName = '';
let outputName = '';

function notify(message: WorkerResponse): void {
  worker.postMessage(message);
}

async function initialize(provider: Provider, modelUrl: string, assetUrl: string) {
  // Se importa el paquete correspondiente al motor elegido; no hay inferencia en servidor.
  if (provider === 'webgpu' && !('gpu' in navigator)) {
    throw new Error('WebGPU no está disponible en este navegador/equipo. Selecciona WASM.');
  }
  runtime = provider === 'webgpu'
    ? await import('onnxruntime-web/webgpu')
    : await import('onnxruntime-web/wasm');

  // Un solo hilo evita depender de cabeceras COOP/COEP durante el prototipo.
  // El path apunta a los binarios copiados desde el paquete npm local.
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.wasmPaths = assetUrl;
  session = await runtime.InferenceSession.create(modelUrl, {
    executionProviders: [provider],
    graphOptimizationLevel: 'all',
  });
  inputName = session.inputNames[0];
  outputName = session.outputNames[0];
  if (!inputName || !outputName) {
    throw new Error('El modelo ONNX no expone entradas o salidas válidas.');
  }

  return { provider, inputName, outputName, inputShape: [1, 3, HEIGHT, WIDTH] } as const;
}

function preprocess(frame: ImageBitmap): {
  input: Float32Array;
  letterbox: ReturnType<typeof computeLetterbox>;
} {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('El navegador no ofrece OffscreenCanvas 2D en el Worker.');
  const letterbox = computeLetterbox(frame.width, frame.height, WIDTH, HEIGHT);

  // Letterbox: mantiene la relación de aspecto, como exige el postprocesamiento YOLO.
  context.fillStyle = 'rgb(114, 114, 114)';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(frame, letterbox.padX, letterbox.padY,
    letterbox.scaledWidth, letterbox.scaledHeight);

  const rgba = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const pixels = WIDTH * HEIGHT;
  const chw = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const source = i * 4;
    chw[i] = rgba[source] / 255;
    chw[pixels + i] = rgba[source + 1] / 255;
    chw[pixels * 2 + i] = rgba[source + 2] / 255;
  }
  return { input: chw, letterbox };
}

async function analyze(frame: ImageBitmap, confidenceThreshold: number) {
  const started = performance.now();
  const originalWidth = frame.width;
  const originalHeight = frame.height;
  if (!session || !runtime) {
    frame.close();
    throw new Error('El modelo todavía no está inicializado.');
  }

  let prepared: ReturnType<typeof preprocess>;
  try {
    prepared = preprocess(frame);
  } finally {
    // El ImageBitmap es temporal; nunca se guarda ni se envía por red.
    frame.close();
  }
  const preprocessed = performance.now();
  const tensor = new runtime.Tensor('float32', prepared.input, [1, 3, HEIGHT, WIDTH]);
  const result = await session.run({ [inputName]: tensor });
  const inferred = performance.now();
  const output = result[outputName];
  if (!output || !(output.data instanceof Float32Array)) {
    throw new Error('El modelo no devolvió un tensor flotante compatible con YOLOv8n.');
  }
  const detections = decodePeople(output.data, output.dims, confidenceThreshold,
    prepared.letterbox, originalWidth, originalHeight);
  const finished = performance.now();

  return {
    detections,
    timestamp: Date.now(),
    metrics: {
      preprocessingMs: preprocessed - started,
      inferenceMs: inferred - preprocessed,
      postprocessingMs: finished - inferred,
      totalMs: finished - started,
    },
  };
}

worker.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === 'init') {
        notify({ type: 'ready', id: request.id,
          details: await initialize(request.provider, request.modelUrl, request.assetUrl) });
      } else if (request.type === 'analyze') {
        notify({ type: 'result', id: request.id,
          result: await analyze(request.frame, request.threshold) });
      }
    } catch (error) {
      notify({ type: 'error', id: request.id,
        message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
