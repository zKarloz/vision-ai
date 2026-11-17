import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

/** La etiqueta siempre tiene texto; no depende solamente del color. */
export function StatusBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const styles = {
    neutral: 'bg-[var(--muted-bg)] text-[var(--muted)] border-[var(--border)]',
    success: 'bg-[var(--success-bg)] text-[var(--success)] border-transparent',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-transparent',
    danger: 'bg-[var(--danger-bg)] text-[var(--danger)] border-transparent',
  };
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', styles[tone])}>{children}</span>;
}
