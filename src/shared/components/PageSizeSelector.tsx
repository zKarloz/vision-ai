/** Opciones únicas para todas las tablas paginadas del sistema. */
export const PAGE_SIZES = [5, 10, 20] as const;
export type PageSize = typeof PAGE_SIZES[number];

/**
 * Selector compartido de cantidad de registros.
 * Se emplean botones reales para permitir teclado, lectores de pantalla y uso táctil.
 */
export function PageSizeSelector({ value, onChange }: {
  value: PageSize;
  onChange: (next: PageSize) => void;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs text-[var(--muted)]">Registros por página</span>
    <div role="group" aria-label="Registros por página" className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-1">
      {PAGE_SIZES.map(size => <button
        type="button"
        key={size}
        aria-label={`Mostrar ${size} registros por página`}
        aria-pressed={value === size}
        onClick={() => onChange(size)}
        className={`min-h-8 min-w-9 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${value === size
          ? 'bg-[var(--card)] text-[var(--text)] shadow-sm'
          : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
      >{size}</button>)}
    </div>
  </div>;
}
