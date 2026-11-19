/**
 * VISION AI: crea un ZIP del código y la documentación actuales sin instalar paquetes.
 * Uso (en la raíz del proyecto, desde Git Bash / Windows):
 *   node exportar-vision-ai.mjs
 * Salida: ../VISION-AI-CODIGO-YYYYMMDD-HHMMSS.zip
 *
 * Incluye modificaciones aún no confirmadas por Git. No incluye .env, .git,
 * dependencias, builds, modelos ONNX ni archivos grandes. Aun así, revisa
 * siempre el ZIP antes de compartirlo por posibles secretos embebidos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'src'))) {
  console.error('ERROR: ejecuta este script desde la raíz de tu proyecto VISION AI.');
  process.exit(1);
}

// Solo estas carpetas se exportan; evita copias de seguridad y archivos personales.
const includedDirs = ['src', 'docs', 'tests', 'supabase', 'scripts', 'public', '.github'];
const includedRootFiles = new Set([
  'README.md', 'package.json', 'package-lock.json', 'index.html',
  'tsconfig.json', 'vercel.json', '.gitignore', '.gitattributes',
  'components.json', 'eslint.config.js', 'eslint.config.mjs',
  'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
  'vite.config.ts', 'vite.config.js', 'vitest.config.ts',
]);
const allowedRootPatterns = [/^tsconfig\..+\.json$/, /^tailwind\.config\.(js|ts|cjs|mjs)$/];
const deniedDirs = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.vercel',
  '.next', '.turbo', '.cache', '.temp', '.supabase', 'temp', 'tmp',
  'test-results', 'playwright-report', 'backups', 'backup', 'evidencias',
  'storage', 'models',
]);
const deniedFileName = /(^\.env($|\.)|\.pem$|\.p12$|\.pfx$|\.key$|\.sqlite3?$|\.db$|(^|[-_.])(secrets?|credentials?)([-_.]|$)|service[_-]?role)/i;
const excludedExtension = /\.(onnx|wasm|mp4|webm|avi|mov|zip|tar|gz|7z|log|pdf|map)$/i;
const allowedExtension = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|sql|toml|yaml|yml|svg|txt|sh|ps1|py|gitignore|gitattributes)$/i;
const maxFileBytes = 5 * 1024 * 1024;
const maxTotalBytes = 75 * 1024 * 1024;
const selected = [];
const excluded = [];
let totalBytes = 0;

// Detección orientativa de secretos conocidos; NO reemplaza una auditoría manual.
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsb_secret_[A-Za-z0-9_-]{12,}/,
  /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{25,}/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bre_[A-Za-z0-9]{25,}/,
];

function collect(current, relative = '') {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const abs = path.join(current, entry.name);
    if (entry.isSymbolicLink()) { excluded.push(`${rel}: enlace simbólico`); continue; }
    if (entry.isDirectory()) {
      if (deniedDirs.has(entry.name) || entry.name.startsWith('.env')) {
        excluded.push(`${rel}/: carpeta excluida`);
      } else {
        collect(abs, rel);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (deniedFileName.test(entry.name) || excludedExtension.test(entry.name) ||
        (!allowedExtension.test(entry.name) && !['.gitignore', '.gitattributes'].includes(entry.name))) {
      excluded.push(`${rel}: tipo o nombre excluido`); continue;
    }
    const size = fs.statSync(abs).size;
    if (size > maxFileBytes) { excluded.push(`${rel}: demasiado grande`); continue; }
    selected.push({ rel, abs, size });
    totalBytes += size;
  }
}

for (const dir of includedDirs) {
  const abs = path.join(root, dir);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) collect(abs, dir);
}
for (const filename of fs.readdirSync(root)) {
  if (!includedRootFiles.has(filename) && !allowedRootPatterns.some(re => re.test(filename))) continue;
  if (deniedFileName.test(filename)) continue;
  const abs = path.join(root, filename);
  if (fs.statSync(abs).isFile()) {
    const size = fs.statSync(abs).size;
    selected.push({ rel: filename, abs, size });
    totalBytes += size;
  }
}
if (!selected.length || totalBytes > maxTotalBytes) {
  console.error('ERROR: exportación vacía o superior a 75 MB. Revisa archivos.');
  process.exit(1);
}
selected.sort((a, b) => a.rel.localeCompare(b.rel));

// CRC-32 requerido por el formato ZIP (sin dependencias de terceros).
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  crcTable[i] = c >>> 0;
}
function crc32(input) {
  let crc = 0xffffffff;
  for (const b of input) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

let revision = 'sin-confirmar';
try { revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Git es opcional */ }
const entries = selected.map(file => ({ name: file.rel, bytes: fs.readFileSync(file.abs), date: fs.statSync(file.abs).mtime }));
const manifest = [
  'VISION AI - EXPORTACION PARA REVISION DE CODIGO',
  `Fecha: ${new Date().toISOString()}`,
  `Revision Git de referencia: ${revision}`,
  `Archivos de codigo/documentacion: ${selected.length}`,
  'El contenido refleja el arbol actual de trabajo, incluso cambios sin commit.',
  'Se han excluido .env*, secretos por nombre, .git, node_modules, compilados, video y modelos.',
  'ATENCION: revisar manualmente antes de compartir; los secretos embebidos no siempre se detectan.',
  '', 'Archivos incluidos:', ...selected.map(f => f.rel),
  '', 'Archivos omitidos (resumen):', ...excluded.slice(0, 80),
].join('\n');
entries.push({ name: 'MANIFIESTO_EXPORTACION.txt', bytes: Buffer.from(manifest, 'utf8'), date: new Date() });

for (const entry of entries) {
  const content = entry.bytes.toString('utf8');
  // Ignorar el token secuencial ficticio usado por pruebas de seguridad.
  // Cualquier coincidencia distinta sigue deteniendo la exportación.
  const hasPotentialSecret = secretPatterns.some(re => {
    const match = content.match(re);
    return match && !/(?:0123456789){2,}/.test(match[0]);
  });
  if (hasPotentialSecret) {
    console.error(`ERROR: posible secreto en "${entry.name}". Revisa ese archivo antes de exportar.`);
    process.exit(1);
  }
}

// Generador ZIP estándar (entradas UTF-8 + DEFLATE + central directory).
const parts = [];
const centralParts = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
  const data = entry.bytes;
  const compressed = deflateRawSync(data, { level: 6 });
  const crc = crc32(data);
  const { time, date } = zipTime(entry.date);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // Version necesaria para extraer.
  local.writeUInt16LE(0x0800, 6); // Nombres UTF-8.
  local.writeUInt16LE(8, 8); // Compresión DEFLATE.
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}
const centralLength = centralParts.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralLength, 12);
end.writeUInt32LE(offset, 16);
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const target = path.resolve(root, '..', `VISION-AI-CODIGO-${stamp}.zip`);
fs.writeFileSync(target, Buffer.concat([...parts, ...centralParts, end]));
console.log(`ZIP generado: ${target}`);
console.log(`${selected.length} archivos, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB de fuentes sin comprimir.`);
console.log('IMPORTANTE: revisa el ZIP antes de compartirlo. Incluye cambios no confirmados por Git.');
