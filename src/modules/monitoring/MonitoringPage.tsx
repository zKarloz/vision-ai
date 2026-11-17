import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { type Camera as CameraRecord } from '../../core/domain/camera';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { Spinner } from '../../shared/components/Spinner';
import { AlarmStatusBar } from '../../shared/components/AlarmStatusBar';

// La pantalla sólo importa Three.js cuando se selecciona un ángulo 3D.
const VirtualMonitoringContent = lazy(() => import('./VirtualMonitoringContent').then(m => ({ default: m.VirtualMonitoringContent })));
// Los adaptadores HTMLVideoElement y webcam no requieren montar la escena WebGL.
const BrowserMediaMonitoring = lazy(() => import('./BrowserMediaMonitoring').then(m => ({ default: m.BrowserMediaMonitoring })));
const control = 'rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]';

/** Selector general: sólo una vista y un Worker YOLO activos al mismo tiempo. */
export function MonitoringPage() {
  const { cameras } = useCameraRegistry();
  const [params, setParams] = useSearchParams();
  const supported = cameras.filter(camera => camera.enabled && (
    camera.sourceType === 'virtual-3d' ||
    camera.sourceType === 'video-loop' || camera.sourceType === 'webcam'
  ));
  const selected = supported.find(camera => camera.id === params.get('camera')) ??
    supported.find(camera => camera.id === 'CAM-02') ?? supported[0];

  const selectCamera = (id: string) => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set('camera', id);
    return next;
  });

  return <>
    <PageHeader title="Monitoreo de cámaras"
      description="Escenario 3D compartido o fuentes locales MP4/WebM y webcam. Las detecciones de personas proceden de YOLO sobre fotogramas reales."/>
    <AlarmStatusBar/>
    <Panel className="mb-5 flex flex-wrap items-center gap-3 p-4">
      <label htmlFor="monitor-camera-source" className="text-xs font-bold">Fuente de monitoreo</label>
      <select id="monitor-camera-source" className={`${control} min-w-[220px] flex-1 sm:flex-none`}
        value={selected?.id ?? ''} onChange={event => selectCamera(event.target.value)} disabled={!supported.length}>
        {supported.length ? supported.map(camera => <option key={camera.id} value={camera.id}>{camera.id} · {camera.name} ({camera.sourceType === 'virtual-3d' ? '3D' : camera.sourceType === 'webcam' ? 'Webcam' : 'Vídeo'})</option>) : <option value="">Sin cámaras habilitadas</option>}
      </select>
      <span className="text-xs text-[var(--muted)]">{selected?.sourceType === 'virtual-3d' ? 'Una escena · varias perspectivas' : selected ? 'Archivo o dispositivo local · fuente seleccionada' : 'Habilita una cámara desde el gestor'}</span>
      <Link to="/camaras" className="ml-auto text-xs font-semibold text-[var(--accent)] underline">Administrar cámaras</Link>
    </Panel>
    <Suspense fallback={<Panel className="grid min-h-80 place-items-center"><Spinner label="Preparando fuente de vídeo…"/></Panel>}>
    {!selected ? <Panel className="p-6 text-sm text-[var(--muted)]">No hay fuentes compatibles activas. Habilita alguna cámara en el gestor de cámaras.</Panel>
      : selected.sourceType === 'virtual-3d' ? <VirtualMonitoringContent
          initialCameraId={selected.id}
          onSelectCamera={selectCamera}/>
      : <BrowserMediaMonitoring key={selected.id}
          camera={selected as CameraRecord & { sourceType: 'video-loop' | 'webcam' }}/>
    }
    </Suspense>
  </>;
}
