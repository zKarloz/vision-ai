/**
 * Descarga controlada del modelo experimental E2 (conos de seguridad) sin
 * modificar el modelo de personas. Verifica SHA-256 antes de publicarlo.
 *
 * Fuente: mancalazure/construction-ppe-safety, fichero best.onnx.
 * Pesos: CC BY 4.0 (atribución obligatoria). No distribuir como producto
 * industrial validado ni confundir con model-deepstream.onnx.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const filename = resolve('public/models/vision-cones-ppe.onnx');
const expectedSha = '1d5f3cf69883e89ba6e2b3836a0b21623044e9a682f1f00dfbacac97b99baf94';
const url = 'https://huggingface.co/mancalazure/construction-ppe-safety/resolve/d528026/best.onnx';
const verifyOnly = process.argv.includes('--verify');

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

if (verifyOnly || existsSync(filename)) {
  if (!existsSync(filename)) {
    console.error('No existe el modelo E2. Ejecuta node scripts/download-cone-model-stage8.mjs.');
    process.exitCode = 1;
  } else {
    const actual = await sha256(filename);
    if (actual !== expectedSha) {
      console.error('SHA-256 incorrecto: el ONNX no coincide con el modelo aprobado.');
      process.exitCode = 1;
    } else {
      console.log(`Modelo E2 verificado (${(await stat(filename)).size} bytes).`);
    }
  }
} else {
  await mkdir(dirname(filename), { recursive: true });
  const temp = `${filename}.partial-${process.pid}`;
  try {
    console.log('Descargando ONNX E2 (~12 MB) desde Hugging Face; no requiere token.');
    const response = await fetch(url, { headers: { 'User-Agent': 'VISION-AI-E2/1.0' }, signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Respuesta HTTP ${response.status} al descargar modelo.`);
    const hash = createHash('sha256');
    await pipeline(Readable.fromWeb(response.body), new Transform({
      transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); },
    }), createWriteStream(temp));
    if (hash.digest('hex') !== expectedSha) throw new Error('SHA-256 inválido; descarga descartada.');
    await rename(temp, filename);
    console.log(`Modelo E2 descargado y verificado: ${filename}`);
  } catch (error) {
    await rm(temp, { force: true });
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
