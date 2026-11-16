import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  children: ReactNode;
}

/** Botón único para el producto, con variantes accesibles y tamaños consistentes. */
export function Button({ variant = 'secondary', size = 'md', className, type = 'button', children, ...props }: Props) {
  const variants: Record<Variant, string> = {
    primary: 'bg-[var(--primary)] text-[var(--primary-text)] hover:opacity-90 border-transparent',
    secondary: 'bg-[var(--card)] border-[var(--border)] hover:bg-[var(--muted-bg)] text-[var(--text)]',
    ghost: 'border-transparent hover:bg-[var(--muted-bg)] text-[var(--text)]',
    danger: 'bg-red-600 text-white border-transparent hover:bg-red-700',
  };
  return <button type={type} className={cn('inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm', variants[variant], className)} {...props}>{children}</button>;
}
