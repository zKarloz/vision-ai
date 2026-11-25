import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellOff, BellRing, CheckCheck, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { useSharedHistory } from '../../app/providers/SharedHistoryProvider';
import { remoteClient, getInstallationId } from '../../infrastructure/supabase/client';
import { buildRemotePayload, remoteIncidentId } from '../../application/remote/remotePayload';
import { upsertRemoteChanges } from '../../infrastructure/supabase/incidentSync';
import { pendingAlarms } from '../../core/domain/alarmPolicy';
import { Button } from './Button';
import { Modal } from './Modal';
import { useAuth } from '../../app/providers/AuthProvider';
import { canAcknowledgeIncident } from '../../application/remote/accessPolicy';

type AlarmView = 'settings' | 'floating';
export type AlarmMotion = 'hidden' | 'entering' | 'visible' | 'exiting';

/**
 * Controla la presencia de la notificación flotante sin desmontarla de inmediato.
 * Esto permite reproducir la salida hacia arriba antes de retirarla del DOM.
 */
export function nextAlarmMotion(current: AlarmMotion, hasPending: boolean): AlarmMotion {
  if (hasPending) return current === 'hidden' || current === 'exiting' ? 'entering' : current;
  return current === 'hidden' ? 'hidden' : 'exiting';
}


/**
 * Las alarmas se muestran en una sola ubicación según su estado:
 * - Sin pendientes: tarjeta de ajustes en Configuración.
 * - Con pendientes: notificación compacta y flotante en Monitoreo.
 * El menú de cuenta conserva su indicador global independientemente de la ruta.
 */
export function shouldRenderAlarmView(view: AlarmView, pendingCount: number): boolean {
  return view === 'floating' ? pendingCount > 0 : pendingCount === 0;
}

/**
 * Vista móvil compacta de las alarmas. Concentra la información crítica y
 * mantiene las mismas acciones que la tarjeta de escritorio, con nombres
 * accesibles para botones que muestran solo iconos.
 */
