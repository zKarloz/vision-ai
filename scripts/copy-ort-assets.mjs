import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Los binarios WASM deben corresponder exactamente a la versión npm de ONNX Runtime.
// Se copian únicamente artefactos oficiales del paquete instalado, nunca desde un CDN.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const target = path.join(root, 'public', 'ort');
try {
  const files = (await readdir(source)).filter(name =>
    name.startsWith('ort-wasm-') && (name.endsWith('.wasm') || name.endsWith('.mjs')),
  );
  if (!files.length) throw new Error('No se encontraron binarios ONNX Runtime Web.');
  await mkdir(target, { recursive: true });
  await Promise.all(files.map(name => cp(path.join(source, name), path.join(target, name))));
  console.log(`${files.length} archivos ONNX Runtime preparados en public/ort/.`);
} catch (error) {
  console.error('Fallo al copiar archivos WASM:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
