import { useState } from 'react';
import { BellRing, CheckCircle2, Download, History, RefreshCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useSharedHistory } from '../../app/providers/SharedHistoryProvider';
import { type CenterIncident, type IncidentAuditEvent } from '../../application/incidents/IncidentCenter';
import { Button } from '../../shared/components/Button';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { Modal } from '../../shared/components/Modal';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { Tabs } from '../../shared/components/Tabs';
import { useAuth } from '../../app/providers/AuthProvider';
import { canAcknowledgeIncident } from '../../application/remote/accessPolicy';

const inputClass = 'mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm';
const formatTime = (value?: string) => value ? new Date(value).toLocaleString('es-PE') : '—';
/** Se muestra la etiqueta legible, pero el ID remoto completo sigue siendo la clave de acción. */
const shortIncidentId = (id: string) => id.split(':').at(-1) ?? id;
const originTag = (id: string) => id.includes(':') ? id.split(':')[0].slice(0, 8) : 'local';
const statusName: Record<CenterIncident['status'], string> = {
  open: 'Abierto', acknowledged: 'Reconocido', escalated: 'Escalado', closed: 'Cerrado',
};
const actionName: Record<IncidentAuditEvent['action'], string> = {
  opened: 'Apertura YOLO', acknowledged: 'Reconocimiento', escalated: 'Escalamiento',
  closed: 'Salida confirmada YOLO', 'tracking-lost': 'Seguimiento perdido',
  'closed-by-supervisor': 'Cierre por revisión humana',
};

type ActionDialog = { kind: 'ack' | 'close'; id: string } | null;