export function MobileAlarmNotice({
  count, cameraId, zoneId, soundEnabled, mayAcknowledge, onAcknowledge, onToggleSound,
}: {
  count: number;
  cameraId?: string;
  zoneId?: string;
  soundEnabled: boolean;
  mayAcknowledge: boolean;
  onAcknowledge: () => void;
  onToggleSound: () => void;
}) {
  const summary = `${count} ${count === 1 ? 'alarma pendiente' : 'alarmas pendientes'}`;
  return <div className="flex w-full min-w-0 items-center gap-1.5 sm:hidden" aria-label={summary}>
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--danger-bg)] text-[var(--danger)]">
      <BellRing size={17} aria-hidden="true"/>
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-bold" title={summary}>{count} {count === 1 ? 'alarma' : 'alarmas'}</p>
      <p className="truncate text-[11px] text-[var(--muted)]" title={cameraId && zoneId ? `${cameraId} · ${zoneId}` : 'Requiere atención'}>
        {cameraId && zoneId ? `${cameraId} · ${zoneId}` : 'Requiere atención'}
      </p>
    </div>
    {mayAcknowledge && <Button size="sm" variant="primary" className="h-9 w-9 shrink-0" style={{ padding: 0 }}
      aria-label="Reconocer alarma" title="Reconocer alarma" onClick={onAcknowledge}>
      <CheckCheck size={17} aria-hidden="true"/>
    </Button>}
    <Button size="sm" className="h-9 w-9 shrink-0" style={{ padding: 0 }}
      aria-label={soundEnabled ? 'Silenciar audio' : 'Activar sonido'}
      title={soundEnabled ? 'Silenciar audio' : 'Activar sonido'} onClick={onToggleSound}>
      {soundEnabled ? <VolumeX size={17} aria-hidden="true"/> : <Volume2 size={17} aria-hidden="true"/>}
    </Button>
    <Link to="/incidentes" aria-label="Ver incidentes" title="Ver incidentes"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] hover:bg-[var(--muted-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
      <ShieldAlert size={17} aria-hidden="true"/>
    </Link>
  </div>;
}

export function AlarmStatusBar({ variant = 'settings' }: { variant?: AlarmView }) {
  const { state, soundEnabled, soundError, enableSound, disableSound } = useIncidentCenter();
  const shared = useSharedHistory();
  const { role, session } = useAuth();
  const mayAcknowledge = canAcknowledgeIncident(role);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated');
  const acknowledgedCount = state.incidents.filter(item => item.status === 'acknowledged').length;
  const pendingCount = pendingAlarms(state.incidents);
  const isFloating = variant === 'floating';
  // Conserva el último contenido mientras la tarjeta se desliza hacia arriba;
  // de lo contrario mostraría fugazmente «0 alarmas pendientes» durante la salida.
  const lastPending = useRef(pending);
  if (pendingCount > 0) lastPending.current = pending;
  const displayPending = pendingCount > 0 ? pending : lastPending.current;
  const displayCount = pendingCount > 0 ? pendingCount : displayPending.length;
  const [motion, setMotion] = useState<AlarmMotion>(
    isFloating && pendingCount > 0 ? 'entering' : 'hidden',
  );

  // Al reconocer la última alarma se inicia la salida, no se desmonta la tarjeta.
  // Si aparece otra alarma durante la salida, se cancela y vuelve a entrar.
  useEffect(() => {
    if (!isFloating) return;
    setMotion(previous => nextAlarmMotion(previous, pendingCount > 0));
  }, [isFloating, pendingCount]);

  function finishMotion() {
    setMotion(previous => {
      if (previous === 'entering' && pendingCount > 0) return 'visible';
      if (previous === 'exiting' && pendingCount === 0) return 'hidden';
      return previous;
    });
  }

  // Al reconocer la última alarma se descarta el diálogo anterior.
  useEffect(() => {
    if (pendingCount === 0) setDialogOpen(false);
  }, [pendingCount]);

  // En modo flotante mantenemos la tarjeta durante la animación de salida.
  if (isFloating ? motion === 'hidden' : !shouldRenderAlarmView(variant, pendingCount)) return null;

  async function acknowledgeInline() {
    const target = pending.find(incident => incident.id === selectedId) ?? pending[0];
    if (!target || !mayAcknowledge || !session || !remoteClient || saving) return;
    setSaving(true);
    try {
      // La detección puede haberse creado hace menos de 900 ms y aún no existir
      // en Supabase. Sincronizar solo este incidente ANTES del RPC transaccional.
      const installation = getInstallationId();
      const globalId = remoteIncidentId(session.user.id, installation, target.id);
      const payload = buildRemotePayload(state, session.user.id, installation, new Date().toISOString());
      const row = payload.incidents.find(item => item.id === globalId);
      if (!row) throw new Error('Este incidente todavía no tiene un registro YOLO sincronizable.');
      await upsertRemoteChanges(remoteClient, [row], payload.audit.filter(item => item.incident_id === globalId));
      await shared.actOnIncident(globalId, 'acknowledge');
      setDialogOpen(false);
      setFormError('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No fue posible reconocer la alarma.');
    } finally { setSaving(false); }
  }

  // Ambas variantes (móvil/escritorio) comparten los manejadores de negocio.
  function openAcknowledgeDialog() {
    setSelectedId(pending[0]?.id ?? '');
    setDialogOpen(true);
    setFormError('');
  }

  function toggleSound() {
    if (soundEnabled) disableSound(); else void enableSound();
  }

  const soundButton = <Button size="sm" className={isFloating ? 'min-w-0 w-full sm:w-auto' : undefined}
    style={isFloating ? { whiteSpace: 'normal' } : undefined} onClick={toggleSound}>
    {soundEnabled ? <VolumeX size={15}/> : <Volume2 size={15}/>}
    {soundEnabled ? 'Silenciar audio' : 'Activar sonido'}
  </Button>;

  return <>
    {isFloating ? (typeof document === 'undefined' ? null : createPortal(
      // El portal elimina la alerta del árbol del layout 3D y evita que un
      // contenedor transformado cambie el tamaño o el anclaje del flotante.
      <div className="pointer-events-none fixed left-2 right-2 top-[calc(78px_+_env(safe-area-inset-top))] z-[25] w-auto min-w-0 max-w-[calc(100vw-1rem)] sm:left-auto sm:right-6 sm:top-[82px] sm:w-[360px] sm:max-w-[calc(100vw-3rem)]">
        <div role="status" aria-label="Alarma de monitoreo" aria-live="polite"
          aria-hidden={motion === 'exiting'}
          onAnimationEnd={event => { if (event.target === event.currentTarget) finishMotion(); }}
          className={`max-h-[min(24dvh,104px)] min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-[var(--danger)] bg-[var(--card)] p-2 text-[var(--text)] shadow-2xl sm:max-h-[min(65dvh,440px)] sm:p-4 ${motion === 'entering' ? 'alarm-float-enter pointer-events-auto' : motion === 'exiting' ? 'alarm-float-exit pointer-events-none' : 'pointer-events-auto'}`}>

          <MobileAlarmNotice
            count={displayCount}
            cameraId={displayPending.length === 1 ? displayPending[0].cameraId : undefined}
            zoneId={displayPending.length === 1 ? displayPending[0].zoneId : undefined}
            soundEnabled={soundEnabled}
            mayAcknowledge={mayAcknowledge}
            onAcknowledge={openAcknowledgeDialog}
            onToggleSound={toggleSound}
          />
          {/* En escritorio conservamos la tarjeta detallada y sus acciones. */}
          <div className="hidden min-w-0 items-start gap-3 sm:flex">
            <span className="shrink-0 rounded-xl bg-[var(--danger-bg)] p-2 text-[var(--danger)]"><BellRing size={19} aria-hidden="true"/></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{displayCount === 1 ? '1 alarma pendiente' : `${displayCount} alarmas pendientes`}</p>
              <p className="mt-1 break-words text-xs text-[var(--muted)]">Requiere reconocimiento · {soundEnabled ? 'Audio activo' : 'Audio desactivado'}</p>
              {displayPending.length === 1 && <p className="mt-1 truncate text-[11px] text-[var(--muted)]" title={`${displayPending[0].cameraId} · ${displayPending[0].zoneId}`}>{displayPending[0].cameraId} · {displayPending[0].zoneId}</p>}
            </div>
          </div>
          {/* Los controles de texto completo quedan reservados para escritorio. */}
          <div className="mt-3 hidden min-w-0 flex-wrap items-center gap-2 sm:flex">
            {mayAcknowledge && <Button size="sm" className="min-w-0" variant="primary" onClick={openAcknowledgeDialog}>Reconocer</Button>}
            {soundButton}
            <Link to="/incidentes" className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-center text-xs font-semibold hover:bg-[var(--muted-bg)]"><ShieldAlert size={14} className="shrink-0"/> Ver incidentes</Link>
          </div>
          {soundError && <p role="alert" title={soundError} className="mt-1 truncate text-[10px] text-[var(--danger)] sm:mt-2 sm:whitespace-normal sm:break-words sm:text-xs">{soundError}</p>}
          {!state.storageOk && <p role="alert" className="mt-1 truncate text-[10px] text-[var(--danger)] sm:mt-2 sm:whitespace-normal sm:break-words sm:text-xs">El historial no se pudo guardar en este navegador.</p>}
        </div>
      </div>, document.body)
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
        {soundError && <p role="alert" className="mt-2 break-words text-[11px] text-[var(--danger)] sm:text-xs">{soundError}</p>}
        {!state.storageOk && <p role="alert" className="mt-2 break-words text-[11px] text-[var(--danger)] sm:text-xs">El historial no se pudo guardar en este navegador.</p>}
      </section>
    )}
    <Modal open={mayAcknowledge && dialogOpen && pendingCount > 0} onClose={() => setDialogOpen(false)} title="Reconocer alarma durante el monitoreo"
      description="El reconocimiento silencia la alarma seleccionada sin detener YOLO ni cerrar el incidente.">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void acknowledgeInline(); }}>
        <label className="block text-xs font-bold">Incidente
          <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
            {pending.map(item => <option value={item.id} key={item.id}>{item.id} · {item.cameraId} · {item.zoneId}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold">Responsable autenticado
          <input className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] p-3" value={session?.user.email ?? ''} readOnly/>
        </label>
        {formError && <p role="alert" className="text-xs text-[var(--danger)]">{formError}</p>}
        <div className="flex justify-end gap-2"><Button onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Registrando…' : 'Reconocer incidente'}</Button></div>
      </form>
    </Modal>
  </>;
}
