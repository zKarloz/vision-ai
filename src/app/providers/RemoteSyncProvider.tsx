import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { remoteClient, getInstallationId } from '../../infrastructure/supabase/client';
import { upsertRemoteChanges } from '../../infrastructure/supabase/incidentSync';
import { buildRemotePayload, canSync } from '../../application/remote/remotePayload';
import { emptyCheckpoint, parseCheckpoint, planRemoteSync, type SyncCheckpoint } from '../../application/remote/syncCheckpoint';
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
  pendingCount: number;
  lastSyncedAt: string | null;
  syncedCount: number;
  jobs: RemoteJobInfo[];
  syncNow: () => Promise<void>;
  refreshJobs: () => Promise<void>;
}
const Context = createContext<RemoteContextValue | null>(null);
const CHECKPOINT_PREFIX = 'vision-ai:remote-checkpoint:v1:';

/** Clave separada por cuenta e instalación; nunca se guarda el JWT. */
function checkpointKey(userId: string, installationId: string) {
  return `${CHECKPOINT_PREFIX}${userId}:${installationId}`;
}

/**
 * Sincronización automática al entrar con una sesión autorizada.
 * Los cambios se confirman en el cursor local solo DESPUÉS de PostgreSQL.
 * Si falla la red, el IncidentCenter conserva eventos/auditorías en localStorage.
 * Las políticas RLS siguen validándose en el servidor: el cursor NO autoriza accesos.
 */
export function RemoteSyncProvider({ children }: { children: ReactNode }) {
  const { session, role } = useAuth();
  const { state: incidents } = useIncidentCenter();
  const enabled = !!remoteClient && !!session && canSync(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [jobs, setJobs] = useState<RemoteJobInfo[]>([]);
  const activeSync = useRef(false);
  const pendingSync = useRef(false);
  const latestIncidents = useRef(incidents);
  latestIncidents.current = incidents;
  const checkpointRef = useRef<{ key: string; value: SyncCheckpoint } | null>(null);

  function getCheckpoint(key: string): SyncCheckpoint {
    if (checkpointRef.current?.key === key) return checkpointRef.current.value;
    let checkpoint = emptyCheckpoint();
    try { checkpoint = parseCheckpoint(window.localStorage.getItem(key)); }
    catch { /* La cola sigue en IncidentCenter; el siguiente intento repite upsert idempotente. */ }
    checkpointRef.current = { key, value: checkpoint };
    return checkpoint;
  }

  function preparePlan() {
    if (!session || !enabled) return null;
    const installationId = getInstallationId();
    const key = checkpointKey(session.user.id, installationId);
    const payload = buildRemotePayload(latestIncidents.current, session.user.id, installationId, new Date().toISOString());
    return { key, plan: planRemoteSync(payload, getCheckpoint(key)) };
  }

  async function syncNow(): Promise<void> {
    if (!remoteClient || !session || !enabled) return;
    if (activeSync.current) { pendingSync.current = true; return; }
    activeSync.current = true;
    setBusy(true); setError('');
    try {
      do {
        pendingSync.current = false;
        const prepared = preparePlan();
        if (!prepared) return;
        const { key, plan } = prepared;
        setPendingCount(plan.pendingCount);
        if (plan.pendingCount > 0) {
          const count = await upsertRemoteChanges(remoteClient, plan.incidents, plan.audit);
          // Evitar pérdida de trabajos: el cursor solo avanza cuando ambos lotes terminaron.
          checkpointRef.current = { key, value: plan.checkpoint };
          try { window.localStorage.setItem(key, JSON.stringify(plan.checkpoint)); }
          catch { /* En memoria esta sesión; el upsert remoto sigue siendo idempotente. */ }
          setSyncedCount(count);
        } else setSyncedCount(0);
        setLastSyncedAt(new Date().toISOString());
        setPendingCount(0);
      } while (pendingSync.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible sincronizar los datos.');
      try { setPendingCount(preparePlan()?.plan.pendingCount ?? 0); }
      catch { /* Se mantiene el error principal sin ocultarlo. */ }
    } finally { activeSync.current = false; setBusy(false); }
  }

  // El primer acceso autorizado y cada cambio de incidentes programan un envío corto.
  useEffect(() => {
    if (!enabled) return;
    try { setPendingCount(preparePlan()?.plan.pendingCount ?? 0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al preparar la sincronización.'); return; }
    const timeout = window.setTimeout(() => { void syncNow(); }, 900);
    return () => window.clearTimeout(timeout);
  }, [incidents, enabled, session?.user.id]);

  // Reintentar también cuando vuelve Internet, al reabrir la pestaña y cada minuto.
  useEffect(() => {
    if (!enabled) return;
    const retry = () => { if (navigator.onLine && document.visibilityState !== 'hidden') void syncNow(); };
    const interval = window.setInterval(retry, 60_000);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.clearInterval(interval); window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [enabled, session?.user.id]);

  async function refreshJobs(): Promise<void> {
    if (!remoteClient || !session || role !== 'administrador') return;
    const { data, error: jobsError } = await remoteClient.from('vision_report_jobs')
      .select('key,day_lima,status,attempts,provider_accepted_at,last_error')
      .order('day_lima', { ascending: false }).limit(30);
    if (jobsError) { setError(jobsError.message); return; }
    setJobs((data ?? []) as RemoteJobInfo[]);
  }

  return <Context.Provider value={{ enabled, busy, error, pendingCount, lastSyncedAt, syncedCount, jobs, syncNow, refreshJobs }}>
    {children}
  </Context.Provider>;
}

export function useRemoteSync() {
  const context = useContext(Context);
  if (!context) throw new Error('useRemoteSync requiere RemoteSyncProvider.');
  return context;
}
