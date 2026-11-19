/**
 * VISION AI — Bloque D1: actualización y verificación de dependencias.
 *
 * Uso:
 *   node scripts/upgrade-security-stage7.mjs --plan    # Solo muestra cambios
 *   node scripts/upgrade-security-stage7.mjs           # Actualiza y genera lockfile con npm
 *   node scripts/upgrade-security-stage7.mjs --verify  # Valida sin reinstalar
 *
 * No accede a Supabase, no despliega y no modifica datos. Los paquetes transitivos
 * (por ejemplo, tinypool) son opcionales: si npm ya no los necesita, su ausencia
 * NO constituye un fallo de seguridad. npm audit es la comprobación final.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageFile = resolve(root, 'package.json');
const lockFile = resolve(root, 'package-lock.json');
const originalPackage = readFileSync(packageFile, 'utf8');
const manifest = JSON.parse(originalPackage);

// Directas: deben existir. Transitivas: solo deben cumplir si siguen instaladas.
const directMinimums = { zod: '4.6.7', vitest: '5.1.1' };
const transitiveMinimums = { tinypool: '2.1.2', '@vitest/mocker': '4.1.12' };

/** Compara versiones semver ordinarias, incluidas declaraciones con prefijos ^, ~ o v. */
function atLeast(found, required) {
  const parts = value => String(value)
    .replace(/^[~^=v\s]+/, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map(Number);
  const left = parts(found);
  const right = parts(required);
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(left[i])) return false;
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return true;
}

/** Busca todas las copias resueltas, incluidas las instalaciones transitivas anidadas. */
function resolvedVersions(lock, name) {
  return Object.entries(lock.packages ?? {})
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([, entry]) => entry?.version)
    .filter(Boolean);
}

/** Comprueba las versiones presentes; los transitivos que ya no existen son seguros. */
function verifyLockfile() {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  for (const [name, minimum] of Object.entries(directMinimums)) {
    const declared = name === 'zod' ? manifest.dependencies?.[name] : manifest.devDependencies?.[name];
    if (!atLeast(declared, minimum)) {
      throw new Error(`${name}: package.json declara ${declared ?? 'AUSENTE'}, mínimo ${minimum}.`);
    }
    const versions = resolvedVersions(lock, name);
    if (versions.length === 0 || versions.some(version => !atLeast(version, minimum))) {
      throw new Error(`${name}: versiones instaladas ${versions.join(', ') || 'NINGUNA'}, mínimo ${minimum}.`);
    }
    console.log(`OK ${name}: ${versions.join(', ')}`);
  }

  for (const [name, minimum] of Object.entries(transitiveMinimums)) {
    const versions = resolvedVersions(lock, name);
    if (versions.length === 0) {
      console.log(`OK ${name}: no instalado (sin versión vulnerable presente)`);
      continue;
    }
    if (versions.some(version => !atLeast(version, minimum))) {
      throw new Error(`${name}: versión(es) ${versions.join(', ')} por debajo de ${minimum}.`);
    }
    console.log(`OK ${name}: ${versions.join(', ')}`);
  }
  console.log('Lockfile verificado. Completa la comprobación de seguridad con npm audit.');
}

const isPlan = process.argv.includes('--plan');
const isVerify = process.argv.includes('--verify');
if (isPlan && isVerify) throw new Error('Utiliza --plan o --verify, no ambos a la vez.');

if (!manifest.dependencies?.zod || !manifest.devDependencies?.vitest) {
  throw new Error('No se reconoce el package.json de VISION AI.');
}

// --verify no ejecuta npm ni toca package.json/package-lock.json.
if (isVerify) {
  verifyLockfile();
  process.exit(0);
}

const desiredZod = atLeast(manifest.dependencies.zod, directMinimums.zod)
  ? manifest.dependencies.zod : directMinimums.zod;
const desiredVitest = atLeast(manifest.devDependencies.vitest, directMinimums.vitest)
  ? manifest.devDependencies.vitest : directMinimums.vitest;

console.log('VISION AI — Bloque D1: actualización de seguridad');
console.log(`Zod: ${manifest.dependencies.zod} → ${desiredZod}`);
console.log(`Vitest: ${manifest.devDependencies.vitest} → ${desiredVitest}`);
if (isPlan) process.exit(0);

/** Usa npm desde el sistema; Windows necesita shell para encontrar npm.cmd. */
function npm(...args) {
  const result = spawnSync('npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} terminó con código ${result.status ?? 'desconocido'}`);
  }
}

const originalLock = readFileSync(lockFile, 'utf8');
manifest.dependencies.zod = desiredZod;
manifest.devDependencies.vitest = desiredVitest;
let installed = false;
try {
  writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  npm('install', '--no-fund');
  installed = true;
} finally {
  // Si npm falla, se restauran ambos manifiestos; npm ci repone node_modules.
  if (!installed) {
    writeFileSync(packageFile, originalPackage, 'utf8');
    writeFileSync(lockFile, originalLock, 'utf8');
    console.error('Se restauraron los manifiestos. Ejecuta npm ci si es necesario.');
  }
}

verifyLockfile();
console.log('Ejecuta: npm run test && npm run typecheck && npm run build && npm run audit:release && npm audit && npm audit --omit=dev');
