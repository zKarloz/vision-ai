import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectRelease } from '../scripts/audit-release.mjs';

// Artefactos de prueba: el auditor en producción SIEMPRE verifica el hash real de YOLO.
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'vision-ai-stage7-'));
  roots.push(root);
  const model = Buffer.from('solo un modelo ficticio para la prueba');
  const hash = createHash('sha256').update(model).digest('hex');
  for (const dir of ['dist', 'dist/assets', 'dist/models', 'dist/ort'])
    mkdirSync(path.join(root, dir), { recursive: true });
  const write = (relative: string, data: string | Buffer) => writeFileSync(path.join(root, relative), data);
  write('dist/index.html', '<html><script type="module" src="/assets/index-1.js"></script></html>');
  write('dist/assets/index-1.js', 'console.log("VISION AI")');
  write('dist/models/yolov8n.onnx', model);
  write('dist/ort/ort-wasm-simd.wasm', Buffer.from([0,97,115,109]));
  write('vercel.json', JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }));
  return { root, hash, write };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Etapa 7 · auditoría del paquete público de Vercel', () => {
  it('acepta recursos verificados, ONNX, WASM y rewrite SPA', () => {
    const f = fixture();
    expect(inspectRelease(f.root, f.hash)).toMatchObject({ ok: true, errors: [] });
  });
  it('rechaza modelo manipulado o distinto de la huella esperada', () => {
    const f = fixture(); f.write('dist/models/yolov8n.onnx', 'alterado');
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/SHA-256/);
  });
  it('rechaza la ausencia de pesos YOLO', () => {
    const f = fixture(); rmSync(path.join(f.root, 'dist/models/yolov8n.onnx'));
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/yolov8n\.onnx/);
  });
  it('rechaza un despliegue sin archivos WASM', () => {
    const f = fixture(); rmSync(path.join(f.root, 'dist/ort/ort-wasm-simd.wasm'));
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/WASM/);
  });
  it('rechaza configuración sin fallback SPA para /login y rutas directas', () => {
    const f = fixture(); f.write('vercel.json', JSON.stringify({ rewrites: [] }));
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/rewrite SPA/);
  });
  it('rechaza archivos de entorno local publicados accidentalmente', () => {
    const f = fixture(); f.write('dist/.env.local', 'SECRET=abc');
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/\.env/);
  });
  it('rechaza claves secretas o privadas filtradas en JavaScript', () => {
    const f = fixture(); f.write('dist/assets/index-1.js', 'const key = "sb_secret_012345678901234567890123";');
    expect(inspectRelease(f.root, f.hash).errors.join(' ')).toMatch(/secreto/);
  });
});
