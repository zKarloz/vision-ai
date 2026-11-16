import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Modelo ONNX de detección exportado para entrada [1,3,480,640] y salida [1,84,6300].
// La huella publicada por el hospedador garantiza que no se use accidentalmente otro modelo.
const URL_MODELO = 'https://huggingface.co/unileon-robotics/YOLO8-ONNX/resolve/main/yolov8n.onnx';
const SHA256_ESPERADO = 'fa2c856b0effedce4f49fffd121f438247a64c8f633bf0e6d5e5960e869ccc5a';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'public', 'models');
const target = path.join(folder, 'yolov8n.onnx');
const temp = target + '.part';
const sha256 = data => createHash('sha256').update(data).digest('hex');

await mkdir(folder, { recursive: true });
try {
  const current = await readFile(target).catch(() => null);
  if (current && sha256(current) === SHA256_ESPERADO) {
    console.log('Modelo ONNX presente y verificado; no se descarga de nuevo.');
    process.exit(0);
  }

  console.log('Descargando modelo YOLOv8n ONNX (aprox. 13 MB)...');
  const response = await fetch(URL_MODELO, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar el modelo`);
  const data = Buffer.from(await response.arrayBuffer());
  const hash = sha256(data);
  if (hash !== SHA256_ESPERADO) {
    throw new Error(`SHA-256 inesperado: ${hash}. No se instalará el archivo.`);
  }

  await writeFile(temp, data);
  await rename(temp, target);
  console.log('Modelo descargado y SHA-256 verificado.');
} catch (error) {
  await rm(temp, { force: true });
  console.error('Error al preparar el modelo:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
