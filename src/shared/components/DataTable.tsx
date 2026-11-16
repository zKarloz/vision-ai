import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export interface TableColumn<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string }

/** Tabla genérica paginada del cliente. Filtrado remoto y paginación de API se añadirán en Etapa 3. */
export function DataTable<T>({ rows, columns, getRowKey, pageSize = 6, emptyMessage = 'No hay resultados para los filtros actuales.' }: {
  rows: readonly T[]; columns: TableColumn<T>[]; getRowKey: (row: T) => string; pageSize?: number; emptyMessage?: string;
}) {
  const [page, setPage] = useState(1);
  const safePageSize = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * safePageSize, current * safePageSize);
  return <div>
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="border-y border-[var(--border)] bg-[var(--muted-bg)] text-[11px] uppercase tracking-wide text-[var(--muted)]"><tr>{columns.map((column) => <th scope="col" key={column.key} className={`px-5 py-3 font-semibold ${column.className ?? ''}`}>{column.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{slice.map((row) => <tr key={getRowKey(row)} className="transition-colors hover:bg-[var(--hover)]">{columns.map((column) => <td key={column.key} className={`px-5 py-4 align-middle ${column.className ?? ''}`}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 && <EmptyState title="Sin registros" description={emptyMessage} />}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4">
      <p className="text-xs text-[var(--muted)]">{rows.length === 0 ? '0 registros' : `Mostrando ${(current - 1) * safePageSize + 1}–${Math.min(current * safePageSize, rows.length)} de ${rows.length}`}</p>
      <div className="flex items-center gap-2"><span className="mr-1 text-xs text-[var(--muted)]">Página {current} de {pages}</span><Button size="sm" aria-label="Página anterior" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={15} /></Button><Button size="sm" aria-label="Página siguiente" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={15} /></Button></div>
    </footer>
  </div>;
}
