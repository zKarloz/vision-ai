import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONE_MODEL_SHA256, verifyConeRelease } from '../scripts/verify-cone-release-stage8.mjs';

// Reproduce el empaquetado estático sin descargar 12 MB ni llamar a Vercel.
const temporaryRoots: string[] = [];
function fixture(contents?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'vision-ai-e2-release-'));
  temporaryRoots.push(root);
  if (contents !== undefined) {
    const modelFolder = join(root, 'dist', 'models');
    mkdirSync(modelFolder, { recursive: true });
    writeFileSync(join(modelFolder, 'vision-cones-ppe.onnx'), contents);
  }
  return root;
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('E2: modelo de conos incluido en Vercel', () => {
  it('ejecuta ambos descargadores antes de compilar y audita el artefacto', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      buildCommand?: string; rewrites?: Array<{ source: string; destination: string }>;
    };
    expect(config.buildCommand).toBe(
      'npm run model:download && node scripts/download-cone-model-stage8.mjs && npm run build && node scripts/verify-cone-release-stage8.mjs && npm run audit:release',
    );
  });

  it('preserva el fallback SPA de las rutas internas de React', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      rewrites?: Array<{ source: string; destination: string }>;
    };
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('usa exactamente la misma huella que el descargador E2', () => {
    const downloader = readFileSync('scripts/download-cone-model-stage8.mjs', 'utf8');
    expect(downloader).toContain(CONE_MODEL_SHA256);
  });

  it('impide publicar si Vite no incluye el archivo ONNX', async () => {
    await expect(verifyConeRelease(fixture())).rejects.toThrow(/Falta dist\/models\/vision-cones-ppe\.onnx/);
  });

  it('acepta un archivo de prueba cuya huella coincide', async () => {
    const sample = 'archivo sintético únicamente para probar el verificador';
    const expected = createHash('sha256').update(sample).digest('hex');
    const result = await verifyConeRelease(fixture(sample), expected);
    expect(result.sha256).toBe(expected);
    expect(result.bytes).toBe(Buffer.byteLength(sample));
  });

  it('rechaza archivos ausentes, alterados o con otra huella', async () => {
    await expect(verifyConeRelease(fixture('modelo incorrecto'))).rejects.toThrow(/SHA-256 incorrecto/);
  });
});
