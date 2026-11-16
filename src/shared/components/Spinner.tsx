import { LoaderCircle } from 'lucide-react';

/** Indicador de carga reutilizable; incluye un anuncio para lectores de pantalla. */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{label}</span>;
}
