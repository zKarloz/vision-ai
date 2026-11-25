import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { MobileAlarmNotice } from '../src/shared/components/AlarmStatusBar';

/**
 * Validaciones estáticas del contrato responsive. No reemplazan una inspección
 * visual a 320/375 px en Chrome DevTools o en un teléfono real.
 */
function markup(options: {
  count?: number;
  soundEnabled?: boolean;
  mayAcknowledge?: boolean;
  cameraId?: string;
  zoneId?: string;
} = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MobileAlarmNotice
        count={options.count ?? 1}
        cameraId={options.cameraId ?? 'CAM-01'}
        zoneId={options.zoneId ?? 'ZONA-01'}
        soundEnabled={options.soundEnabled ?? true}
        mayAcknowledge={options.mayAcknowledge ?? true}
        onAcknowledge={() => {}}
        onToggleSound={() => {}}
      />
    </MemoryRouter>,
  );
}

describe('E2: tarjeta de alarma realmente compacta en móvil', () => {
  it('resume una alarma en una fila de altura reducida y texto truncable', () => {
    const html = markup();
    expect(html).toContain('sm:hidden');
    expect(html).toContain('min-w-0 flex-1');
    expect(html).toContain('truncate text-xs');
    expect(html).toContain('aria-label="1 alarma pendiente"');
    expect(html).toContain('CAM-01 · ZONA-01');
  });

  it('permite reconocer, silenciar y abrir los incidentes con acciones accesibles', () => {
    const html = markup();
    expect(html).toContain('aria-label="Reconocer alarma"');
    expect(html).toContain('aria-label="Silenciar audio"');
    expect(html).toContain('aria-label="Ver incidentes"');
    expect(html).toContain('href="/incidentes"');
    expect((html.match(/<button\b/g) ?? [])).toHaveLength(2);
  });

  it('no ofrece el reconocimiento a usuarios sin permiso', () => {
    const html = markup({ mayAcknowledge: false });
    expect(html).not.toContain('aria-label="Reconocer alarma"');
    expect((html.match(/<button\b/g) ?? [])).toHaveLength(1);
    expect(html).toContain('aria-label="Ver incidentes"');
  });

  it('refleja el estado apagado del audio y la cantidad plural', () => {
    const html = markup({ soundEnabled: false, count: 6 });
    expect(html).toContain('aria-label="Activar sonido"');
    expect(html).toContain('aria-label="6 alarmas pendientes"');
  });

  it('limita los nombres largos al ancho disponible sin perder el dato completo', () => {
    const html = markup({ cameraId: 'CAMARA-CON-IDENTIFICADOR-EXTREMADAMENTE-LARGO', zoneId: 'ZONA-123456' });
    expect(html).toContain('truncate text-[11px]');
    expect(html).toContain('title="CAMARA-CON-IDENTIFICADOR-EXTREMADAMENTE-LARGO · ZONA-123456"');
  });
});
