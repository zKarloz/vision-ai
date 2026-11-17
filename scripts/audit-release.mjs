import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Se replica la huella del modelo de scripts/download-model.mjs.
// No se permite publicar accidentalmente otro ONNX con el nombre esperado.
export const MODEL_SHA256 = 'fa2c856b0effedce4f49fffd121f438247a64c8f633bf0e6d5e5960e869ccc5a';

const isFile = (file) => existsSync(file) && statSync(file).isFile();
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}

/**
 * Auditoría de artefactos que realmente se publican en Vercel.
 * No realiza peticiones a Supabase, Resend ni analiza imágenes reales.
 * El hash opcional solo permite inyectar una huella de prueba sin un ONNX de 13 MB.
 */
export function inspectRelease(root, expectedModelHash = MODEL_SHA256) {
  const dist = path.join(root, 'dist');
  const index = path.join(dist, 'index.html');
  const model = path.join(dist, 'models', 'yolov8n.onnx');
  const errors = [];
  const checks = [];
  const check = (ok, successLabel, errorLabel) => {
    if (ok) checks.push(successLabel);
    else errors.push(errorLabel);
  };

  check(isFile(index), 'Entrada HTML presente', 'Falta dist/index.html');
  const allFiles = walk(dist);
  const jsFiles = allFiles.filter(file => file.endsWith('.js'));
  check(jsFiles.some(file => file.includes(`${path.sep}assets${path.sep}`)), 'JavaScript Vite presente', 'Falta el paquete JavaScript de Vite');
  const wasmFiles = allFiles.filter(file => file.includes(`${path.sep}ort${path.sep}`) &&
    /^ort-wasm-.*\.wasm$/.test(path.basename(file)));
  check(wasmFiles.length > 0, 'Binarios ONNX WASM presentes', 'Faltan binarios WASM oficiales de ONNX Runtime en dist/ort/');
  const modelExists = isFile(model);
  check(modelExists, 'Modelo ONNX presente', 'Falta dist/models/yolov8n.onnx');
  if (modelExists) {
    check(sha256(readFileSync(model)) === expectedModelHash, 'Huella ONNX verificada', 'SHA-256 del modelo ONNX no coincide');
  }

  const vercelFile = path.join(root, 'vercel.json');
  let hasSpaRewrite = false;
  try {
    const vercel = JSON.parse(readFileSync(vercelFile, 'utf8'));
    hasSpaRewrite = Array.isArray(vercel.rewrites) && vercel.rewrites.some(
      route => route.source === '/(.*)' && route.destination === '/index.html');
  } catch { /* Una configuración ausente o inválida también falla la auditoría. */ }
  check(hasSpaRewrite, 'Fallback SPA de Vercel correcto', 'Falta rewrite SPA hacia /index.html en vercel.json');

  const leakFiles = allFiles.filter(file => /(?:^|\/|\\)\.env(?:\.|$)/.test(file));
  check(leakFiles.length === 0, 'No hay archivos .env en dist/', 'Hay archivos .env privados dentro de dist/');
  const potentialSecrets = [
    /sb_secret_[a-z0-9_-]{12,}/i,
    /\bre_[a-z0-9]{20,}\b/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  const exposed = allFiles.filter(file => /\.(?:js|html|css|json|txt|map)$/i.test(file)).filter(file => {
    const content = readFileSync(file, 'utf8');
    return potentialSecrets.some(pattern => pattern.test(content));
  });
  check(exposed.length === 0, 'No se encontraron patrones de secretos conocidos en el paquete público', `Posible secreto en archivos públicos: ${exposed.map(f => path.relative(dist, f)).join(', ')}`);

  return { ok: errors.length === 0, checks, errors };
}

// Comando de CI: se ejecuta después de construir y descargar el modelo verificado.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = inspectRelease(root);
  for (const item of result.checks) console.log(`OK: ${item}`);
  for (const item of result.errors) console.error(`ERROR: ${item}`);
  if (!result.ok) process.exitCode = 1;
  else console.log('Auditoría de paquete público aprobada.');
}
