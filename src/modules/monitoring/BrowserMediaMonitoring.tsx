import { useState, type ChangeEvent, type MouseEvent } from 'react';
import { AlertCircle, Camera as CameraIcon, Cpu, Download, FileVideo, Play, Scan, ShieldAlert, ShieldCheck, Square, VideoOff, Webcam } from 'lucide-react';
import type { Camera as CameraRecord } from '../../core/domain/camera';
import { validateImagePolygon, type ImagePoint } from '../../core/domain/spatial';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { Button } from '../../shared/components/Button';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { trackVisualState } from './trackVisualState';
import { CAPTURE_INTERVAL_OPTIONS, captureIntervalLabel, isHighLoadCaptureInterval, parseCaptureIntervalMs } from './captureInterval';
import { useBrowserMediaMonitoring } from './useBrowserMediaMonitoring';

const control = 'rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]';
const pretty = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '—';

/** Monitoreo real de archivos de vídeo o webcam sin flujo de medios hacia un servidor. */
export function BrowserMediaMonitoring({ camera }: { camera: CameraRecord & { sourceType: 'video-loop' | 'webcam' } }) {
  const monitor = useBrowserMediaMonitoring(camera.id, camera.sourceType);
  const { state: incidentState } = useIncidentCenter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ImagePoint[]>([]);
  const [zoneError, setZoneError] = useState('');
  const polygon = editing ? draft : (monitor.zone?.polygon ?? []);
  const openIncidents = incidentState.incidents.filter(item => item.status !== 'closed');

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) void monitor.openFile(file);
    // Permitir volver a seleccionar el mismo archivo después de desconectarlo.
    event.currentTarget.value = '';
  }

  function addVertex(event: MouseEvent<SVGSVGElement>) {
    if (!editing || draft.length >= 16) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setDraft(previous => [...previous, { x, y }]);
    setZoneError('');
  }

  function saveZone() {
    const error = validateImagePolygon(draft);
    if (error) { setZoneError(error); return; }
    const message = monitor.savePolygon(draft);
    if (message) { setZoneError(message); return; }
    setEditing(false); setDraft([]); setZoneError('');
  }

  function exportSession() {
    // Evidencia estructurada; nunca incluye los píxeles ni el archivo reproducido.
    const payload = {
      project: 'VISION AI', stage: 4, generatedAt: new Date().toISOString(),
      cameraId: camera.id, sourceType: camera.sourceType,
      inference: 'YOLOv8n ONNX REAL', provider: monitor.provider,
      threshold: monitor.threshold, intervalMs: monitor.intervalMs,
      zone: monitor.zone, samples: monitor.samples,
      incidents: monitor.incidents, events: monitor.log,
      note: 'Fotogramas capturados en el navegador; no se almacena ni envía evidencia visual.',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `vision-ai-${camera.id.toLowerCase()}-fuente-local.json`;
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return <>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><CameraIcon size={15}/> Fuente seleccionada</div><p className="mt-2 text-xl font-bold">{camera.id}</p><p className="mt-1 text-xs text-[var(--muted)]">{camera.name}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><FileVideo size={15}/> Señal</div><p className="mt-2 text-xl font-bold">{monitor.sourceStatus === 'online' ? 'En línea' : monitor.sourceStatus === 'connecting' ? 'Conectando…' : monitor.sourceStatus === 'no-signal' ? 'Sin señal' : monitor.sourceStatus === 'error' ? 'Error' : 'Sin conectar'}</p><p className="mt-1 text-xs text-[var(--muted)]">{camera.sourceType === 'webcam' ? 'Webcam local' : 'Vídeo local en bucle'}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Scan size={15}/> Personas detectadas</div><p className="mt-2 text-xl font-bold tabular-nums">{monitor.people}</p><p className="mt-1 text-xs text-[var(--muted)]">Solo fotogramas procesados por YOLO</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldAlert size={15}/> Incidentes abiertos</div><p className="mt-2 text-xl font-bold tabular-nums">{openIncidents.length}</p><p className="mt-1 text-xs text-[var(--muted)]">Historial local; audio opcional</p></Panel>
    </div>

    <div className="grid gap-5 2xl:grid-cols-[1fr_1fr]">
      <Panel className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">{camera.sourceType === 'webcam' ? <Webcam size={17}/> : <FileVideo size={17}/>} Fuente de vídeo</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{camera.sourceType === 'webcam'
          ? 'La webcam se abre tras tu autorización. El vídeo permanece en el navegador.'
          : 'Selecciona un archivo MP4, WebM u Ogg (máximo 150 MB). Se reproduce en bucle y no se sube al servidor.'}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {camera.sourceType === 'video-loop'
            ? <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs font-semibold hover:bg-[var(--muted-bg)]"><FileVideo size={15}/> Seleccionar vídeo<input className="sr-only" type="file" accept=".mp4,.webm,.ogv,.ogg,video/mp4,video/webm,video/ogg" onChange={pickFile}/></label>
            : <Button onClick={() => { void monitor.openWebcam(); }} disabled={monitor.sourceStatus === 'connecting'}><Webcam size={15}/> {monitor.sourceStatus === 'online' ? 'Reabrir webcam' : 'Permitir webcam'}</Button>}
          <Button onClick={monitor.disconnect} disabled={monitor.sourceStatus === 'stopped'}><VideoOff size={15}/> Desconectar</Button>
        </div>
        {monitor.fileName && <p className="mt-3 break-all text-xs text-[var(--muted)]">Archivo: {monitor.fileName}</p>}
        {monitor.sourceError && <p role="alert" className="mt-3 rounded-lg bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">{monitor.sourceError}</p>}
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Cpu size={17}/> Inferencia YOLO real</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold">Motor<select value={monitor.provider} onChange={event => monitor.setProvider(event.target.value as 'webgpu' | 'wasm')} disabled={monitor.modelState === 'ready' || monitor.modelState === 'loading'} className={`mt-1 block w-full ${control}`}><option value="webgpu">WebGPU</option><option value="wasm">WASM</option></select></label>
            <label className="text-xs font-semibold">Umbral<select value={monitor.threshold} onChange={event => monitor.setThreshold(Number(event.target.value))} className={`mt-1 block w-full ${control}`}><option value="0.25">25 %</option><option value="0.40">40 %</option><option value="0.60">60 %</option></select></label>
            <label className="text-xs font-semibold">Captura<select value={monitor.intervalMs} onChange={event => monitor.setIntervalMs(parseCaptureIntervalMs(event.target.value))} className={`mt-1 block w-full ${control}`}>{CAPTURE_INTERVAL_OPTIONS.map(ms => <option key={ms} value={ms}>{captureIntervalLabel(ms)}</option>)}</select></label>
          </div>
          {isHighLoadCaptureInterval(monitor.intervalMs) && (
            <p role="status" className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--warning-bg)] p-3 text-xs leading-5 text-[var(--warning)]">
              Intervalo experimental de {monitor.intervalMs} ms: puede aumentar el consumo de GPU, la temperatura y la batería. Si notas calentamiento, cortes o inestabilidad, cambia a 75 ms o 100 ms. Los FPS reales dependen del equipo.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {monitor.modelState === 'ready'
              ? <Button onClick={monitor.stopModel}><Square size={15}/> Detener YOLO</Button>
              : <Button variant="primary" disabled={monitor.sourceStatus !== 'online' || monitor.modelState === 'loading'} onClick={() => { void monitor.initializeModel(); }}><Play size={15}/> {monitor.modelState === 'loading' ? 'Cargando…' : 'Activar YOLO'}</Button>}
            {monitor.modelState === 'ready' ? <StatusBadge tone="success">REAL · {monitor.provider.toUpperCase()}</StatusBadge> : <StatusBadge tone="warning">IA detenida</StatusBadge>}
          </div>
          {monitor.modelError && <p role="alert" className="mt-3 rounded-lg bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">{monitor.modelError}</p>}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--muted-bg)] p-3"><p className="text-xs text-[var(--muted)]">FPS análisis reciente</p><p className="mt-2 text-lg font-bold">{!monitor.pageVisible ? 'Pausado' : monitor.fps ? `${pretty(monitor.fps)} FPS` : 'Midiendo…'}</p></div>
          <div className="rounded-xl bg-[var(--muted-bg)] p-3"><p className="text-xs text-[var(--muted)]">Inferencia promedio</p><p className="mt-2 text-lg font-bold">{pretty(monitor.avgInferenceMs)} ms</p></div>
          <div className="rounded-xl bg-[var(--muted-bg)] p-3"><p className="text-xs text-[var(--muted)]">Capturas realizadas</p><p className="mt-2 text-lg font-bold">{monitor.samples.length}</p></div>
          <div className="rounded-xl bg-[var(--muted-bg)] p-3"><p className="text-xs text-[var(--muted)]">Último ciclo</p><p className="mt-2 text-lg font-bold">{monitor.inferenceTotalMs === null ? '—' : `${pretty(monitor.inferenceTotalMs)} ms`}</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Las capturas se detienen al ocultar la pestaña y se reanudan al volver. Una pérdida de señal no equivale a una salida de la zona.</p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <div><h2 className="text-sm font-bold">Captura RGB · {camera.id}</h2><p className="mt-1 text-xs text-[var(--muted)]">640 × 480 · imagen con proporciones conservadas · áreas en coordenadas normalizadas</p></div>
          <StatusBadge tone={monitor.sourceStatus === 'online' ? 'success' : 'warning'}>{monitor.sourceStatus === 'online' ? 'Señal activa' : 'Sin señal'}</StatusBadge>
        </div>
        <div className="p-4">
          <div className="relative mx-auto aspect-[4/3] max-w-[760px] overflow-hidden rounded-xl border border-[var(--border)] bg-[#29343d]">
            <canvas ref={monitor.previewRef} width={640} height={480} className="block h-full w-full" aria-label="Fotograma de la fuente enviado a YOLO"/>
            <svg viewBox="0 0 640 480" preserveAspectRatio="none" onClick={addVertex} className={`absolute inset-0 h-full w-full ${editing ? 'cursor-crosshair' : 'pointer-events-none'}`} aria-label={editing ? 'Dibuja polígono sobre la imagen' : 'Detecciones YOLO'}>
              {polygon.length >= 2 && <polyline points={polygon.map(p => `${p.x*640},${p.y*480}`).join(' ')} fill="none" stroke="#b42318" strokeWidth="2.5" strokeDasharray={editing ? '6 4' : undefined}/>}
              {polygon.length >= 3 && <polygon points={polygon.map(p => `${p.x*640},${p.y*480}`).join(' ')} fill="rgba(180,35,24,0.14)" stroke="#b42318" strokeWidth="2.5"/>}
              {polygon.map((p, i) => <circle key={i} cx={p.x*640} cy={p.y*480} r="4" fill="white" stroke="#b42318" strokeWidth="2"/>)}
              {!editing && monitor.tracks.map(track => {
                const visual = trackVisualState(track);
                return <g key={track.id} opacity={track.seen ? 1 : 0.5}>
                  <rect x={track.box.x*640} y={track.box.y*480} width={track.box.width*640} height={track.box.height*480} stroke={visual.color} fill="none" strokeWidth="3" strokeDasharray={track.seen ? undefined : '8 6'}/>
                  <rect x={Math.min(463,track.box.x*640)} y={Math.max(0,track.box.y*480-22)} width="176" height="22" fill={visual.color} rx="4"/>
                  <text x={Math.min(463,track.box.x*640)+5} y={Math.max(15,track.box.y*480-7)} fontSize="10.5" fontWeight="bold" fill="white">#{track.id} · {visual.label}{track.seen ? ` · ${(track.confidence*100).toFixed(0)}%` : ''}</text>
                  <circle cx={track.foot.x*640} cy={track.foot.y*480} r="4" fill="white" stroke="black" strokeWidth="2"/>
                </g>;
              })}
            </svg>
            {monitor.sourceStatus !== 'online' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50 p-6 text-center text-sm text-white"><div><VideoOff className="mx-auto mb-2"/>{monitor.sourceStatus === 'connecting' ? 'Conectando fuente…' : 'Sin señal. Conecta un vídeo o webcam.'}</div></div>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded bg-[#167d4a] px-2 py-1 text-white">Verde · fuera</span><span className="rounded bg-[#b42318] px-2 py-1 text-white">Rojo · restringida</span><span className="rounded bg-[#64748b] px-2 py-1 text-white">Gris · sin zona/observación</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Zona restringida · {camera.id}</p><p className="text-[11px] text-[var(--muted)]">{monitor.zone ? `${monitor.zone.polygon.length} vértices` : 'Sin zona configurada'}</p></div><div className="flex flex-wrap gap-2">{editing ? <><Button size="sm" disabled={!draft.length} onClick={() => setDraft(a => a.slice(0,-1))}>Deshacer punto</Button><Button size="sm" onClick={() => { setEditing(false); setDraft([]); setZoneError(''); }}>Cancelar</Button><Button size="sm" variant="primary" onClick={saveZone}>Guardar zona</Button></> : <><Button size="sm" onClick={() => { setEditing(true); setDraft([]); setZoneError(''); }}>Redibujar zona</Button><Button size="sm" variant="ghost" disabled={!monitor.zone} onClick={monitor.removePolygon}>Quitar</Button></>}</div></div>
          {zoneError && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{zoneError}</p>}
          {editing && <p className="mt-2 text-xs text-[var(--muted)]">Marca al menos 3 vértices sobre el fotograma y guarda. El polígono se almacena en la configuración versionada de la cámara.</p>}
        </div>
      </Panel>
    </div>

    <Panel className="mt-5 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldAlert size={17}/><h2 className="text-sm font-bold">Incidentes visuales · sesión actual</h2></div><Button size="sm" onClick={exportSession} disabled={!monitor.samples.length}><Download size={14}/> Exportar sesión JSON</Button></div>
      {monitor.log.length === 0 ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted)]"><ShieldCheck size={18}/> Sin eventos confirmados por YOLO.</div>
        : <div className="max-h-60 space-y-2 overflow-auto">{monitor.log.map(item => <div key={item.key} className="rounded-xl border border-[var(--border)] p-3 text-xs"><strong>{item.eventType === 'opened' ? 'Ingreso restringido' : item.eventType === 'left' ? 'Salida confirmada' : 'Seguimiento perdido'}</strong><p className="mt-1 text-[var(--muted)]">{item.cameraId} · {item.incidentId} · confianza {(item.confidence*100).toFixed(0)}%</p></div>)}</div>}
      <p className="mt-3 text-xs text-[var(--muted)]">Las detecciones proceden de los píxeles reales de la cámara o vídeo. No se almacena evidencia visual ni se genera una salida al perder señal.</p>
    </Panel>
    <div className="mt-5 flex gap-2 rounded-xl border border-[var(--notice-border)] bg-[var(--notice-bg)] p-4 text-xs text-[var(--muted)]"><AlertCircle size={17} className="shrink-0"/><p>Fuentes locales de etapa 4. El vídeo debe volver a elegirse después de recargar la página. La webcam requiere permiso y se desconecta al salir de esta vista. La detección actual sólo reconoce personas. No se ha implementado RTSP ni procesamiento permanente con el navegador cerrado.</p></div>
  </>;
}
