import { useState } from 'react';
import { BellOff, BellRing, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { pendingAlarms } from '../../core/domain/alarmPolicy';
import { Button } from './Button';
import { Modal } from './Modal';

/** Señal visual obligatoria incluso cuando el navegador bloquea o desactiva el audio. */
export function AlarmStatusBar() {
  const { center, state, soundEnabled, soundError, enableSound, disableSound } = useIncidentCenter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [formError, setFormError] = useState('');
  const active = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated');
  const acknowledged = state.incidents.filter(item => item.status === 'acknowledged');
  const pendingCount = pendingAlarms(state.incidents);
  function acknowledgeInline() {
    const target = active.find(incident => incident.id === selectedId) ?? active[0];
    if (!target) return;
    try {
      center.acknowledge(target.id, supervisor);
      setDialogOpen(false); setSupervisor(''); setFormError('');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No fue posible reconocer la alarma.'); }
  }
  return <div className={`mb-5 rounded-2xl border p-4 ${active.length ? 'border-[var(--danger)] bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--card)]'}`} role="status" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        {active.length ? <BellRing className="mt-0.5 shrink-0 text-[var(--danger)]" size={22}/> : <BellOff className="mt-0.5 shrink-0 text-[var(--muted)]" size={22}/>}
        <div>
          <p className="text-sm font-bold">{pendingCount ? `${pendingCount} alarma(s) pendiente(s) de reconocimiento` : 'Sin alarmas sonoras pendientes'}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {acknowledged.length} incidente(s) reconocido(s) sin cierre · {soundEnabled ? 'Audio habilitado' : 'Audio deshabilitado'} · Eventos de YOLO real
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { if (soundEnabled) disableSound(); else void enableSound(); }}>
          {soundEnabled ? <VolumeX size={15}/> : <Volume2 size={15}/>}{soundEnabled ? 'Desactivar sonido' : 'Activar alarmas sonoras'}
        </Button>
        {active.length > 0 && <Button size="sm" variant="primary" onClick={() => { setSelectedId(active[0].id); setDialogOpen(true); setFormError(''); }}>Reconocer aquí</Button>}
        <Link to="/incidentes" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--muted-bg)]"><ShieldAlert size={15}/> Gestionar incidentes</Link>
      </div>
    </div>
    {soundError && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{soundError}</p>}
    {!soundEnabled && <p className="mt-2 text-[11px] text-[var(--muted)]">Para escuchar la sirena, pulsa «Activar alarmas sonoras». La señal visual funciona incluso sin audio.</p>}
    {!state.storageOk && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">No se pudo guardar el historial en este navegador. Los datos permanecen solo en memoria.</p>}
    <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title="Reconocer alarma durante el monitoreo"
      description="El reconocimiento silencia la alarma seleccionada, sin detener YOLO ni cerrar el incidente.">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); acknowledgeInline(); }}>
        <label className="block text-xs font-bold">Incidente
          <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
            {active.map(item => <option value={item.id} key={item.id}>{item.id} · {item.cameraId} · {item.zoneId}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold">Supervisor (identidad de prueba)
          <input className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={supervisor} onChange={event => setSupervisor(event.target.value)} maxLength={80} placeholder="Nombre del supervisor" required />
        </label>
        {formError && <p role="alert" className="text-xs text-[var(--danger)]">{formError}</p>}
        <div className="flex justify-end gap-2"><Button onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Reconocer incidente</Button></div>
      </form>
    </Modal>
  </div>;
}
