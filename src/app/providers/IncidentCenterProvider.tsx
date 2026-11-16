import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { IncidentCenter } from '../../application/incidents/IncidentCenter';
import { shouldSound } from '../../core/domain/alarmPolicy';
import { Siren } from '../../infrastructure/simulation/Siren';

interface IncidentContextValue {
  center: IncidentCenter;
  soundEnabled: boolean;
  soundError: string;
  enableSound: () => Promise<void>;
  disableSound: () => void;
}
const Context = createContext<IncidentContextValue | null>(null);

/**
 * Los incidentes y la alarma son compartidos por todas las rutas.
 * El sonido nunca se habilita automáticamente: requiere un clic explícito.
 * Sin navegador activo no hay monitoreo YOLO continuo ni alarma garantizada.
 */
export function IncidentCenterProvider({ children }: { children: ReactNode }) {
  const [center] = useState(() => {
    // Algunos navegadores bloquean incluso el acceso a window.localStorage.
    try { return new IncidentCenter(typeof window !== 'undefined' ? window.localStorage : null); }
    catch { return new IncidentCenter(null); }
  });
  const sirenRef = useRef<Siren | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState('');
  const state = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  const alarmRequired = shouldSound(soundEnabled, state.incidents);

  useEffect(() => {
    if (!soundEnabled || !sirenRef.current) return;
    if (alarmRequired) sirenRef.current.start();
    else sirenRef.current.silence();
  }, [soundEnabled, alarmRequired]);

  useEffect(() => {
    const interval = window.setInterval(() => center.escalateOverdue(), 5000);
    center.escalateOverdue();
    return () => window.clearInterval(interval);
  }, [center]);

  useEffect(() => () => {
    // Liberar el AudioContext sin conservar referencias entre montajes.
    const siren = sirenRef.current;
    sirenRef.current = null;
    if (siren) void siren.dispose();
  }, []);

  async function enableSound(): Promise<void> {
    setSoundError('');
    const siren = sirenRef.current ?? new Siren();
    sirenRef.current = siren;
    try {
      await siren.unlock();
      setSoundEnabled(true);
    } catch (error) {
      setSoundEnabled(false);
      setSoundError(error instanceof Error ? error.message : 'El navegador no permitió habilitar audio.');
    }
  }

  function disableSound(): void {
    sirenRef.current?.silence();
    setSoundEnabled(false);
  }

  return <Context.Provider value={{ center, soundEnabled, soundError, enableSound, disableSound }}>
    {children}
  </Context.Provider>;
}

/** Estado suscrito al bus local, sin polling ni duplicar la lógica de incidentes. */
export function useIncidentCenter() {
  const context = useContext(Context);
  if (!context) throw new Error('useIncidentCenter requiere IncidentCenterProvider.');
  const state = useSyncExternalStore(context.center.subscribe, context.center.getSnapshot, context.center.getSnapshot);
  return { ...context, state };
}
