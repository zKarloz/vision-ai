import { Cloud, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { useRemoteSync } from '../../app/providers/RemoteSyncProvider';
import { canSync } from '../../application/remote/remotePayload';
import { Button } from '../../shared/components/Button';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';

/** Panel de sincronización: la sesión se inicia al entrar, no desde Reportes. */
export function RemoteConnectionPanel() {
  const auth = useAuth();
  const remote = useRemoteSync();
  return <Panel className="p-5">
    <h2 className="flex items-center gap-2 text-sm font-bold"><Cloud size={17}/> Supabase · Integración remota</h2>
    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Tu sesión ya se verificó al entrar en VISION AI.
      La sincronización sigue siendo opcional y envía solo metadatos de incidentes YOLO, sin fotos ni clips.</p>
    <div className="mt-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="success"><ShieldCheck size={12}/>{auth.role}</StatusBadge>
        <span className="break-all text-[var(--muted)]">{auth.session?.user.email}</span>
      </div>
      {canSync(auth.role) && (!remote.enabled ? <>
        <p className="text-[var(--muted)]">Al activar, subirás los incidentes YOLO anteriores de este navegador y sus auditorías, además de los nuevos.</p>
        <Button variant="primary" onClick={remote.enableSync}><Cloud size={14}/> Autorizar y habilitar sincronización</Button>
      </> : <div className="space-y-2">
        <StatusBadge tone={remote.busy ? 'warning' : 'success'}>{remote.busy ? 'Sincronizando…' : 'Sincronización habilitada'}</StatusBadge>
        <p className="text-[var(--muted)]">Último éxito: {remote.lastSyncedAt ? new Date(remote.lastSyncedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Pendiente'} · {remote.syncedCount} incidentes locales en el último lote.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={remote.busy} onClick={() => void remote.syncNow()}><RefreshCcw size={14}/> Sincronizar ahora</Button>
          <Button size="sm" onClick={remote.disableSync}>Desactivar sincronización</Button>
        </div>
      </div>)}
      {auth.role === 'administrador' && <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-between"><strong>Envíos remotos</strong>
          <Button size="sm" onClick={() => void remote.refreshJobs()}><RefreshCcw size={14}/> Consultar entregas</Button></div>
        {remote.jobs.length ? remote.jobs.map(job => <p key={job.key} className="rounded-lg bg-[var(--muted-bg)] p-2">
          {job.day_lima} · <strong>{job.status}</strong> · intento {job.attempts}
          {job.provider_accepted_at ? ` · aceptado por proveedor ${new Date(job.provider_accepted_at).toLocaleString('es-PE')}` : ''}
          {job.last_error ? ` · ${job.last_error}` : ''}
        </p>) : <p className="text-[var(--muted)]">Sin trabajos consultados o enviados; la programación se configura en Supabase.</p>}
      </div>}
    </div>
    {remote.error && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{remote.error}</p>}
    <p className="mt-3 text-[11px] text-[var(--muted)]">El envío automático requiere configurar Resend y Cron en Supabase; iniciar sesión no activa correos.</p>
  </Panel>;
}
