import { useEffect, useState } from 'react';
import { BellOff, BellRing, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { pendingAlarms } from '../../core/domain/alarmPolicy';
import { Button } from './Button';
import { Modal } from './Modal';

type AlarmView = 'settings' | 'floating';

/**
 * Las alarmas se muestran en una sola ubicación según su estado:
 * - Sin pendientes: tarjeta de ajustes en Configuración.
 * - Con pendientes: notificación compacta y flotante en Monitoreo.
 * El menú de cuenta conserva su indicador global independientemente de la ruta.
 */
export function shouldRenderAlarmView(view: AlarmView, pendingCount: number): boolean {
  return view === 'floating' ? pendingCount > 0 : pendingCount === 0;
}

export function AlarmStatusBar({ variant = 'settings' }: { variant?: AlarmView }) {
  const { center, state, soundEnabled, soundError, enableSound, disableSound } = useIncidentCenter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [formError, setFormError] = useState('');
  const pending = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated');
  const acknowledgedCount = state.incidents.filter(item => item.status === 'acknowledged').length;
  const pendingCount = pendingAlarms(state.incidents);
  const isFloating = variant === 'floating';

  // Al reconocer la última alarma se descarta el diálogo anterior.
  useEffect(() => {
    if (pendingCount === 0) setDialogOpen(false);
  }, [pendingCount]);

  // Si no corresponde el estado a esta ruta, no se monta ninguna tarjeta.
  if (!shouldRenderAlarmView(variant, pendingCount)) return null;

  function acknowledgeInline() {
    const target = pending.find(incident => incident.id === selectedId) ?? pending[0];
    if (!target) return;
    try {
      center.acknowledge(target.id, supervisor);
      setDialogOpen(false);
      setSupervisor('');
      setFormError('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No fue posible reconocer la alarma.');
    }
  }

  const soundButton = <Button size="sm" onClick={() => {
    if (soundEnabled) disableSound(); else void enableSound();
  }}>
    {soundEnabled ? <VolumeX size={15}/> : <Volume2 size={15}/>}
    {soundEnabled ? 'Silenciar audio' : 'Activar sonido'}
  </Button>;

  return <>
    {isFloating ? (
      <div className="pointer-events-none fixed right-4 top-[82px] z-[15] w-[min(360px,calc(100vw-2rem))] sm:right-6">
        <div role="status" aria-label="Alarma de monitoreo" aria-live="polite" className="pointer-events-auto rounded-2xl border border-[var(--danger)] bg-[var(--card)] p-4 text-[var(--text)] shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-[var(--danger-bg)] p-2 text-[var(--danger)]"><BellRing size={19} aria-hidden="true"/></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{pendingCount === 1 ? '1 alarma pendiente' : `${pendingCount} alarmas pendientes`}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Requiere reconocimiento · {soundEnabled ? 'Audio activo' : 'Audio desactivado'}</p>
              {pending.length === 1 && <p className="mt-1 truncate text-[11px] text-[var(--muted)]" title={`${pending[0].cameraId} · ${pending[0].zoneId}`}>{pending[0].cameraId} · {pending[0].zoneId}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => {
              setSelectedId(pending[0]?.id ?? ''); setDialogOpen(true); setFormError('');
            }}>Reconocer</Button>
            {soundButton}
            <Link to="/incidentes" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--muted-bg)]"><ShieldAlert size={14}/> Ver incidentes</Link>
          </div>
          {soundError && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{soundError}</p>}
          {!state.storageOk && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">El historial no se pudo guardar en este navegador.</p>}
        </div>
      </div>
    ) : (
      <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" aria-label="Configuración de alarmas" role="status">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 shrink-0 text-[var(--muted)]" size={22} aria-hidden="true"/>
            <div>
              <p className="text-sm font-bold">Sin alarmas sonoras pendientes</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{acknowledgedCount} incidente(s) reconocido(s) sin cierre · {soundEnabled ? 'Audio habilitado' : 'Audio deshabilitado'}</p>
            </div>
          </div>
          {soundButton}
        </div>
        {!soundEnabled && <p className="mt-2 text-[11px] text-[var(--muted)]">Para escuchar la sirena, pulsa «Activar sonido». La alerta visual funciona sin audio.</p>}
        {soundError && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{soundError}</p>}
        {!state.storageOk && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">El historial no se pudo guardar en este navegador.</p>}
      </section>
    )}
    <Modal open={dialogOpen && pendingCount > 0} onClose={() => setDialogOpen(false)} title="Reconocer alarma durante el monitoreo"
      description="El reconocimiento silencia la alarma seleccionada sin detener YOLO ni cerrar el incidente.">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); acknowledgeInline(); }}>
        <label className="block text-xs font-bold">Incidente
          <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
            {pending.map(item => <option value={item.id} key={item.id}>{item.id} · {item.cameraId} · {item.zoneId}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold">Supervisor (identidad de prueba)
          <input className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={supervisor} onChange={event => setSupervisor(event.target.value)} maxLength={80} placeholder="Nombre del supervisor" required/>
        </label>
        {formError && <p role="alert" className="text-xs text-[var(--danger)]">{formError}</p>}
        <div className="flex justify-end gap-2"><Button onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Reconocer incidente</Button></div>
      </form>
    </Modal>
  </>;
}
