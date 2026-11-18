import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs, nextTabIndex } from '../src/shared/components/Tabs';

describe('Pestañas compartidas de Incidentes y Reportes', () => {
  it('permite navegar con flechas y vuelve al comienzo o al final', () => {
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
  });

  it('no intercepta Tab, Escape ni combinaciones que no cambian pestañas', () => {
    expect(nextTabIndex('Tab', 0, 3)).toBeNull();
    expect(nextTabIndex('Escape', 1, 3)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('expone la barra, pestañas y paneles con atributos accesibles', () => {
    const html = renderToStaticMarkup(<Tabs label="Secciones de incidentes" items={[
      { id: 'incidentes', label: 'Incidentes', count: 3, content: <p>Tabla de incidentes</p> },
      { id: 'auditoria', label: 'Auditoría de acciones', content: <p>Tabla de auditoría</p> },
    ]}/>);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Secciones de incidentes"');
    expect((html.match(/role="tab"/g) ?? [])).toHaveLength(2);
    expect((html.match(/role="tabpanel"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('Tabla de incidentes');
    expect(html).not.toContain('Tabla de auditoría');
  });

  it('admite tres pestañas para separar operación, informes y auditoría', () => {
    const html = renderToStaticMarkup(<Tabs label="Secciones de reportes" items={[
      { id: 'operacion', label: 'Operación y sincronización', content: <p>Panel de Supabase</p> },
      { id: 'informes', label: 'Informes generados', content: <p>Tabla de informes</p> },
      { id: 'auditoria', label: 'Auditoría de reportes', content: <p>Tabla de auditoría</p> },
    ]}/>);
    expect((html.match(/role="tab"/g) ?? [])).toHaveLength(3);
    expect(html).toContain('Panel de Supabase');
    expect(html).not.toContain('Tabla de informes');
    expect(html).not.toContain('Tabla de auditoría');
  });
});
