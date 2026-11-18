import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Una pestaña con contenido propio. Solo se monta el panel seleccionado. */
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  icon?: LucideIcon;
  count?: number;
}

/**
 * Calcula la siguiente pestaña en la navegación horizontal por teclado.
 * Home y End permiten ir directamente a los extremos; Tab sale de la barra.
 */
export function nextTabIndex(key: string, current: number, length: number): number | null {
  if (length <= 0) return null;
  if (key === 'ArrowRight') return (current + 1) % length;
  if (key === 'ArrowLeft') return (current + length - 1) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

/** Pestañas reutilizables, accesibles y compatibles con los dos temas. */
export function Tabs({ items, label }: { items: readonly TabItem[]; label: string }) {
  const idPrefix = useId();
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, items.findIndex(item => item.id === activeId));

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    setActiveId(items[next].id);
    buttonRefs.current[next]?.focus();
  }

  if (!items.length) return null;

  return <section aria-label={label}>
    <div role="tablist" aria-label={label}
      className="flex w-full max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--muted-bg)] p-1.5 shadow-sm"
    >
      {items.map((item, index) => {
        const selected = index === activeIndex;
        const Icon = item.icon;
        return <button
          key={item.id}
          ref={element => { buttonRefs.current[index] = element; }}
          id={`${idPrefix}-tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={`${idPrefix}-panel-${item.id}`}
          tabIndex={selected ? 0 : -1}
          onClick={() => setActiveId(item.id)}
          onKeyDown={event => handleKeyDown(event, index)}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:z-10 ${selected
            ? 'border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-sm'
            : 'border-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
        >
          {Icon && <Icon size={16} aria-hidden="true" />}
          {item.label}
          {typeof item.count === 'number' && <span aria-label={`${item.count} registros`}
            className="rounded-full bg-[var(--muted-bg)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--muted)]"
          >{item.count}</span>}
        </button>;
      })}
    </div>
    {items.map((item, index) => <div
      key={item.id}
      id={`${idPrefix}-panel-${item.id}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${item.id}`}
      tabIndex={0}
      hidden={index !== activeIndex}
      className="pt-5"
    >
      {index === activeIndex ? item.content : null}
    </div>)}
  </section>;
}
