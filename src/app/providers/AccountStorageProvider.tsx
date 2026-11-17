import { createContext, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { createAccountScopedStorage, type KeyValueStorage } from '../../infrastructure/persistence/AccountScopedStorage';

const Context = createContext<KeyValueStorage | null>(null);
type StorageResult = { ok: true; storage: KeyValueStorage } | { ok: false; message: string };

/**
 * Se monta solamente después de Auth+RLS. Impide que varias cuentas del mismo
 * navegador compartan incidentes, reportes y configuración local.
 * En caso de fallo de migración, NO se monta el producto con historiales vacíos.
 */
export function AccountStorageProvider({ userId, children }: { userId: string; children: ReactNode }) {
  function initialize(): StorageResult {
    try {
      const storage = createAccountScopedStorage(window.localStorage, userId);
      return { ok: true, storage };
    } catch (cause) {
      return { ok: false, message: cause instanceof Error ? cause.message : 'No se pudo preparar el almacenamiento.' };
    }
  }
  const [result, setResult] = useState<StorageResult>(initialize);
  if (!result.ok) return <main className="grid min-h-screen place-items-center bg-[var(--page)] p-6" role="main">
    <section role="alert" className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--text)] shadow-lg">
      <AlertTriangle className="mb-3 text-[var(--danger)]" size={28} aria-hidden="true" />
      <h1 className="text-lg font-bold">No se pudo cargar el historial local</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Para evitar mostrar datos incompletos, VISION AI detuvo el acceso a los módulos. Revisa el almacenamiento del navegador y vuelve a intentar.</p>
      <p className="mt-2 break-words text-xs text-[var(--danger)]">{result.message}</p>
      <button type="button" onClick={() => setResult(initialize())} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-text)] focus-visible:outline-2">
        <RotateCcw size={16} aria-hidden="true"/> Reintentar
      </button>
    </section>
  </main>;
  return <Context.Provider value={result.storage}>{children}</Context.Provider>;
}

export function useAccountStorage(): KeyValueStorage {
  const storage = useContext(Context);
  if (!storage) throw new Error('Los repositorios requieren una cuenta autenticada.');
  return storage;
}
