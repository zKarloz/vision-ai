import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { Activity, Camera as CameraIcon, CircleHelp, ExternalLink, MoveHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { CAMERA_SOURCE_TYPES, createStaticVirtualCameraDraft, hasVirtualPerspective, SOURCE_NAMES, type Camera, type CameraDraft, type CameraSourceType } from '../../core/domain/camera';
import { NEW_VIRTUAL_POSE, orbitVirtualPose, dollyVirtualPose, validateVirtualCameraPose, virtualPoseFor, type VirtualCameraPose } from '../../core/domain/virtualCameraPose';
import { Button } from '../../shared/components/Button';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { Modal } from '../../shared/components/Modal';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';

const VirtualCameraPosePreview = lazy(() => import('./VirtualCameraPosePreview').then(m => ({ default: m.VirtualCameraPosePreview })));

const fieldClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm text-[var(--text)] outline-offset-2 focus:outline-2 focus:outline-[var(--focus)]';

/** Registro versionado: CAM-01/02 comparten mundo 3D; vídeos y webcam usan fuentes locales. */
export function CamerasPage() {
  const { cameras, create, update, remove, toggle } = useCameraRegistry();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | CameraSourceType>('all');
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CameraDraft>(() => createStaticVirtualCameraDraft());
  const [showAdvancedSweep, setShowAdvancedSweep] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Camera | null>(null);
  const [notice, setNotice] = useState('');

  function showCreate() { setDraft(createStaticVirtualCameraDraft()); setShowAdvancedSweep(false); setError(''); setEditingId(null); setDialog('create'); }
  function showEdit(camera: Camera) { setShowAdvancedSweep(Boolean(camera.virtualSweep)); setDraft({ name: camera.name, location: camera.location, sourceType: camera.sourceType, enabled: camera.enabled, virtualPose: camera.sourceType === 'virtual-3d' ? { ...virtualPoseFor(camera.id, camera.virtualPose) } : undefined, virtualSweep: camera.virtualSweep ? { ...camera.virtualSweep } : undefined }); setError(''); setEditingId(camera.id); setDialog('edit'); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (dialog === 'edit' && editingId) { update(editingId, draft); setNotice('Registro actualizado en la versión activa.'); }
      else { create(draft); setNotice('Cámara registrada en la versión activa.'); }
      setDialog(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
  }

  const pose = draft.virtualPose ?? NEW_VIRTUAL_POSE;
  const poseErrors = draft.sourceType === 'virtual-3d' ? validateVirtualCameraPose(pose) : [];
  const updatePose = (field: keyof VirtualCameraPose, value: number) => {
    setDraft(current => ({ ...current, virtualPose: { ...(current.virtualPose ?? NEW_VIRTUAL_POSE), [field]: value } }));
  };
  const changeSource = (sourceType: CameraSourceType) => {
    setDraft(current => ({ ...current, sourceType, virtualPose: sourceType === 'virtual-3d'
      ? (current.virtualPose ?? { ...NEW_VIRTUAL_POSE }) : undefined,
      virtualSweep: sourceType === 'virtual-3d' ? current.virtualSweep : undefined }));
  };

  const results = useMemo(() => cameras.filter((camera) => {
    const term = search.toLocaleLowerCase().trim();
    return (sourceFilter === 'all' || camera.sourceType === sourceFilter) &&
      (!term || [camera.id, camera.name, camera.location].some((text) => text.toLocaleLowerCase().includes(term)));
  }), [cameras, search, sourceFilter]);

  const columns: TableColumn<Camera>[] = [
    { key: 'name', header: 'Cámara', render: (camera) => <div className="flex min-w-48 items-center gap-3"><span className="rounded-xl bg-[var(--muted-bg)] p-2.5 text-[var(--accent)]"><CameraIcon size={18} /></span><div><p className="font-semibold">{camera.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{camera.id}</p></div></div> },
    { key: 'location', header: 'Ubicación', render: (camera) => <span className="text-[var(--muted)]">{camera.location}</span> },
    { key: 'source', header: 'Tipo', render: (camera) => <span className="text-xs">{SOURCE_NAMES[camera.sourceType]}</span> },
    { key: 'view', header: 'Conexión', render: (camera) => camera.sourceType !== 'ip-camera' ? <Link className="text-xs font-semibold text-[var(--accent)] underline" to={`/monitoreo?camera=${encodeURIComponent(camera.id)}`}>{camera.sourceType === 'virtual-3d' ? 'Ver perspectiva 3D' : 'Conectar en Monitoreo'}</Link> : <StatusBadge>Sin adaptador</StatusBadge> },
    { key: 'enabled', header: 'Registro', render: (camera) => <label className="inline-flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={camera.enabled} onChange={(event) => { toggle(camera.id, event.target.checked); setNotice('Registro versionado actualizado.'); }} aria-label={`${camera.enabled ? 'Deshabilitar' : 'Habilitar'} registro ${camera.id}`} className="h-4 w-4 accent-[var(--accent)]" />{camera.enabled ? 'Habilitado' : 'Deshabilitado'}</label> },
    { key: 'actions', header: 'Acciones', className: 'text-right', render: (camera) => <div className="inline-flex gap-1"><Button size="sm" variant="ghost" title={`Editar ${camera.id}`} aria-label={`Editar ${camera.id}`} onClick={() => showEdit(camera)}><Pencil size={15} /></Button><Button size="sm" variant="ghost" disabled={hasVirtualPerspective(camera.id)} title={hasVirtualPerspective(camera.id) ? 'Perspectiva fija: deshabilita la cámara en lugar de eliminarla' : `Eliminar ${camera.id}`} aria-label={`Eliminar ${camera.id}`} onClick={() => setRemoving(camera)}><Trash2 size={15} /></Button></div> },
  ];

  return <>
    <PageHeader eyebrow="Administración · Etapa 4" title="Gestión de cámaras" description="Crea cámaras 3D fijas y ajusta su vista con el ratón; también puedes registrar MP4/WebM y webcam." actions={<Button variant="primary" onClick={showCreate}><Plus size={17} />Nueva cámara</Button>} />
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--notice-border)] bg-[var(--notice-bg)] p-4 text-sm"><CircleHelp className="mt-0.5 shrink-0 text-[var(--accent)]" size={19} /><p className="leading-relaxed text-[var(--muted)]"><strong className="text-[var(--text)]">Etapa 4:</strong> registra una fuente «Vídeo en bucle» o «Webcam», pulsa «Conectar en Monitoreo» y selecciona el archivo o concede permiso. El archivo y la webcam son locales de la sesión; su contenido no se persiste. Se recomienda una cámara 3D fija: ajusta la vista visualmente y dibuja sus zonas en Monitoreo. El barrido permanece como opción avanzada sin evaluación de zonas. IP/RTSP sigue pendiente.</p></div>
    {notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"><span>{notice}</span><button className="text-xs font-bold text-[var(--accent)]" onClick={() => setNotice('')}>Cerrar</button></div>}
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold">Fuentes registradas</h2><p className="mt-1 text-xs text-[var(--muted)]">{cameras.length} registros locales, {results.length} según filtros</p></div><div className="flex flex-wrap gap-2"><label className="relative flex-1 sm:flex-none"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className={`${fieldClass} min-w-[210px] pl-9`} placeholder="Buscar cámara…" aria-label="Buscar cámaras" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar por fuente" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)} className={fieldClass}><option value="all">Todas las fuentes</option>{CAMERA_SOURCE_TYPES.map((source) => <option value={source} key={source}>{SOURCE_NAMES[source]}</option>)}</select></div></div>
      <DataTable accessibleName="Registro de cámaras" rows={results} columns={columns} getRowKey={(camera) => camera.id} emptyMessage="Ninguna cámara coincide. Prueba otro filtro o crea un registro nuevo." />
    </Panel>
    <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]"><Activity size={15} /><span>Todas las cámaras 3D comparten un mundo. Las dos perspectivas semilla CAM-01/02 se pueden editar, pero no eliminar.</span><Link to="/monitoreo" className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline">Abrir monitoreo <ExternalLink size={13} /></Link></div>
    <Modal open={dialog !== null} size={draft.sourceType === 'virtual-3d' ? 'lg' : 'md'} onClose={() => setDialog(null)} title={dialog === 'edit' ? `Editar ${editingId}` : 'Registrar cámara'} description="Las perspectivas 3D se guardan como configuración versionada. Los archivos y permisos de webcam solo existen durante la sesión.">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-xs font-semibold">Nombre de cámara<input className={`${fieldClass} mt-1.5`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej.: Puerta de embarque" minLength={3} maxLength={60} required /></label>
        <label className="block text-xs font-semibold">Ubicación<input className={`${fieldClass} mt-1.5`} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ej.: Almacén norte" minLength={3} maxLength={100} required /></label>
        <label className="block text-xs font-semibold">Tipo de fuente<select className={`${fieldClass} mt-1.5`} value={draft.sourceType} onChange={(event) => changeSource(event.target.value as CameraSourceType)}>{CAMERA_SOURCE_TYPES.map((source) => <option value={source} key={source}>{SOURCE_NAMES[source]}</option>)}</select></label>
        {draft.sourceType === 'virtual-3d' && <section className="space-y-3 rounded-xl border border-[var(--border)] p-3">
          <div><h3 className="text-sm font-bold">{draft.virtualSweep ? 'Cámara con barrido · editor visual' : 'Cámara fija · editor visual 3D'}</h3><p className="text-xs text-[var(--muted)]">Modo recomendado: mueve la vista con el ratón y guarda el encuadre. No necesitas introducir coordenadas.</p>
            {dialog === 'edit' && <p className="mt-2 text-[11px] text-[var(--warning)]">Si cambias el encuadre de una cámara con zona restringida, su polígono anterior se desactivará hasta que lo redibujes. El historial conservará la versión previa.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: { ...NEW_VIRTUAL_POSE } }))}>Vista general</Button>
            <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: { ...virtualPoseFor('CAM-01') } }))}>Almacén</Button>
            <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: { ...virtualPoseFor('CAM-02') } }))}>Maquinaria</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold">Ajustes rápidos</span>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: orbitVirtualPose(current.virtualPose ?? NEW_VIRTUAL_POSE, -8, 0) }))}>← Izquierda</Button>
              <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: orbitVirtualPose(current.virtualPose ?? NEW_VIRTUAL_POSE, 8, 0) }))}>Derecha →</Button>
              <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: dollyVirtualPose(current.virtualPose ?? NEW_VIRTUAL_POSE, 0.87) }))}>Acercar</Button>
              <Button size="sm" onClick={() => setDraft(current => ({ ...current, virtualPose: dollyVirtualPose(current.virtualPose ?? NEW_VIRTUAL_POSE, 1.15) }))}>Alejar</Button>
            </div>
          </div>
          <label className="block text-xs font-semibold">Amplitud de vista (zoom óptico) · {Math.round(pose.fov)}°
            <input aria-label="Campo de visión" type="range" min="30" max="100" step="1" className="mt-2 w-full" value={pose.fov} onChange={event => updatePose('fov', Number(event.target.value))} />
          </label>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted-bg)] p-3">
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold" aria-expanded={showAdvancedSweep || Boolean(draft.virtualSweep)} onClick={() => setShowAdvancedSweep(value => !value)}>
              <span className="flex items-center gap-2"><MoveHorizontal size={16}/> Movimiento automático · opcional</span>
              <span className="text-[var(--muted)]">{showAdvancedSweep || draft.virtualSweep ? 'Ocultar ajustes' : 'Mostrar ajustes'}</span>
            </button>
            {(showAdvancedSweep || Boolean(draft.virtualSweep)) && <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
            <label className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="flex items-center gap-2"><MoveHorizontal size={16}/> Barrido horizontal automático</span>
              <input type="checkbox" checked={Boolean(draft.virtualSweep)} onChange={event => setDraft(current => ({ ...current, virtualSweep: event.target.checked ? { mode: 'sweep', amplitudeDeg: 25, periodSec: 12 } : undefined }))} />
            </label>
            {draft.virtualSweep && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium">Giro a cada lado · {draft.virtualSweep.amplitudeDeg}°
                <input type="range" min="5" max="75" step="5" className="mt-2 w-full" value={draft.virtualSweep.amplitudeDeg}
                  onChange={event => setDraft(current => ({ ...current, virtualSweep: { mode: 'sweep', amplitudeDeg: Number(event.target.value), periodSec: current.virtualSweep?.periodSec ?? 12 } }))} />
              </label>
              <label className="text-xs font-medium">Duración de un ciclo · {draft.virtualSweep.periodSec} s
                <input type="range" min="4" max="30" step="1" className="mt-2 w-full" value={draft.virtualSweep.periodSec}
                  onChange={event => setDraft(current => ({ ...current, virtualSweep: { mode: 'sweep', periodSec: Number(event.target.value), amplitudeDeg: current.virtualSweep?.amplitudeDeg ?? 25 } }))} />
              </label>
              <p className="sm:col-span-2 text-[11px] text-[var(--muted)]">YOLO seguirá detectando personas. Por seguridad, las zonas dibujadas sobre imagen no activarán incidentes mientras la cámara esté en barrido. Elige cámara fija para evaluar la zona.</p>
            </div>}
            </div>}
          </div>
          {poseErrors.length ? <p role="alert" className="text-xs text-[var(--danger)]">{poseErrors.join(' ')}</p> :
            <Suspense fallback={<div className="grid aspect-video place-items-center rounded-xl bg-[var(--muted-bg)] text-xs">Preparando vista previa 3D…</div>}>
              <VirtualCameraPosePreview pose={pose} sweep={draft.virtualSweep} onChange={next => setDraft(current => ({ ...current, virtualPose: next }))}/>
            </Suspense>}
        </section>}
        <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" className="h-4 w-4" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />Habilitar registro</label>
        {error && <p role="alert" className="rounded-lg bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button onClick={() => setDialog(null)}>Cancelar</Button><Button type="submit" variant="primary">{dialog === 'edit' ? 'Guardar cambios' : 'Registrar cámara'}</Button></div>
      </form>
    </Modal>
    <ConfirmDialog open={Boolean(removing)} title={`Eliminar ${removing?.id ?? 'cámara'}`} message={`Se eliminará la cámara «${removing?.name ?? ''}» y sus zonas y reglas asociadas. El mundo 3D compartido permanecerá intacto.`} onCancel={() => setRemoving(null)} onConfirm={() => { if (removing) { remove(removing.id); setNotice(`Registro ${removing.id} eliminado.`); } setRemoving(null); }} />
  </>;
}
