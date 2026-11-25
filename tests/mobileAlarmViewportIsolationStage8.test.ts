import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Pruebas de contrato del arreglo responsive. La prueba de tamaño real se hace
 * además a 320 y 375 px en navegador, pues Vitest no calcula el layout CSS.
 */
const alarm = readFileSync(new URL('../src/shared/components/AlarmStatusBar.tsx', import.meta.url), 'utf8');
const monitoring = readFileSync(new URL('../src/modules/monitoring/MonitoringPage.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/app/layout/AppShell.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/product.css', import.meta.url), 'utf8');

describe('E2: alerta móvil aislada del tamaño de Monitoreo', () => {
  it('sitúa la alerta en document.body mediante un portal y conserva la salida animada', () => {
    expect(alarm).toContain("import { createPortal } from 'react-dom'");
    expect(alarm).toMatch(/createPortal\([\s\S]*?, document\.body\)/);
    expect(alarm).toContain("motion === 'exiting'");
  });

  it('limita ancho y altura del flotante respecto al viewport móvil', () => {
    expect(alarm).toContain('max-w-[calc(100vw-1rem)]');
    expect(alarm).toContain('max-h-[min(24dvh,104px)]');
    expect(alarm).toContain('flex w-full min-w-0');
  });

  it('mantiene acciones accesibles con iconos para reconocer y silenciar', () => {
    expect(alarm).toContain('aria-label="Reconocer alarma"');
    expect(alarm).toContain('aria-label={soundEnabled ?');
    expect(alarm).toContain('aria-label="Ver incidentes"');
  });

  it('permite contraer el selector de fuente y limita el contenedor de monitoreo', () => {
    expect(monitoring).toContain('monitoring-viewport min-w-0 w-full max-w-full');
    expect(monitoring).toContain('min-w-0 w-full max-w-full flex-1');
    expect(shell).toContain('mx-auto min-w-0 w-full max-w-[1600px]');
    expect(monitoring).toContain('max-w-full overflow-x-clip');
  });

  it('impide que un canvas de ancho intrínseco fuerce columnas Grid', () => {
    expect(styles).toContain('.monitoring-viewport .grid > * { min-inline-size: 0; }');
    expect(styles).toContain('.monitoring-viewport canvas,');
    expect(styles).toContain('max-inline-size: 100%');
  });
});
