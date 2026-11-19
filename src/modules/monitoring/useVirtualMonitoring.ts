import { useEffect, useRef, useState } from 'react';
import type { Detection, Provider } from '../../core/types/vision';
import { validateImagePolygon, type ImagePoint, type ImageZone } from '../../core/domain/spatial';
import { cameraMonitoringPolicy } from '../../core/domain/cameraMonitoringPolicy';
import { polygonsFromConfig } from '../../application/config/cameraPolygons';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { VisualIncidentCoordinator, type IncidentLogEntry } from '../../application/incidents/VisualIncidentCoordinator';
import type { Incident } from '../../core/domain/incident';
import type { SafetyRule, Zone } from '../../core/domain/zone';
import { VisualZoneMonitor, DEFAULT_TRACKING_OPTIONS, type VisionTrack } from '../../domain/visualTracking';
import { SimulationWorld, type CameraId as WorldCameraId, type SimulationSnapshot } from '../../infrastructure/simulation/SimulationWorld';
import type { CautionDemoEvent } from '../../infrastructure/simulation/PrecautionDemo';
import { OnnxWorkerVisionEngine } from '../../infrastructure/vision/OnnxWorkerVisionEngine';
import { CameraRoundRobin, freshObservedCount, type AnalysisMode } from './cameraScheduler';
import { recentAnalysisFps } from './analysisPerformance';
import { DEFAULT_CAPTURE_INTERVAL_MS, type CaptureIntervalMs } from './captureInterval';

export type CameraId = string;
export type ModelState = 'idle' | 'loading' | 'ready' | 'error';
export interface VisionSample { atMs: number; inferenceMs: number; cycleMs: number; count: number }
export interface CameraAnalysis {
  detections: Detection[];
  tracks: VisionTrack[];
  samples: VisionSample[];
  inferenceTotalMs: number | null;
  lastAtMs: number | null;
}
export type CameraAnalyses = Record<CameraId, CameraAnalysis>;

function emptyAnalysis(): CameraAnalysis {
  return { detections: [], tracks: [], samples: [], inferenceTotalMs: null, lastAtMs: null };
}
function emptyAnalyses(cameraIds: readonly string[] = []): CameraAnalyses {
  return Object.fromEntries(cameraIds.map(id => [id, emptyAnalysis()]));
}

/**
 * El mundo Three.js existe una sola vez; cada cámara tiene seguimiento independiente.
 * Un planificador alterna capturas, pero sólo hay una inferencia ONNX en tránsito.
 * Ni las detecciones ni los incidentes visuales se deducen de posiciones 3D.
 */
