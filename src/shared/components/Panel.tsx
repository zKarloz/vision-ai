import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

interface Props extends HTMLAttributes<HTMLDivElement> { children: ReactNode }

/** Superficie común para paneles de las diferentes secciones. */
export function Panel({ children, className, ...props }: Props) {
  return <div className={cn('rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]', className)} {...props}>{children}</div>;
}
