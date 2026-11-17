import { Cloud, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { useRemoteSync } from '../../app/providers/RemoteSyncProvider';
import { Button } from '../../shared/components/Button';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';

/** Estado remoto operativo. El login habilita sincronización sin activar envíos manuales. */
export function RemoteConnectionPanel() {
  const auth = useAuth();
  const remote = useRemoteSync();
  const status = remote.error ? 'Error de sincronización' : remote.busy ? 'Sincronizando…' :
    remote.pendingCount > 0 ? `${remote.pendingCount} cambios pendientes` : remote.lastSyncedAt ? 'Sincronizado' : 'Preparando primera sincronización';
  return <Panel className="p-5">
    <h2 className="flex items-center gap-2 text-sm font-bold"><Cloud size={17}/> Supabase · Integración remota</h2>
    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Los incidentes YOLO y sus auditorías se sincronizan automáticamente con una sesión autorizada. Si la conexión falla, quedan guardados localmente para reintentarlo. No se envían fotografías ni videos.</p>
    <div className="mt-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="success"><ShieldCheck size={12}/>{auth.role}</StatusBadge>
        <span className="break-all text-[var(--muted)]">{auth.session?.user.email}</span>
      </div>
      <div className="space-y-2" role="status" aria-live="polite">
        <StatusBadge tone={remote.error ? 'danger' : remote.busy || remote.pendingCount ? 'warning' : 'success'}>{status}</StatusBadge>
        <p className="text-[var(--muted)]">Última comprobación: {remote.lastSyncedAt ? new Date(remote.lastSyncedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Pendiente'} · {remote.syncedCount} incidentes actualizados en el último lote.</p>
        <Button size="sm" disabled={remote.busy} onClick={() => void remote.syncNow()}><RefreshCcw size={14}/> Reintentar ahora</Button>
      </div>
      {auth.role === 'administrador' && <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Envíos remotos</strong>
          <Button size="sm" onClick={() => void remote.refreshJobs()}><RefreshCcw size={14}/> Consultar envíos</Button></div>
        {remote.jobs.length ? remote.jobs.map(job => <p key={job.key} className="rounded-lg bg-[var(--muted-bg)] p-2">
          {job.day_lima} · <strong>{job.status}</strong> · intento {job.attempts}
          {job.provider_accepted_at ? ` · aceptado por proveedor ${new Date(job.provider_accepted_at).toLocaleString('es-PE')}` : ''}
          {job.last_error ? ` · ${job.last_error}` : ''}
        </p>) : <p className="text-[var(--muted)]">Sin trabajos consultados; la programación está administrada en Supabase.</p>}
      </div>}
    </div>
    {remote.error && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{remote.error}</p>}
    <p className="mt-3 text-[11px] text-[var(--muted)]">El servidor envía los resúmenes diarios por Cron y Resend. La sincronización requiere que el navegador con YOLO haya registrado y enviado los eventos; el cierre del navegador detiene la captura.</p>
  </Panel>;
}
