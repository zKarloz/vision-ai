import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

/** Patrón de estado vacío compartido por tablas y futuras bandejas. */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-4 rounded-2xl bg-[var(--muted-bg)] p-3 text-[var(--muted)]"><Inbox size={24} aria-hidden="true" /></div>
    <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
    <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--muted)]">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}