/** Historial compartido: los cambios humanos se aplican atómicamente en PostgreSQL. */
export function IncidentsPage() {
  const shared = useSharedHistory();
  const { role, session } = useAuth();
  const mayAcknowledge = canAcknowledgeIncident(role);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [cameraFilter, setCameraFilter] = useState('all');
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const activeCount = shared.incidents.filter(item => item.status !== 'closed').length;
  const pendingCount = shared.incidents.filter(item => item.status === 'open' || item.status === 'escalated').length;
  const cameraIds = [...new Set(shared.incidents.map(item => item.cameraId))].sort();
  const filtered = shared.incidents.filter(item =>
    (statusFilter === 'all' || (statusFilter === 'closed' ? item.status === 'closed' : item.status !== 'closed')) &&
    (cameraFilter === 'all' || item.cameraId === cameraFilter));

  function openDialog(kind: 'ack' | 'close', id: string) {
    setDialog({ kind, id }); setNote(''); setError('');
  }
  async function submit() {
    if (!dialog || !mayAcknowledge || saving) return;
    setSaving(true);
    try {
      // La base decide atómicamente: evita reconocer dos veces desde cuentas distintas.
      await shared.actOnIncident(dialog.id, dialog.kind === 'ack' ? 'acknowledge' : 'close', note);
      setDialog(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.'); }
    finally { setSaving(false); }
  }
  function exportAudit() {
    const payload = { project: 'VISION AI', generatedAt: new Date().toISOString(),
      origin: 'historial compartido de Supabase', incidents: shared.incidents, audit: shared.audit };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'vision-ai-incidentes-auditoria.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const columns: TableColumn<CenterIncident>[] = [
    { key: 'id', header: 'Incidente', render: item => <div title={item.id}><strong className="text-xs">{shortIncidentId(item.id)}</strong><p className="mt-1 text-[11px] text-[var(--muted)]">Cuenta {originTag(item.id)} · YOLO</p></div> },
    { key: 'camera', header: 'Cámara / zona', render: item => <div className="text-xs"><strong>{item.cameraId}</strong><p className="mt-1 text-[var(--muted)]">{item.zoneId}</p></div> },
    { key: 'time', header: 'Apertura', render: item => <span className="text-xs">{formatTime(item.openedAt)}</span> },
    { key: 'status', header: 'Estado', render: item => <div><span className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${item.status === 'open' || item.status === 'escalated' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : 'bg-[var(--muted-bg)]'}`}>{statusName[item.status]}</span>{item.requiresReview && item.status !== 'closed' && <p title={item.observationReason} className="mt-1 text-[11px] text-[var(--warning)]">{item.observationInterruptedAt ? 'Observación interrumpida · revisión obligatoria' : 'Revisar seguimiento'}</p>}{item.recoveryExitObservedAt && item.status !== 'closed' && <p className="mt-1 text-[11px] text-[var(--muted)]">Salida posterior sin identidad verificada</p>}</div> },
    { key: 'response', header: 'Responsable / cierre', render: item => <div className="text-xs">{item.acknowledgedBy ?? 'Sin reconocer'}<p className="mt-1 text-[var(--muted)]">{item.closureType === 'yolo-confirmed' ? 'Salida YOLO' : item.closureType === 'human-review' ? 'Revisión humana' : item.status === 'closed' ? 'Cerrado' : '—'}</p></div> },
    { key: 'actions', header: 'Acciones', render: item => <div className="flex flex-wrap gap-2">{mayAcknowledge && (item.status === 'open' || item.status === 'escalated') && <Button size="sm" onClick={() => openDialog('ack', item.id)}>Reconocer</Button>}{mayAcknowledge && item.status === 'acknowledged' && <Button size="sm" onClick={() => openDialog('close', item.id)}>Cerrar con nota</Button>}</div> },
  ];
  const auditColumns: TableColumn<IncidentAuditEvent>[] = [
    { key: 'date', header: 'Fecha', render: event => <span className="text-xs">{formatTime(event.at)}</span> },
    { key: 'event', header: 'Evento', render: event => <strong className="text-xs">{event.action === 'tracking-lost' && event.note?.startsWith('Observación interrumpida') ? 'Observación interrumpida' : event.action === 'tracking-lost' && event.note?.startsWith('Trayectoria posterior') ? 'Reanudación sin identidad verificada' : event.action === 'tracking-lost' && event.note?.startsWith('Salida tras interrupción') ? 'Salida posterior no concluyente' : actionName[event.action] ?? event.action}</strong> },
    { key: 'id', header: 'Incidente', render: event => <span className="text-xs">{shortIncidentId(event.incidentId)} · {event.cameraId}</span> },
    { key: 'actor', header: 'Actor', render: event => <span className="text-xs">{event.actor}</span> },
    { key: 'note', header: 'Detalle', render: event => <span className="text-xs text-[var(--muted)]">{event.note ?? '—'}</span> },
  ];

  return <>
    <PageHeader title="Incidentes y auditoría"
      description="Historial común de todos los usuarios autorizado por Supabase. Reconocimientos y cierres se registran con identidad y auditoría remotas."
      actions={<><Button onClick={() => void shared.refresh()}><RefreshCcw size={16}/> Actualizar</Button><Button onClick={exportAudit} disabled={!shared.loaded || Boolean(shared.error) || !shared.incidents.length}><Download size={16}/> Exportar historial JSON</Button></>}/>
    {!shared.loaded && !shared.error && <p role="status" className="mb-4 text-xs text-[var(--muted)]">Consultando historial común en Supabase…</p>}
    {shared.error && <p role="alert" className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">No se pudo actualizar la tabla de incidentes: {shared.error}. {shared.loaded ? 'Se muestran los últimos datos recibidos.' : 'No se presentan datos locales como si fueran compartidos.'}</p>}
    {shared.auditError && <p role="alert" className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">La auditoría de acciones no está disponible: {shared.auditError}. Los incidentes continúan consultándose por separado.</p>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Resumen de incidentes">
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><BellRing size={15}/> Pendientes de reconocer</div><p className="mt-2 text-2xl font-bold tabular-nums">{pendingCount}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldAlert size={15}/> Sin cierre</div><p className="mt-2 text-2xl font-bold tabular-nums">{activeCount}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><CheckCircle2 size={15}/> Cerrados</div><p className="mt-2 text-2xl font-bold tabular-nums">{shared.incidents.filter(item => item.status === 'closed').length}</p></Panel>
    </section>
    <Tabs label="Secciones de incidentes" items={[
      { id: 'incidentes', label: 'Incidentes', icon: ShieldAlert, count: shared.incidents.length, content: (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h2 className="text-sm font-bold">Historial de incidentes</h2>
            <div className="flex flex-wrap gap-2">
              <label className="text-xs">Estado<select className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Todos</option><option value="active">Sin cierre</option><option value="closed">Cerrados</option></select></label>
              <label className="text-xs">Cámara<select className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5" value={cameraFilter} onChange={event => setCameraFilter(event.target.value)}><option value="all">Todas</option>{cameraIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
            </div>
          </div>
          <DataTable accessibleName="Incidentes YOLO" rows={filtered} columns={columns} getRowKey={row => row.id} emptyMessage="Aún no hay incidentes confirmados por YOLO con estos filtros."/>
        </Panel>
      ) },
      { id: 'auditoria', label: 'Auditoría de acciones', icon: History, count: shared.audit.length, content: (
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 p-5"><History size={17}/><h2 className="text-sm font-bold">Auditoría de acciones</h2></div>
          <DataTable accessibleName="Auditoría de incidentes" rows={shared.audit} columns={auditColumns} getRowKey={event => event.id} emptyMessage="La auditoría aparecerá al producirse un incidente confirmado."/>
        </Panel>
      ) },
    ]}/>
    <p className="mt-4 text-xs text-[var(--muted)]">Fuente: Supabase compartido, actualizado periódicamente (aprox. cada 12 segundos). Un incidente puede cerrarse por salida confirmada por YOLO o por revisión humana documentada. Los eventos persistidos no contienen fotogramas.</p>
    <Modal open={mayAcknowledge && Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.kind === 'ack' ? 'Reconocer incidente' : 'Cerrar incidente tras revisión'}
      description={dialog?.kind === 'ack' ? 'El reconocimiento silencia la alarma de este incidente, sin cerrar su historial.' : 'Cierre manual distinto de una salida observada por YOLO. Se registrará en la auditoría.'}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-4">
        <label className="block text-xs font-bold">Responsable autenticado
          <input className={inputClass} value={session?.user.email ?? ''} readOnly />
        </label>
        {dialog?.kind === 'close' && <label className="block text-xs font-bold">Motivo y evidencia de la revisión
          <textarea className={inputClass} value={note} onChange={event => setNote(event.target.value)} minLength={10} maxLength={500} rows={3} placeholder="Describe por qué corresponde el cierre manual" required />
        </label>}
        {error && <p role="alert" className="rounded-lg bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button onClick={() => setDialog(null)}>Cancelar</Button><Button type="submit" variant="primary" disabled={saving}><ShieldCheck size={16}/>{dialog?.kind === 'ack' ? 'Reconocer alarma' : 'Registrar cierre manual'}</Button></div>
      </form>
    </Modal>
  </>;
}
