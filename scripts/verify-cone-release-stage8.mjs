/**
 * E2: verifica el modelo de conos realmente empaquetado por Vite para Vercel.
 * El descargador comprueba public/models/; esta auditoría verifica dist/models/.
 * Fallar el build evita desplegar una interfaz con el botón activo pero sin ONNX.
 * No descarga archivos, no contacta servicios y no accede a datos de Supabase.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Huella publicada y fijada en scripts/download-cone-model-stage8.mjs.
export const CONE_MODEL_SHA256 = '1d5f3cf69883e89ba6e2b3836a0b21623044e9a682f1f00dfbacac97b99baf94';

/** Inspecciona el archivo estático que recibirá el navegador tras el deploy. */
export async function verifyConeRelease(root = process.cwd(), expectedHash = CONE_MODEL_SHA256) {
  const file = resolve(root, 'dist', 'models', 'vision-cones-ppe.onnx');
  let metadata;
  try {
    metadata = await stat(file);
  } catch {
    throw new Error('Falta dist/models/vision-cones-ppe.onnx. Ejecuta el descargador E2 antes del build.');
  }
  if (!metadata.isFile()) throw new Error('La ruta del modelo E2 no corresponde a un archivo.');

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const actualHash = hash.digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error('SHA-256 incorrecto en dist/models/vision-cones-ppe.onnx. Se bloquea el despliegue.');
  }
  return { file, bytes: metadata.size, sha256: actualHash };
}

// Solo ejecuta el verificador cuando se invoca por línea de comandos.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyConeRelease();
    console.log(`OK: Modelo ONNX E2 en dist/ (${result.bytes} bytes, SHA-256 verificado).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