export function useVirtualMonitoring(initialCameraId: WorldCameraId = 'CAM-02') {
  const { config, setImagePolygon } = useCameraRegistry();
  const { center: incidentCenter } = useIncidentCenter();
  const polygons = polygonsFromConfig(config.zones);
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<SimulationWorld | null>(null);
  const engineRef = useRef<OnnxWorkerVisionEngine | null>(null);
  const trackersRef = useRef<Record<string, VisualZoneMonitor>>({});
  const incidentsRef = useRef(new VisualIncidentCoordinator());
  const schedulerRef = useRef(new CameraRoundRobin());
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const inferenceBusyRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const monitoredCameraIdsRef = useRef<string[]>([]);

  const [cameraId, setCameraId] = useState<WorldCameraId>(initialCameraId);
  const [mode, setMode] = useState<AnalysisMode>('all');
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [worldError, setWorldError] = useState('');
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [modelError, setModelError] = useState('');
  const [provider, setProvider] = useState<Provider>('webgpu');
  const [threshold, setThreshold] = useState(0.25);
  const [intervalMs, setIntervalMs] = useState<CaptureIntervalMs>(DEFAULT_CAPTURE_INTERVAL_MS);
  // Chrome limita timers y requestAnimationFrame en pestañas ocultas.
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [foregroundSinceMs, setForegroundSinceMs] = useState(() => performance.now());
  const [zoomByCamera, setZoomByCamera] = useState<Record<CameraId, number>>({ 'CAM-01': 1, 'CAM-02': 1.5 });
  const [analyses, setAnalyses] = useState<CameraAnalyses>(emptyAnalyses);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [log, setLog] = useState<IncidentLogEntry[]>([]);
  // Únicamente en memoria de esta vista: los avisos DEMO no son auditoría real.
  const [cautionDemoLog, setCautionDemoLog] = useState<CautionDemoEvent[]>([]);

  const zoom = zoomByCamera[cameraId] ?? 1;
  const selectedRecord = config.cameras.find(item => item.id === cameraId);
  const zone = selectedRecord && cameraMonitoringPolicy(selectedRecord).imageZones
    ? (config.zones.find(item => item.cameraId === cameraId && item.enabled && item.type === 'restricted') ?? null) : null;
  const virtualCameraIds = config.cameras.filter(camera => camera.sourceType === 'virtual-3d').map(camera => camera.id);
  const eligibleCameras = config.cameras.filter(camera => camera.sourceType === 'virtual-3d' && camera.enabled).map(camera => camera.id);
  monitoredCameraIdsRef.current = mode === 'all' ? eligibleCameras : eligibleCameras.filter(id => id === cameraId);
  const poseSignature = JSON.stringify(config.cameras.filter(camera => camera.sourceType === 'virtual-3d')
    .map(camera => [camera.id, camera.virtualPose, camera.virtualSweep]));

  function clearAnalysis(reason = 'Reinicio de monitoreo 3D'): void {
    // Invalidar y conservar en el centro cualquier intrusión aún sin cierre.
    incidentCenter.markMonitoringInterrupted(undefined, reason);
    generationRef.current++;
    trackersRef.current = Object.fromEntries(virtualCameraIds.map(id => [id, new VisualZoneMonitor()]));
    incidentsRef.current.reset();
    schedulerRef.current.reset();
    setAnalyses(emptyAnalyses(virtualCameraIds));
    setIncidents([]);
    setLog([]);
  }

  // Al montar Monitoreo creamos una sola escena; seleccionar cámara no la reconstruye.
  useEffect(() => {
    mountedRef.current = true;
    const canvas = sceneCanvasRef.current;
    if (!canvas) return;
    let world: SimulationWorld;
    try {
      world = new SimulationWorld(canvas, setSnapshot, () => {
        // Los eventos geométricos no se convierten en detecciones ni incidentes YOLO.
      }, event => {
        // Registro separado: JAMÁS invocar IncidentCenter.ingest para la DEMO.
        if (mountedRef.current) setCautionDemoLog(previous => [event, ...previous].slice(0, 20));
      });
      worldRef.current = world;
      world.setVirtualCameras(config.cameras);
      world.selectCamera(cameraId);
      world.start();
    } catch (error) {
      setWorldError(error instanceof Error ? error.message : 'WebGL no está disponible.');
      return;
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => world.resize()) : null;
    observer?.observe(canvas);
    return () => {
      mountedRef.current = false;
      incidentCenter.markMonitoringInterrupted(monitoredCameraIdsRef.current, 'Vista de monitoreo cerrada');
      observer?.disconnect();
      world.dispose();
      if (worldRef.current === world) worldRef.current = null;
    };
    // La selección no debe regenerar Three.Scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { mountedRef.current = false; engineRef.current?.dispose(); engineRef.current = null; }, []);
  // La URL puede seleccionar otra perspectiva sin recrear la escena.
  useEffect(() => { setCameraId(initialCameraId); }, [initialCameraId]);
  useEffect(() => { worldRef.current?.setVirtualCameras(config.cameras);
    // Mantener la escena: actualizar poses no reconstruye geometrías ni modelos.
    worldRef.current?.selectCamera(cameraId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseSignature]);
  useEffect(() => { worldRef.current?.selectCamera(cameraId); }, [cameraId]);

  // Evitamos inferencias sin imágenes actualizadas mientras la pestaña está oculta.
  // Al regresar se conserva el historial de eventos y se inicia una medición FPS nueva.
  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = !document.hidden;
      setPageVisible(visible);
      if (visible) setForegroundSinceMs(performance.now());
      else {
        // Una pestaña oculta deja de observar: ningún evento posterior equivale a una salida.
        incidentCenter.markMonitoringInterrupted(monitoredCameraIdsRef.current, 'Pestaña oculta');
        generationRef.current++;
        for (const tracker of Object.values(trackersRef.current)) tracker.reset();
        incidentsRef.current.reset();
        // No mostrar cajas o conteos como si fuesen detecciones en directo.
        setAnalyses(previous => Object.fromEntries(Object.entries(previous).map(([id, state]) => [id, {
          ...state, tracks: [], detections: [], lastAtMs: null,
        }])));
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [incidentCenter]);

  // Una configuración, umbral o zoom nuevos requieren recalibrar el seguimiento.
  // Cambiar de cámara o alternar el modo NO elimina eventos de otras perspectivas.
  const configSignature = JSON.stringify({
    cameras: config.cameras.map(c => [c.id, c.enabled, c.sourceType, c.virtualPose, c.virtualSweep]),
    zones: config.zones, rules: config.rules, zoomByCamera, threshold,
  });
  useEffect(() => {
    incidentCenter.markMonitoringInterrupted(undefined, 'Cambio de configuración/cámara/zona/umbral');
    generationRef.current++;
    for (const id of virtualCameraIds) {
      const restricted = config.zones.find(z => z.cameraId === id && z.enabled && z.type === 'restricted');
      const rule = config.rules.find(r => r.zoneId === restricted?.id && r.enabled && r.classId === 'person');
      trackersRef.current[id] = new VisualZoneMonitor({
        ...DEFAULT_TRACKING_OPTIONS,
        confirmFrames: rule?.minFrames ?? DEFAULT_TRACKING_OPTIONS.confirmFrames,
        exitFrames: rule?.exitFrames ?? DEFAULT_TRACKING_OPTIONS.exitFrames,
        // CAM-02 pierde YOLO durante 4–6 muestras (75 ms cada una) según evidencia
        // exportada. Retener el track 1,2 s evita nuevos IDs por oclusiones breves.
        // La regla de entrada consecutiva y el cierre por salida no se relajan.
        lossGraceMs: 1_200,
      });
    }
    incidentsRef.current.reset();
    schedulerRef.current.reset();
    setAnalyses(emptyAnalyses(virtualCameraIds));
    setIncidents([]); setLog([]);
    // Importaciones/versiones nuevas se detectan por su contenido, no sólo por el número.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSignature]);

  // En modo «solo seleccionada», las cámaras restantes ya no están siendo observadas.
  // No se altera la continuidad de las cámaras que permanecen activas.
  const previousObservedRef = useRef<string[]>([]);
  useEffect(() => {
    const nowObserved = monitoredCameraIdsRef.current;
    if (modelState === 'ready' && pageVisible) {
      const removed = previousObservedRef.current.filter(id => !nowObserved.includes(id));
      if (removed.length) {
        incidentCenter.markMonitoringInterrupted(removed, 'Cámara excluida del muestreo');
        for (const id of removed) {
          trackersRef.current[id]?.reset();
          incidentsRef.current.forgetCamera(id);
        }
        setAnalyses(previous => Object.fromEntries(Object.entries(previous).map(([id, value]) =>
          [id, removed.includes(id) ? emptyAnalysis() : value])));
        const history = incidentsRef.current.snapshot();
        setIncidents(history.incidents); setLog(history.log);
      }
      previousObservedRef.current = nowObserved;
    } else previousObservedRef.current = [];
  }, [mode, cameraId, modelState, pageVisible, poseSignature, incidentCenter]);

  // Previsualización sin IA: siempre corresponde a la cámara seleccionada.
  useEffect(() => {
    if (modelState === 'ready' || worldError || !pageVisible) return;
    let active = true;
    let busy = false;
    const showPreview = async () => {
      if (busy || !active || !worldRef.current || !previewCanvasRef.current) return;
      busy = true;
      try {
        const frame = await worldRef.current.capture(cameraId, previewCanvasRef.current, zoom);
        frame.close();
      } catch { /* El visor 3D permanece disponible aunque falle la captura. */ }
      finally { busy = false; }
    };
    void showPreview();
    const timer = window.setInterval(() => { void showPreview(); }, 650);
    return () => { active = false; window.clearInterval(timer); };
  }, [modelState, cameraId, zoom, worldError, pageVisible]);

  // Muestreo secuencial: nunca se envían dos imágenes a YOLO simultáneamente.
  useEffect(() => {
    if (modelState !== 'ready' || !engineRef.current || worldError || !pageVisible) return;
    let active = true;
    const engine = engineRef.current;
    const process = async () => {
      const world = worldRef.current;
      if (!active || document.hidden || inferenceBusyRef.current || !world) return;
      const target = schedulerRef.current.next(eligibleCameras, cameraId, mode);
      if (!target) return;
      inferenceBusyRef.current = true;
      // Cronómetro monotónico de captura → reglas/publicación local, sin audio.
      const cycleStartMs = performance.now();
      const generation = generationRef.current;
      try {
        const scratch = scratchRef.current ?? document.createElement('canvas');
        if (!scratchRef.current) { scratch.width = 640; scratch.height = 480; scratchRef.current = scratch; }
        const bitmap = await world.capture(target, scratch, zoomByCamera[target]);
        if (!active || generation !== generationRef.current) { bitmap.close(); return; }
        const result = await engine.analyze(bitmap, threshold);
        if (!active || document.hidden || generation !== generationRef.current) return;
        const observedAt = performance.now();
        // La configuración de áreas y reglas es siempre específica de la cámara analizada.
        // Las zonas en píxeles son válidas solo para cámaras fijas; una cámara PTZ
        // requiere reproyección desde coordenadas de suelo antes de generar incidentes.
        const cameraRecord = config.cameras.find(item => item.id === target);
        const zonesAvailable = cameraRecord ? cameraMonitoringPolicy(cameraRecord).imageZones : false;
        const selectedZone: Zone | null = zonesAvailable ? config.zones.find(item => item.cameraId === target &&
          item.enabled && item.type === 'restricted') ?? null : null;
        const rule: SafetyRule | undefined = config.rules.find(item => item.zoneId === selectedZone?.id &&
          item.classId === 'person' && item.enabled);
        const imageZone: ImageZone | null = selectedZone ? {
          id: selectedZone.id, cameraId: target, polygon: selectedZone.polygon,
        } : null;
        // El umbral de regla filtra detecciones antes de confirmar un track de seguridad.
        const filtered = rule ? result.detections.filter(item => item.confidence >= rule.minConfidence) : result.detections;
        const tracker = trackersRef.current[target] ?? (trackersRef.current[target] = new VisualZoneMonitor());
        const evaluated = tracker.step(target, filtered, imageZone, observedAt);
        // Mantener la última caja observada para detectar fragmentaciones rápidas del track.
        incidentsRef.current.observeTracks(target, evaluated.tracks, observedAt);
        if (rule) incidentsRef.current.ingest(evaluated.events, selectedZone, rule, new Date().toISOString());
        const history = incidentsRef.current.snapshot();
        incidentCenter.ingest(history.incidents);
        // El canvas visible sólo muestra fotogramas de la perspectiva seleccionada.
        if (target === cameraId && previewCanvasRef.current) {
          previewCanvasRef.current.getContext('2d')?.drawImage(scratch, 0, 0,
            previewCanvasRef.current.width, previewCanvasRef.current.height);
        }
        // Se congela antes del setState: React puede ejecutar el updater más tarde.
        const cycleMs = performance.now() - cycleStartMs;
        setAnalyses(previous => ({ ...previous, [target]: {
          detections: filtered,
          tracks: evaluated.tracks,
          samples: [...(previous[target]?.samples ?? []), {
            atMs: observedAt, inferenceMs: result.metrics.inferenceMs,
            cycleMs, count: filtered.length,
          }].slice(-120),
          inferenceTotalMs: result.metrics.totalMs,
          lastAtMs: observedAt,
        } }));
        setIncidents(history.incidents); setLog(history.log);
      } catch (error) {
        if (active && engineRef.current === engine) {
          incidentCenter.markMonitoringInterrupted(monitoredCameraIdsRef.current, 'Error de inferencia 3D');
          setModelError(error instanceof Error ? error.message : 'Error inesperado de inferencia.');
          setModelState('error');
          engine.dispose();
          engineRef.current = null;
        }
      } finally { inferenceBusyRef.current = false; }
    };
    void process();
    const timer = window.setInterval(() => { void process(); }, intervalMs);
    return () => { active = false; window.clearInterval(timer); };
    // Dependencias de configuración: el resultado de una inferencia antigua se descarta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelState, cameraId, mode, threshold, intervalMs, configSignature, worldError, pageVisible]);

  async function initializeModel(): Promise<void> {
    if (modelState === 'loading' || modelState === 'ready') return;
    setModelState('loading'); setModelError('');
    const engine = new OnnxWorkerVisionEngine();
    engineRef.current?.dispose();
    engineRef.current = engine;
    try {
      await engine.initialize(provider);
      if (!mountedRef.current || engineRef.current !== engine) { engine.dispose(); return; }
      setModelState('ready');
    } catch (error) {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      if (mountedRef.current) {
        setModelError(error instanceof Error ? error.message : String(error));
        setModelState('error');
      }
    }
  }

  function stopModel(): void {
    engineRef.current?.dispose(); engineRef.current = null;
    setModelState('idle'); setModelError('');
    clearAnalysis('YOLO detenido manualmente');
  }

  function setZonePoints(id: WorldCameraId, points: ImagePoint[]): string | null {
    if (points.length && validateImagePolygon(points)) return validateImagePolygon(points);
    try { setImagePolygon(id, points); return null; }
    catch (error) { return error instanceof Error ? error.message : 'No se pudo guardar la zona.'; }
  }

  function setZoom(value: number): void {
    setZoomByCamera(previous => ({ ...previous, [cameraId]: value }));
  }

  const visible = analyses[cameraId] ?? emptyAnalysis();
  const now = performance.now();
  const maxAgeMs = Math.max(2200, intervalMs * Math.max(1, mode === 'all' ? eligibleCameras.length : 1) * 4);
  const cameraStats = Object.fromEntries(virtualCameraIds.map(id => {
    const enabled = eligibleCameras.includes(id);
    const scanning = enabled && (mode === 'all' || cameraId === id) && modelState === 'ready';
    const state = analyses[id] ?? emptyAnalysis();
    return [id, {
      enabled, scanning,
      people: scanning ? freshObservedCount(state.tracks, state.lastAtMs, now, maxAgeMs) : 0,
      samples: state.samples.length,
      lastAtMs: state.lastAtMs,
    }];
  })) as Record<CameraId, { enabled: boolean; scanning: boolean; people: number; samples: number; lastAtMs: number | null }>;
  const totalDetections = Object.values(cameraStats).reduce((sum, item) => sum + item.people, 0);
  // Un overlay antiguo no permanece visible cuando la cámara deja de muestrearse.
  const showSelectedTracks = pageVisible && cameraStats[cameraId].scanning && visible.lastAtMs !== null &&
    now - visible.lastAtMs <= maxAgeMs;
  const samples = visible.samples;
  // Solo muestras del período visible actual; nunca amortizamos los FPS con pausas ocultas.
  const fps = pageVisible ? recentAnalysisFps(samples, now, foregroundSinceMs, intervalMs,
    Math.max(1, mode === 'all' ? eligibleCameras.length : 1)) : 0;
  const averageMs = samples.length
    ? samples.reduce((sum, sample) => sum + sample.inferenceMs, 0) / samples.length : 0;

  return {
    sceneCanvasRef, previewCanvasRef, cameraId, setCameraId, snapshot, worldError,
    mode, setMode, virtualCameraIds, cameraStats, totalDetections, pageVisible, foregroundSinceMs,
    modelState, modelError, provider, setProvider, initializeModel, stopModel,
    threshold, setThreshold, intervalMs, setIntervalMs,
    zoom, setZoom, polygons, setZonePoints, zone,
    detections: showSelectedTracks ? visible.detections : [],
    tracks: showSelectedTracks ? visible.tracks : [], samples, analyses,
    incidents, log, cautionDemoLog, inferenceTotalMs: visible.inferenceTotalMs, fps, averageMs,
    setRunning: (running: boolean) => worldRef.current?.setRunning(running),
    setCautionDemoEnabled: (enabled: boolean) => worldRef.current?.setCautionDemoEnabled(enabled),
    resetWorld: () => { worldRef.current?.reset(); clearAnalysis('Escenario 3D reiniciado'); },
  };
}
