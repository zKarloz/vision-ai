import { unlinkSync, existsSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ejecutar SOLO desde la raíz del proyecto Stage 1 cuando se aplique el ZIP parcial.
 * Elimina las cuatro entradas experimentales retiradas por aprobación del usuario.
 */
const legacyFiles = ['lab.html', 'src/lab/main.tsx', 'src/app/App.tsx', 'src/styles.css'];
for (const filename of legacyFiles) {
  const full = resolve(process.cwd(), filename);
  if (!existsSync(full)) continue;
  unlinkSync(full);
  console.log(`Eliminado: ${filename}`);
}
try { rmdirSync(resolve(process.cwd(), 'src/lab')); } catch { /* Puede no existir o contener archivos de usuario. */ }
console.log('Limpieza de archivos experimentales completada.');
