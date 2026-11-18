import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { PageSizeSelector, type PageSize } from './PageSizeSelector';

export interface TableColumn<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string }

/**
 * Tabla paginada compartida. Todas comienzan con cinco registros y el mismo
 * selector 5/10/20, sin depender del módulo donde se utilicen.
 */
export function DataTable<T>({ rows, columns, getRowKey, emptyMessage = 'No hay resultados para los filtros actuales.', accessibleName = 'Tabla de resultados' }: {
  rows: readonly T[];
  columns: TableColumn<T>[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  accessibleName?: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(5);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  // El filtro de una tabla puede reducir sus páginas: nunca mostramos una página vacía.
  useEffect(() => {
    setPage(previous => Math.min(previous, pages));
  }, [pages]);
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);

  function changePageSize(next: PageSize) {
    setPageSize(next);
    setPage(1); // Evita dejar al usuario en una página inexistente al cambiar el tamaño.
  }

  return <div>
    <div className="w-full overflow-x-auto" role="region" tabIndex={0} aria-label={`${accessibleName}, desplazamiento horizontal`}>
      <table className="w-full min-w-[660px] text-left text-sm">
        <caption className="sr-only">{accessibleName}</caption>
        <thead className="border-y border-[var(--border)] bg-[var(--muted-bg)] text-[11px] uppercase tracking-wide text-[var(--muted)]"><tr>{columns.map((column) => <th scope="col" key={column.key} className={`px-5 py-3 font-semibold ${column.className ?? ''}`}>{column.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{slice.map((row) => <tr key={getRowKey(row)} className="transition-colors hover:bg-[var(--hover)]">{columns.map((column) => <td key={column.key} className={`px-5 py-4 align-middle ${column.className ?? ''}`}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 && <EmptyState title="Sin registros" description={emptyMessage} />}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 sm:px-5">
      <PageSizeSelector value={pageSize} onChange={changePageSize}/>
      <div className="flex items-center gap-2"><span className="mr-1 text-xs text-[var(--muted)]">Página {current} de {pages}</span><Button size="sm" aria-label="Página anterior" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={15}/></Button><Button size="sm" aria-label="Página siguiente" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={15}/></Button></div>
    </footer>
  </div>;
}
