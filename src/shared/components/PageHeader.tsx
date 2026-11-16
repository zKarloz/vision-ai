import type { ReactNode } from 'react';

/** Cabecera uniforme con subtítulo y una acción contextual opcional. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div className="max-w-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">{eyebrow}</p>
      <h1 className="text-[clamp(1.7rem,3vw,2.15rem)] font-bold tracking-tight text-[var(--text)]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}
