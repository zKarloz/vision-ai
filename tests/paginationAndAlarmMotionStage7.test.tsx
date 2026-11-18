import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable, type TableColumn } from '../src/shared/components/DataTable';
import { PAGE_SIZES, PageSizeSelector } from '../src/shared/components/PageSizeSelector';
import { nextAlarmMotion } from '../src/shared/components/AlarmStatusBar';

interface Item { id: string; label: string }
const columns: TableColumn<Item>[] = [{ key: 'label', header: 'Nombre', render: item => item.label }];
const rows = Array.from({ length: 23 }, (_, index) => ({ id: `item-${index}`, label: `Registro ${index}` }));

describe('Selector compartido de registros paginados', () => {
  it('ofrece exactamente 5, 10 y 20 registros', () => {
    expect(PAGE_SIZES).toEqual([5, 10, 20]);
    const markup = renderToStaticMarkup(<PageSizeSelector value={5} onChange={() => {}}/>);
    expect((markup.match(/aria-label="Mostrar \d+ registros por página"/g) ?? [])).toHaveLength(3);
    expect((markup.match(/aria-pressed="true"/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('aria-label="Mostrar 5 registros por página" aria-pressed="true"');
  });

  it('muestra cinco registros inicialmente en cualquier instancia de DataTable', () => {
    const markup = renderToStaticMarkup(<DataTable accessibleName="Registros" rows={rows} columns={columns} getRowKey={row => row.id}/>);
    expect((markup.match(/<td\b/g) ?? [])).toHaveLength(5);
    expect(markup).not.toContain('Mostrando');
    expect(markup).toContain('Página 1 de 5');
    expect(markup).toContain('Registros por página');
  });

  it('mantiene el selector visible en tablas vacías', () => {
    const markup = renderToStaticMarkup(<DataTable rows={[]} columns={columns} getRowKey={(row: Item) => row.id}/>);
    // Verifica que no reaparezca la antigua leyenda de rangos;
    // '0 registros' también está presente en 'Mostrar 20 registros por página'.
    expect(markup).not.toContain('Mostrando');
    expect(markup).toContain('Sin registros');
    expect(markup).toContain('Mostrar 20 registros por página');
  });
});

describe('Animación de presencia de alarmas', () => {
  it('entra desde arriba cuando surge una alarma y queda visible', () => {
    expect(nextAlarmMotion('hidden', true)).toBe('entering');
    expect(nextAlarmMotion('entering', true)).toBe('entering');
    expect(nextAlarmMotion('visible', true)).toBe('visible');
  });

  it('anima hacia arriba al reconocer la última alarma antes de desmontar', () => {
    expect(nextAlarmMotion('visible', false)).toBe('exiting');
    expect(nextAlarmMotion('exiting', false)).toBe('exiting');
    expect(nextAlarmMotion('hidden', false)).toBe('hidden');
  });

  it('cancela la salida si llega otra alarma durante la animación', () => {
    expect(nextAlarmMotion('exiting', true)).toBe('entering');
  });
});
