import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { wrappedFocusTarget } from '../utils/focusTrap';

interface Props { open: boolean; onClose: () => void; title: string; description?: string; size?: 'md' | 'lg'; children: ReactNode }

/** Diálogo compartido con escape, foco inicial y restauración del foco. */
export function Modal({ open, onClose, title, description, size = 'md', children }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);
  useEffect(() => { closeHandler.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHandler.current();
      // Conserva el foco dentro del diálogo mientras está abierto.
      if (event.key === 'Tab' && dialogRef.current) {
        const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(selector)).filter((element) => element.offsetParent !== null);
        const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const target = wrappedFocusTarget(focusable, focused, event.shiftKey);
        if (target) { event.preventDefault(); target.focus(); }
        else if (!focusable.length) { event.preventDefault(); closeRef.current?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`max-h-[90vh] w-full ${size === 'lg' ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl`}>
      <div className="mb-5 flex justify-between gap-3">
        <div><h2 id={titleId} className="text-lg font-bold text-[var(--text)]">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm text-[var(--muted)]">{description}</p>}</div>
        <button ref={closeRef} onClick={onClose} className="h-8 w-8 shrink-0 rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--muted-bg)]" aria-label="Cerrar diálogo"><X size={20} /></button>
      </div>
      {children}
    </section>
  </div>, document.body);
}
