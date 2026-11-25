import { useState, type MouseEvent } from 'react';
import {
  AlertCircle, ArrowRight, Camera, CheckCircle2, CircleDot, Cpu, Eye, Focus,
  Pause, Play, RotateCcw, Scan, ShieldAlert, ShieldCheck, Square, Video, Construction,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { STARTER_RESTRICTED_ZONE } from '../../core/domain/zone';
import { validateImagePolygon, type ImagePoint } from '../../core/domain/spatial';
import { Button } from '../../shared/components/Button';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { CAPTURE_INTERVAL_OPTIONS, captureIntervalLabel, isHighLoadCaptureInterval, parseCaptureIntervalMs } from './captureInterval';
import { useVirtualMonitoring } from './useVirtualMonitoring';
import { PerformanceDiagnostics } from './PerformanceDiagnostics';
import { trackVisualState } from './trackVisualState';

const control = 'rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]';
const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '—';

/**
 * Monitoreo de producto: una escena compartida con perspectivas configurables.
 * Las cajas son resultado de YOLO real. No hay iframe ni aplicación de laboratorio.
 */
export function VirtualMonitoringContent({ initialCameraId, onSelectCamera }: { initialCameraId: string; onSelectCamera: (id: string) => void }) {
  const { cameras } = useCameraRegistry();
  const monitor = useVirtualMonitoring(initialCameraId);
  const { state: incidentState } = useIncidentCenter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ImagePoint[]>([]);
  const [zoneError, setZoneError] = useState('');
  const [zoomMessage, setZoomMessage] = useState('');
  const currentCamera = cameras.find(camera => camera.id === monitor.cameraId);
  const available = monitor.mode === 'all'
    ? monitor.virtualCameraIds.some(id => cameras.some(camera => camera.id === id && camera.enabled && camera.sourceType === 'virtual-3d'))
    : Boolean(currentCamera?.enabled && currentCamera.sourceType === 'virtual-3d');
  const liveTracks = monitor.cameraStats[monitor.cameraId]?.people ?? 0;
  const openIncidents = incidentState.incidents.filter(incident => incident.status !== 'closed');
  const zonePoints = monitor.polygons[monitor.cameraId] ?? [];
  const polygon = editing ? draft : (currentCamera?.virtualSweep ? [] : zonePoints);
  const modelReady = monitor.modelState === 'ready';
  const isSweeping = Boolean(currentCamera?.virtualSweep);

  function changeCamera(id: string) {
    setEditing(false); setDraft([]); setZoneError(''); setZoomMessage('');
    monitor.setCameraId(id);
    onSelectCamera(id);
  }

  function addVertex(event: MouseEvent<SVGSVGElement>) {
    if (!editing || draft.length >= 16) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    setDraft(previous => [...previous, { x, y }]);
    setZoneError('');
  }

  function saveZone() {
    if (isSweeping) { setZoneError('Detén el barrido desde Cámaras para guardar zonas de imagen.'); return; }
    const error = validateImagePolygon(draft);
    if (error) { setZoneError(error); return; }
    const result = monitor.setZonePoints(monitor.cameraId, draft);
    if (result) { setZoneError(result); return; }
    setEditing(false); setDraft([]); setZoneError('');
  }

  function exportSession() {
    const result = {
      project: 'VISION AI', stage: 4, generatedAt: new Date().toISOString(),
      detectionSource: 'YOLOv8n ONNX, inferencia real sobre pixeles de camara 3D',
      cameraId: monitor.cameraId, analysisMode: monitor.mode, cameraStats: monitor.cameraStats, provider: monitor.provider,
      confidenceThreshold: monitor.threshold, captureZoom: monitor.zoom,
      analysisIntervalMs: monitor.intervalMs, zone: monitor.zone,
      metrics: { samples: monitor.samples.length, fps: monitor.fps, averageInferenceMs: monitor.averageMs },
      incidents: monitor.incidents, eventLog: monitor.log, samples: monitor.samples, analyses: monitor.analyses,
      cautionDemo: { source: 'DEMO — trayectoria 3D, sin detección de cono por YOLO', events: monitor.cautionDemoLog },
      coneReal: { source: 'REAL experimental — modelo PPE/ONNX separado', enabled: monitor.coneState === 'ready',
        cameraId: monitor.cameraId, detections: monitor.cones, inferenceMs: monitor.coneInferenceMs },
      note: 'Las detecciones de personas provienen de YOLO. La DEMO de conos usa trayectorias 3D predefinidas, queda separada del historial oficial y nunca activa sirena. Los conteos multicámara pueden duplicar personas.',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `vision-ai-${monitor.cameraId.toLowerCase()}-etapa4.json`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return <>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Camera size={15}/> Cámara seleccionada</div><div className="mt-2 text-xl font-bold">{monitor.cameraId}</div><p className="mt-1 text-[11px] text-[var(--muted)]">{currentCamera?.name ?? 'Registro no encontrado'}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Cpu size={15}/> Modelo de visión</div><div className="mt-2 text-xl font-bold">{modelReady ? 'YOLO activo' : monitor.modelState === 'loading' ? 'Iniciando…' : 'Detenido'}</div><p className="mt-1 text-[11px] text-[var(--muted)]">{monitor.provider.toUpperCase()} · Inferencia en navegador</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Eye size={15}/> Personas · cámara activa</div><div className="mt-2 text-xl font-bold tabular-nums">{liveTracks}</div><p className="mt-1 text-[11px] text-[var(--muted)]">Observadas por YOLO en {monitor.cameraId}</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Eye size={15}/> Suma multicámara</div><div className="mt-2 text-xl font-bold tabular-nums">{monitor.totalDetections}</div><p className="mt-1 text-[11px] text-[var(--muted)]">Suma por perspectiva, no personas únicas</p></Panel>
      <Panel className="p-4"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldAlert size={15}/> Incidentes visuales abiertos</div><div className="mt-2 text-xl font-bold tabular-nums">{openIncidents.length}</div><p className="mt-1 text-[11px] text-[var(--muted)]">Historial local compartido, sin servidor</p></Panel>
    </div>

    <div className="grid gap-5 2xl:grid-cols-[1.15fr_1fr]">
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div><h2 className="text-sm font-bold">Escenario industrial compartido</h2><p className="mt-1 text-xs text-[var(--muted)]">Un solo Three.Scene; cambia únicamente la perspectiva</p></div>
          <StatusBadge tone="success"><Video size={12}/> Fuente virtual 3D</StatusBadge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <p className="text-xs text-[var(--muted)]">Muestreo YOLO compartido</p>
          <div className="flex gap-2" role="group" aria-label="Modo de análisis">
            <Button size="sm" variant={monitor.mode === 'selected' ? 'primary' : 'secondary'} aria-pressed={monitor.mode === 'selected'} onClick={() => monitor.setMode('selected')}>Solo seleccionada</Button>
            <Button size="sm" variant={monitor.mode === 'all' ? 'primary' : 'secondary'} aria-pressed={monitor.mode === 'all'} onClick={() => monitor.setMode('all')}>Todas las 3D</Button>
          </div>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {monitor.virtualCameraIds.map(id => {
            const camera = cameras.find(item => item.id === id);
            const enabled = Boolean(camera?.enabled && camera.sourceType === 'virtual-3d');
            const selected = monitor.cameraId === id;
            return <button type="button" key={id} disabled={!enabled} onClick={() => changeCamera(id)}
              aria-pressed={selected}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-[var(--accent)] bg-[var(--notice-bg)]' : 'border-[var(--border)] hover:bg-[var(--muted-bg)]'}`}>
              <Camera size={20} className="shrink-0 text-[var(--accent)]"/>
              <span className="min-w-0"><strong className="block text-sm">{id}</strong><small className="block truncate text-[11px] text-[var(--muted)]">{camera?.name ?? 'Sin registro de cámara'}</small><small className="block text-[11px] font-semibold text-[var(--muted)]">{monitor.cameraStats[id]?.scanning ? `${monitor.cameraStats[id]?.people ?? 0} detecciones activas` : 'Sin análisis activo'}</small></span>
              {selected && <CheckCircle2 size={16} className="ml-auto shrink-0 text-[var(--success)]"/>}
            </button>;
          })}
        </div>
        <p className="px-4 pb-3 text-[11px] leading-5 text-[var(--muted)]">El modo multicámara alterna fotogramas; no duplica el modelo ni la escena. La frecuencia por cámara puede disminuir. Los conteos provienen de detecciones reales y no representan necesariamente personas únicas.</p>
        <div className="relative overflow-hidden bg-[#d8e0e5] dark:bg-[#262626]">
          <canvas ref={monitor.sceneCanvasRef} className="block aspect-video w-full" aria-label="Escenario industrial 3D de la cámara seleccionada"/>
          {monitor.worldError && <div role="alert" className="absolute inset-0 grid place-items-center bg-[var(--page)] p-6 text-center text-sm">{monitor.worldError}</div>}
          <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">{monitor.cameraId} · Vista 3D</span>
          {monitor.snapshot?.cautionNoticeActive && (
            <div role="status" aria-live="polite" className="pointer-events-none absolute right-3 top-3 max-w-[min(88%,280px)] rounded-xl border border-amber-400/80 bg-amber-50/95 px-3 py-2 text-amber-950 shadow-lg">
              <span className="flex items-center gap-2 text-xs font-bold"><Construction size={16}/> DEMO · Precaución</span>
              <p className="mt-1 text-[11px] leading-4">Operario próximo a conos. Aviso visual sin sirena.</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => monitor.setRunning(!(monitor.snapshot?.running ?? true))}>
              {monitor.snapshot?.running === false ? <Play size={15}/> : <Pause size={15}/>}{monitor.snapshot?.running === false ? 'Reanudar escena' : 'Pausar escena'}
            </Button>
            <Button size="sm" onClick={monitor.resetWorld}><RotateCcw size={15}/> Reiniciar</Button>
          </div>
          <span className="text-xs text-[var(--muted)]">Tiempo de escena: {fmt(monitor.snapshot?.elapsedSeconds ?? 0)} s</span>
        </div>
        <div className="border-t border-[var(--border)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-bold"><Construction size={17} className="text-amber-600"/> DEMO de precaución por conos</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Un operario virtual se acerca a los conos y se aleja. La proximidad se calcula desde la escena 3D, <strong>no la detecta YOLO</strong>.</p>
            </div>
            <Button size="sm" variant={monitor.snapshot?.cautionDemoEnabled ? 'secondary' : 'primary'} disabled={Boolean(monitor.worldError)}
              aria-pressed={Boolean(monitor.snapshot?.cautionDemoEnabled)}
              onClick={() => monitor.setCautionDemoEnabled(!monitor.snapshot?.cautionDemoEnabled)}>
              {monitor.snapshot?.cautionDemoEnabled ? <Square size={14}/> : <Play size={14}/>}
              {monitor.snapshot?.cautionDemoEnabled ? 'Detener DEMO' : 'Iniciar DEMO conos'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" role="status">
            <span className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 font-bold text-amber-900">SIMULACIÓN · Sin sirena</span>
            <span className="text-[var(--muted)]">{monitor.snapshot?.cautionNoticeActive ? 'Aviso ámbar activo: proximidad confirmada' : monitor.snapshot?.cautionDemoEnabled ? monitor.snapshot.running ? 'Recorrido en ejecución' : 'Escenario pausado' : 'Demo inactiva'}</span>
          </div>
          {monitor.cautionDemoLog.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3" aria-label="Registro local de la demostración de conos">
              <p className="text-[11px] font-semibold text-[var(--muted)]">Eventos DEMO de esta sesión (no sincronizados)</p>
              {monitor.cautionDemoLog.slice(0, 3).map((event, i) => (
                <p key={`${event.atSeconds}-${i}`} className="text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text)]">DEMO</span> · {event.type === 'near' ? 'Precaución: operario cerca de un cono' : 'Precaución finalizada'} · t = {fmt(event.atSeconds)} s
                </p>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <div><h2 className="flex items-center gap-2 text-sm font-bold"><Scan size={17}/> Análisis visual YOLO</h2><p className="mt-1 text-xs text-[var(--muted)]">Imagen RGB 640 × 480 y polígonos relativos a esta cámara</p></div>
          {modelReady ? <StatusBadge tone="success"><CircleDot size={12}/> REAL · ONNX</StatusBadge>
            : <StatusBadge tone="warning">IA inactiva</StatusBadge>}
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[11px] font-semibold">Motor
              <select className={`mt-1 block w-full ${control}`} disabled={modelReady || monitor.modelState === 'loading'} value={monitor.provider} onChange={e => monitor.setProvider(e.target.value as 'wasm' | 'webgpu')}><option value="webgpu">WebGPU</option><option value="wasm">WASM</option></select>
            </label>
            <label className="text-[11px] font-semibold">Umbral persona
              <select className={`mt-1 block w-full ${control}`} value={monitor.threshold} onChange={e => monitor.setThreshold(Number(e.target.value))}><option value="0.25">25 %</option><option value="0.40">40 %</option><option value="0.60">60 %</option></select>
            </label>
            <label className="text-[11px] font-semibold">Captura
              <select className={`mt-1 block w-full ${control}`} value={monitor.intervalMs} onChange={e => monitor.setIntervalMs(parseCaptureIntervalMs(e.target.value))}>{CAPTURE_INTERVAL_OPTIONS.map(ms => <option key={ms} value={ms}>{captureIntervalLabel(ms)}</option>)}</select>
            </label>
          </div>
          {isHighLoadCaptureInterval(monitor.intervalMs) && (
            <p role="status" className="rounded-lg border border-[var(--border)] bg-[var(--warning-bg)] p-3 text-xs leading-5 text-[var(--warning)]">
              Intervalo experimental de {monitor.intervalMs} ms: puede aumentar el consumo de GPU, la temperatura y la batería. Si notas calentamiento, cortes o inestabilidad, cambia a 75 ms o 100 ms. Los FPS reales dependen del equipo.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><Focus size={15}/> Zoom de captura
              <select aria-label="Zoom de captura" className={control} value={monitor.zoom} onChange={e => {
                const error = monitor.setZoom(Number(e.target.value));
                setZoomMessage(error ?? (monitor.zone ? 'Zoom actualizado; zona recalibrada y versionada localmente.' : 'Zoom actualizado.'));
              }}><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.6">1.6×</option></select>
            </label>
            {modelReady ? <Button variant="secondary" size="sm" onClick={monitor.stopModel}><Square size={14}/> Detener YOLO</Button>
              : <Button variant="primary" size="sm" disabled={monitor.modelState === 'loading' || !available || Boolean(monitor.worldError)} onClick={() => { void monitor.initializeModel(); }}><Play size={14}/>{monitor.modelState === 'loading' ? 'Cargando ONNX…' : 'Activar YOLO real'}</Button>}
          </div>
          {monitor.modelError && <div role="alert" className="flex items-start gap-2 rounded-lg bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]"><AlertCircle size={16} className="shrink-0"/><span>{monitor.modelError} Comprueba `npm run model:download` o cambia de WebGPU a WASM.</span></div>}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3" aria-label="E2 detección real opcional de conos">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold"><Construction size={16} className="text-amber-700 dark:text-amber-400"/> E2 · Detección REAL de conos (experimental)</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Modelo ONNX adicional y opcional. Solo aviso visual, <strong>sin sirena, incidentes ni escritura en Supabase</strong>.</p>
              </div>
              {monitor.coneState === 'ready'
                ? <Button size="sm" variant="secondary" onClick={monitor.stopConeModel}><Square size={14}/> Detener conos</Button>
                : <Button size="sm" variant="secondary" disabled={!modelReady || monitor.coneState === 'loading'} onClick={() => { void monitor.initializeConeModel(); }}>
                  <Play size={14}/>{monitor.coneState === 'loading' ? 'Cargando conos…' : 'Activar conos reales'}
                </Button>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" role="status">
              <span className="font-semibold">{monitor.coneState === 'ready' ? 'REAL · ONNX (experimental)' : monitor.coneState === 'loading' ? 'Inicializando motor secundario' : 'Modelo secundario detenido'}</span>
              <span className="text-[var(--muted)]">{monitor.cones.length} cono(s) observado(s) · {monitor.coneInferenceMs === null ? '—' : `${fmt(monitor.coneInferenceMs)} ms`} inferencia</span>
            </div>
            {monitor.coneError && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{monitor.coneError}</p>}
            <p className="mt-2 text-[11px] text-[var(--muted)]">Requiere `node scripts/download-cone-model-stage8.mjs`; el ONNX de 12,2 MB no está incluido en el ZIP. No se ha validado la precisión con imágenes etiquetadas. Modelo <a className="underline" href="https://huggingface.co/mancalazure/construction-ppe-safety" target="_blank" rel="noreferrer">mancalazure/construction-ppe-safety</a> (pesos CC BY 4.0).</p>
          </div>
          {!available && <div role="status" className="rounded-lg bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning)]">Esta perspectiva requiere el registro {monitor.cameraId} habilitado como fuente 3D en <Link className="underline" to="/camaras">Cámaras</Link>.</div>}
          <p className="text-[11px] leading-5 text-[var(--muted)]">El zoom solo amplía la imagen enviada a YOLO. Si existe una zona, sus vértices se recalibran y se guarda una versión local; los encuadres que la recorten se rechazan.</p>
          {zoomMessage && <p role="status" aria-live="polite" className="rounded-lg border border-[var(--border)] bg-[var(--muted-bg)] p-2 text-xs">{zoomMessage}</p>}
          {isSweeping && <div role="status" className="mb-3 rounded-lg border border-[var(--notice-border)] bg-[var(--notice-bg)] p-3 text-xs">Barrido automático activo: YOLO detecta personas, pero las zonas de imagen y sus alarmas están suspendidas para evitar falsas intrusiones. Cambia a cámara fija en Cámaras para activarlas.</div>}
          <div className="relative mx-auto aspect-[4/3] max-w-[760px] overflow-hidden rounded-xl border border-[var(--border)] bg-[#29343d]">
            <canvas ref={monitor.previewCanvasRef} width={640} height={480} className="block h-full w-full" aria-label="Fotograma RGB enviado a YOLO" />
            <svg viewBox="0 0 640 480" preserveAspectRatio="none" onClick={addVertex}
              className={`absolute inset-0 h-full w-full ${editing ? 'cursor-crosshair' : 'pointer-events-none'}`}
              aria-label={editing ? 'Pulsa para añadir vértices del polígono' : 'Detecciones y zona sobre la imagen'}>
              {polygon.length >= 2 && <polyline points={polygon.map(p => `${p.x*640},${p.y*480}`).join(' ')} fill="none" stroke="#b42318" strokeWidth="2.5" strokeDasharray={editing ? '6 4' : '0'}/>}
              {polygon.length >= 3 && <polygon points={polygon.map(p => `${p.x*640},${p.y*480}`).join(' ')} fill="rgba(180,35,24,0.14)" stroke="#b42318" strokeWidth="2.5"/>}
              {polygon.map((p, i) => <circle key={`${i}-${p.x}`} cx={p.x*640} cy={p.y*480} r="4" fill="white" stroke="#b42318" strokeWidth="2"/>)}
              {!editing && monitor.cones.map((cone, i) => <g key={`cone-real-${i}`} aria-label={`Cono real detectado, confianza ${Math.round(cone.confidence * 100)} por ciento`}>
                <rect x={cone.box.x*640} y={cone.box.y*480} width={cone.box.width*640} height={cone.box.height*480}
                  stroke="#d97706" strokeWidth="3" fill="rgba(217,119,6,0.10)"/>
                <rect x={cone.box.x*640} y={Math.max(0,cone.box.y*480-18)} width="116" height="18" fill="#92400e" rx="3"/>
                <text x={cone.box.x*640+4} y={Math.max(13,cone.box.y*480-5)} fill="white" fontSize="10" fontWeight="bold">REAL · Cono {Math.round(cone.confidence*100)}%</text>
              </g>)}
              {!editing && monitor.tracks.map(track => <g key={track.id} opacity={track.seen ? 1 : 0.5}>
                <rect x={track.box.x*640} y={track.box.y*480} width={track.box.width*640} height={track.box.height*480}
                  fill="none" stroke={trackVisualState(track).color} strokeWidth="3" strokeDasharray={track.seen ? undefined : '8 6'} />
                <rect x={Math.min(463, track.box.x*640)} y={Math.max(0, track.box.y*480-22)} width="176" height="22" fill={trackVisualState(track).color} rx="4"/>
                <text x={Math.min(463, track.box.x*640)+5} y={Math.max(15,track.box.y*480-7)} fontWeight="bold" fontSize="10.5" fill="white">#{track.id} · {trackVisualState(track).label}{track.seen ? ` · ${(track.confidence*100).toFixed(0)}%` : ''}</text>
                <circle cx={track.foot.x*640} cy={track.foot.y*480} r="4" fill="white" stroke="black" strokeWidth="2" />
              </g>)}
            </svg>
            <span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">{editing ? 'Dibujar polígono' : modelReady ? 'Detecciones YOLO reales' : 'Previsualización RGB (sin inferencia)'}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold" aria-label="Leyenda de seguimiento por YOLO">
            <span className="rounded-md bg-[#167d4a] px-2 py-1 text-white">Verde · fuera de zona</span>
            <span className="rounded-md bg-[#b42318] px-2 py-1 text-white">Rojo · dentro de zona</span>
            <span className="rounded-md bg-[#64748b] px-2 py-1 text-white">Gris · sin zona o detección</span>
            <span className="rounded-md bg-[#92400e] px-2 py-1 text-white">Ámbar · cono REAL (opcional)</span>
          </div>
          <p className="text-[11px] text-[var(--muted)]">El semáforo corresponde al punto inferior de la caja detectada por YOLO frente al polígono de esta cámara. Rojo no implica por sí solo incidente confirmado.</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold">Zona restringida de {monitor.cameraId}</p><p className="text-[11px] text-[var(--muted)]">{isSweeping ? 'Zona de imagen suspendida por barrido (sin alarmas)' : zonePoints.length >= 3 ? `${zonePoints.length} vértices · geometría de imagen` : 'Sin zona configurada (no se generan incidentes)'}</p></div>
            <div className="flex flex-wrap gap-2">
              {editing ? <>
                <Button size="sm" onClick={() => setDraft(value => value.slice(0, -1))} disabled={!draft.length}>Deshacer punto</Button>
                <Button size="sm" onClick={() => { setEditing(false); setDraft([]); setZoneError(''); }}>Cancelar</Button>
                <Button size="sm" variant="primary" onClick={saveZone}>Guardar zona</Button>
              </> : <>
                <Button size="sm" disabled={isSweeping} onClick={() => { setEditing(true); setDraft([]); setZoneError(''); }}>Redibujar zona</Button>
                <Button size="sm" disabled={isSweeping} onClick={() => { monitor.setZonePoints(monitor.cameraId, monitor.cameraId === 'CAM-02' ? STARTER_RESTRICTED_ZONE.polygon : []); }}>Restaurar</Button>
                <Button size="sm" variant="ghost" disabled={isSweeping} onClick={() => { monitor.setZonePoints(monitor.cameraId, []); }}>Quitar</Button>
              </>}
            </div>
          </div>
          {zoneError && <p role="alert" className="text-xs text-[var(--danger)]">{zoneError}</p>}
          {editing && <p className="text-xs text-[var(--muted)]">Pulsa sobre la imagen en al menos 3 puntos y guarda el polígono. Se validan cruces, área mínima y coordenadas.</p>}
        </div>
      </Panel>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <Panel className="p-5">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold">Rendimiento del detector</h2><p className="text-xs text-[var(--muted)]">Últimos 12 segundos visibles por cámara; no son FPS de Three.js</p></div><Cpu size={19} className="text-[var(--accent)]"/></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
          {[
            { label: 'Capturas analizadas', value: String(monitor.samples.length) },
            { label: 'Frecuencia reciente', value: !monitor.pageVisible ? 'En pausa' : monitor.fps ? `${fmt(monitor.fps)} FPS` : 'Midiendo…' },
            { label: 'Inferencia promedio', value: `${fmt(monitor.averageMs)} ms` },
            { label: 'Último ciclo completo', value: monitor.inferenceTotalMs === null ? '—' : `${fmt(monitor.inferenceTotalMs)} ms` },
          ].map(metric => <div className="rounded-xl bg-[var(--muted-bg)] p-3" key={metric.label}><p className="text-[11px] text-[var(--muted)]">{metric.label}</p><p className="mt-1.5 text-lg font-bold tabular-nums">{metric.value}</p></div>)}
        </div>
        <PerformanceDiagnostics
          cameras={monitor.virtualCameraIds.map(id => ({ cameraId: id,
            samples: monitor.analyses[id]?.samples ?? [], scanning: Boolean(monitor.cameraStats[id]?.scanning) }))}
          provider={monitor.provider} source="virtual-3d" mode={monitor.mode}
          intervalMs={monitor.intervalMs} threshold={monitor.threshold}
          foregroundSinceMs={monitor.foregroundSinceMs} visible={monitor.pageVisible && monitor.modelState === 'ready'}/>
        <p className="mb-3 text-[11px] text-[var(--muted)]">Al ocultar esta pestaña, el análisis se pausa; al regresar, el indicador se recalcula con nuevas capturas sin reiniciar YOLO.</p>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">La salida del modelo es auténtica y puede tener omisiones. Las coordenadas de los personajes 3D no se usan para obtener detecciones. Los resultados permanecen en memoria durante esta sesión.</p>
      </Panel>
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold">Incidentes de visión computacional</h2><p className="mt-1 text-xs text-[var(--muted)]">Reglas y confirmación configurables por cámara · cooldown por track</p></div><Button size="sm" onClick={exportSession} disabled={!Object.values(monitor.analyses).some(item => item.samples.length) && !monitor.cautionDemoLog.length}>Exportar JSON <ArrowRight size={14}/></Button></div>
        <div className="max-h-64 space-y-2 overflow-auto">
          {monitor.log.length === 0 && <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-5 text-xs text-[var(--muted)]"><ShieldCheck size={19}/> Sin eventos confirmados por YOLO en esta sesión.</div>}
          {monitor.log.map(event => <div key={event.key} className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-[var(--accent)]" size={16}/>
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{event.eventType === 'opened' ? 'Persona ingresó a zona restringida' : event.eventType === 'left' ? 'Salida visual confirmada' : 'Seguimiento perdido · requiere revisión'}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{event.incidentId} · {event.cameraId} · confianza {(event.confidence*100).toFixed(0)} %</p></div>
            <time className="shrink-0 text-[10px] text-[var(--muted)]">{new Date(event.occurredAt).toLocaleTimeString('es-PE')}</time>
          </div>)}
        </div>
        <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">La pérdida de seguimiento nunca se interpreta como salida. Reconocimiento, alarmas sonoras y auditoría local disponibles en Incidentes. El almacenamiento remoto continúa pendiente.</p>
      </Panel>
    </div>
    <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--notice-border)] bg-[var(--notice-bg)] p-4 text-xs leading-5 text-[var(--muted)]">
      <AlertCircle size={18} className="shrink-0 text-[var(--accent)]"/>
      <p><strong className="text-[var(--text)]">Alcance de las cámaras 3D.</strong> Todas las perspectivas virtuales comparten una escena y un Worker YOLO, con seguimiento independiente. Las fuentes MP4/WebM y webcam ya se pueden conectar desde el selector superior; cámaras virtuales configurables desde el gestor, RTSP y almacenamiento remoto siguen pendientes. El motor principal detecta personas; el motor opcional E2 detecta conos experimentalmente sobre píxeles, sin incidentes. La DEMO geométrica de conos sigue separada del historial oficial.</p>
    </div>
  </>;
}

