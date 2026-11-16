import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { remoteClient, getInstallationId } from '../../infrastructure/supabase/client';
import { syncIncidentsToSupabase } from '../../infrastructure/supabase/incidentSync';
import { canSync } from '../../application/remote/remotePayload';
import { useIncidentCenter } from './IncidentCenterProvider';
import { useAuth } from './AuthProvider';

export interface RemoteJobInfo {
  key: string;
  day_lima: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  provider_accepted_at: string | null;
  last_error: string | null;
}
interface RemoteContextValue {
  enabled: boolean;
  busy: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncedCount: number;
  jobs: RemoteJobInfo[];
  enableSync: () => void;
  disableSync: () => void;
  syncNow: () => Promise<void>;
  refreshJobs: () => Promise<void>;
}
const Context = createContext<RemoteContextValue | null>(null);

/**
 * La cuenta ya está autenticada por AuthProvider. La sincronización de incidentes
 * sigue siendo opt-in: iniciar sesión NO sube automáticamente el historial local.
 * Nunca se almacenan claves secretas ni contraseñas en este proveedor.
 */
export function RemoteSyncProvider({ children }: { children: ReactNode }) {
  const { session, role } = useAuth();
  const { state: incidents } = useIncidentCenter();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [jobs, setJobs] = useState<RemoteJobInfo[]>([]);
  const activeSync = useRef(false);
  const pendingSync = useRef(false);
  const latestIncidents = useRef(incidents);
  latestIncidents.current = incidents;

  async function syncNow(): Promise<void> {
    if (!remoteClient || !session || !canSync(role) || !enabled) return;
    if (activeSync.current) { pendingSync.current = true; return; }
    activeSync.current = true;
    setBusy(true); setError('');
    try {
      do {
        pendingSync.current = false;
        const count = await syncIncidentsToSupabase(remoteClient, latestIncidents.current, session.user.id, getInstallationId());
        setSyncedCount(count);
        setLastSyncedAt(new Date().toISOString());
      } while (pendingSync.current);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'No fue posible sincronizar los datos.');
    } finally { activeSync.current = false; setBusy(false); }
  }

  // Solo sincronizamos si el administrador lo autorizó expresamente.
  useEffect(() => {
    if (!enabled || !session || !canSync(role)) return;
    const timeout = window.setTimeout(() => { void syncNow(); }, 1000);
    return () => window.clearTimeout(timeout);
  }, [incidents, enabled, session?.user.id, role]);

  useEffect(() => {
    if (!enabled || !session || !canSync(role) || !error) return;
    const interval = window.setInterval(() => { void syncNow(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [enabled, session?.user.id, role, error]);

  async function refreshJobs(): Promise<void> {
    if (!remoteClient || !session || role !== 'administrador') return;
    const { data, error: jobsError } = await remoteClient.from('vision_report_jobs')
      .select('key,day_lima,status,attempts,provider_accepted_at,last_error')
      .order('day_lima', { ascending: false }).limit(30);
    if (jobsError) { setError(jobsError.message); return; }
    setJobs((data ?? []) as RemoteJobInfo[]);
  }

  return <Context.Provider value={{ enabled, busy, error, lastSyncedAt, syncedCount, jobs,
    enableSync: () => { if (canSync(role)) { setError(''); setEnabled(true); } },
    disableSync: () => setEnabled(false), syncNow, refreshJobs }}>
    {children}
  </Context.Provider>;
}

export function useRemoteSync() {
  const context = useContext(Context);
  if (!context) throw new Error('useRemoteSync requiere RemoteSyncProvider.');
  return context;
}
