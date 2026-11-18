import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs } from '../src/shared/components/Tabs';
import { shouldRenderAlarmView } from '../src/shared/components/AlarmStatusBar';

describe('Pestañas compartidas con diseño redondeado', () => {
  const items = [
    { id: 'general', label: 'General', content: <p>Configuración general</p> },
    { id: 'versiones', label: 'Historial de versiones', content: <p>Tabla de versiones</p> },
    { id: 'auditoria', label: 'Auditoría local', content: <p>Tabla de auditoría</p> },
  ];

  it('presenta las tres pestañas y solo monta el contenido de General al inicio', () => {
    const markup = renderToStaticMarkup(<Tabs label="Secciones de configuración" items={items}/>);
    expect((markup.match(/role="tab"/g) ?? [])).toHaveLength(3);
    expect(markup).toContain('Configuración general');
    expect(markup).not.toContain('Tabla de versiones');
    expect(markup).not.toContain('Tabla de auditoría');
  });

  it('utiliza bordes y esquinas redondeadas en barra y pestañas', () => {
    const markup = renderToStaticMarkup(<Tabs label="Secciones de configuración" items={items}/>);
    expect(markup).toContain('rounded-2xl border');
    expect(markup).toContain('rounded-xl border');
    expect(markup).toContain('bg-[var(--muted-bg)]');
  });
});

describe('Visibilidad de tarjeta y notificación de alarma', () => {
  it('muestra el estado sin alarmas solo en Configuración', () => {
    expect(shouldRenderAlarmView('settings', 0)).toBe(true);
    expect(shouldRenderAlarmView('settings', 1)).toBe(false);
  });

  it('muestra la notificación flotante solo cuando existen pendientes', () => {
    expect(shouldRenderAlarmView('floating', 0)).toBe(false);
    expect(shouldRenderAlarmView('floating', 1)).toBe(true);
    expect(shouldRenderAlarmView('floating', 3)).toBe(true);
  });
});
