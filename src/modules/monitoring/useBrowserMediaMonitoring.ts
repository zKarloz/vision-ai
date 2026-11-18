import { useEffect, useRef, useState } from 'react';
import type { Detection, Provider } from '../../core/types/vision';
import type { VideoSourceStatus } from '../../application/ports/VideoSource';
import type { ImagePoint, ImageZone } from '../../core/domain/spatial';
import { validateImagePolygon } from '../../core/domain/spatial';
import type { SafetyRule, Zone } from '../../core/domain/zone';
import type { Incident } from '../../core/domain/incident';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { VisualIncidentCoordinator, type IncidentLogEntry } from '../../application/incidents/VisualIncidentCoordinator';
import { VisualZoneMonitor, DEFAULT_TRACKING_OPTIONS, type VisionTrack } from '../../domain/visualTracking';
import { BrowserMediaSource } from '../../infrastructure/video/BrowserMediaSource';
import type { BrowserSourceKind } from '../../infrastructure/video/BrowserMediaSource';
import { OnnxWorkerVisionEngine } from '../../infrastructure/vision/OnnxWorkerVisionEngine';
import { recentAnalysisFps } from './analysisPerformance';
import { DEFAULT_CAPTURE_INTERVAL_MS, type CaptureIntervalMs } from './captureInterval';

interface AnalysisSample { atMs: number; inferenceMs: number; detections: number }
type ModelState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Coordinador de fuente externa: capturas RGB de MP4/WebM o webcam pasan al mismo
 * VisionEngine real utilizado por 3D. No conoce posiciones internas de Three.js.
 * Una sola fuente externa se analiza por vez en este incremento.
 */
export function useBrowserMediaMonitoring(cameraId: string, sourceType: BrowserSourceKind) {
  const { config, setImagePolygon } = useCameraRegistry();
  const { center: incidentCenter } = useIncidentCenter();
  const sourceRef = useRef<BrowserMediaSource | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<OnnxWorkerVisionEngine | null>(null);
  const trackerRef = useRef(new VisualZoneMonitor());
  const incidentsRef = useRef(new VisualIncidentCoordinator());
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const wasOnlineRef = useRef(false);
  const [sourceStatus, setSourceStatus] = useState<VideoSourceStatus>('stopped');
  const [sourceError, setSourceError] = useState('');
  const [fileName, setFileName] = useState('');
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [modelError, setModelError] = useState('');
  const [provider, setProvider] = useState<Provider>('webgpu');
  const [threshold, setThreshold] = useState(0.25);
  const [intervalMs, setIntervalMs] = useState<CaptureIntervalMs>(DEFAULT_CAPTURE_INTERVAL_MS);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [foregroundSinceMs, setForegroundSinceMs] = useState(() => performance.now());
  const [detections, setDetections] = useState<Detection[]>([]);
  const [tracks, setTracks] = useState<VisionTrack[]>([]);
  const [samples, setSamples] = useState<AnalysisSample[]>([]);
  const [lastAtMs, setLastAtMs] = useState<number | null>(null);
  const [inferenceTotalMs, setInferenceTotalMs] = useState<number | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [log, setLog] = useState<IncidentLogEntry[]>([]);

  const zone = config.zones.find(z => z.cameraId === cameraId && z.type === 'restricted' && z.enabled) ?? null;
  const rule = config.rules.find(r => r.zoneId === zone?.id && r.enabled && r.classId === 'person');
  const configSignature = JSON.stringify({ cameraId, zones: config.zones, rules: config.rules, threshold });

  function clearObservations(reason = 'Fuente de video reiniciada'): void {
    incidentCenter.markMonitoringInterrupted([cameraId], reason);
    generationRef.current++;
    trackerRef.current.reset();
    incidentsRef.current.reset();
    setDetections([]); setTracks([]); setSamples([]);
    setLastAtMs(null); setInferenceTotalMs(null);
    setIncidents([]); setLog([]);
  }

  useEffect(() => {
    mountedRef.current = true;
    const source = new BrowserMediaSource(setSourceStatus);
    sourceRef.current = source;
    return () => {
      mountedRef.current = false;
      incidentCenter.markMonitoringInterrupted([cameraId], 'Fuente de video desconectada o vista cerrada');
      generationRef.current++;
      source.dispose();
      if (sourceRef.current === source) sourceRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [cameraId, sourceType]);

  useEffect(() => {
    const onChange = () => {
      const visible = !document.hidden;
      setPageVisible(visible);
      if (visible) setForegroundSinceMs(performance.now());
      else {
        incidentCenter.markMonitoringInterrupted([cameraId], 'Pestaña oculta');
        generationRef.current++; // Descartar inferencias iniciadas antes de ocultar la pestaña.
        trackerRef.current.reset(); incidentsRef.current.reset();
        setDetections([]); setTracks([]); setLastAtMs(null);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [cameraId, incidentCenter]);

  useEffect(() => {
    incidentCenter.markMonitoringInterrupted([cameraId], 'Cambio de regla, zona o umbral');
    generationRef.current++;
    trackerRef.current = new VisualZoneMonitor({
      ...DEFAULT_TRACKING_OPTIONS,
      confirmFrames: rule?.minFrames ?? DEFAULT_TRACKING_OPTIONS.confirmFrames,
      exitFrames: rule?.exitFrames ?? DEFAULT_TRACKING_OPTIONS.exitFrames,
    });
    incidentsRef.current.reset();
    setDetections([]); setTracks([]); setLastAtMs(null);
    setSamples([]); setIncidents([]); setLog([]);
    // Cambiar zonas, reglas y umbral requiere recalibrar el seguimiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSignature]);

  // La webcam o el archivo pueden quedarse sin señal mientras el modelo sigue cargado.
  useEffect(() => {
    if (sourceStatus === 'online') wasOnlineRef.current = true;
    else if (wasOnlineRef.current) {
      incidentCenter.markMonitoringInterrupted([cameraId], 'Señal de video interrumpida');
      trackerRef.current.reset(); incidentsRef.current.reset();
      generationRef.current++;
      wasOnlineRef.current = false;
    }
  }, [sourceStatus, cameraId, incidentCenter]);

  async function openFile(file: File): Promise<void> {
    const source = sourceRef.current;
    if (!source || sourceType !== 'video-loop') return;
    clearObservations('Cambio de archivo de video'); setSourceError(''); setFileName('');
    try {
      await source.openVideo(file);
      if (sourceRef.current === source) setFileName(file.name);
    } catch (error) {
      if (sourceRef.current === source) setSourceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openWebcam(): Promise<void> {
    const source = sourceRef.current;
    if (!source || sourceType !== 'webcam') return;
    clearObservations('Cambio de fuente webcam'); setSourceError('');
    try { await source.openWebcam(); }
    catch (error) {
      if (sourceRef.current === source) setSourceError(error instanceof Error ? error.message : String(error));
    }
  }

  function disconnect(): void {
    sourceRef.current?.stop();
    setSourceError(''); setFileName('');
    clearObservations('Fuente desconectada');
  }

  async function initializeModel(): Promise<void> {
    if (modelState === 'loading' || modelState === 'ready') return;
    const engine = new OnnxWorkerVisionEngine();
    engineRef.current?.dispose(); engineRef.current = engine;
    setModelError(''); setModelState('loading');
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
    generationRef.current++;
    engineRef.current?.dispose(); engineRef.current = null;
    setModelState('idle'); setModelError('');
    clearObservations('YOLO detenido manualmente');
  }

  // La previsualización funciona incluso antes de cargar el modelo YOLO.
  useEffect(() => {
    if (!pageVisible || sourceStatus !== 'online' || modelState === 'ready') return;
    const tick = () => {
      if (!sourceRef.current || !previewRef.current) return;
      sourceRef.current.drawFrame(previewRef.current);
    };
    tick();
    const timer = window.setInterval(tick, 450);
    return () => window.clearInterval(timer);
  }, [pageVisible, sourceStatus, modelState]);

  // Una inferencia activa por fuente; se descartan resultados de generaciones antiguas.
  useEffect(() => {
    if (!pageVisible || modelState !== 'ready' || sourceStatus !== 'online' || !engineRef.current) return;
    let active = true;
    const engine = engineRef.current;
    const process = async () => {
      if (!active || document.hidden || busyRef.current || !sourceRef.current) return;
      const source = sourceRef.current;
      busyRef.current = true;
      const generation = generationRef.current;
      try {
        const canvas = scratchRef.current ?? document.createElement('canvas');
        if (!scratchRef.current) { canvas.width = 640; canvas.height = 480; scratchRef.current = canvas; }
        if (!source.drawFrame(canvas)) {
          // Ausencia de fotograma válido: nunca interpretarla como zona vacía.
          incidentCenter.markMonitoringInterrupted([cameraId], 'Fuente sin fotograma disponible');
          trackerRef.current.reset(); incidentsRef.current.reset();
          return;
        }
        const frame = await createImageBitmap(canvas);
        if (!active || generation !== generationRef.current) { frame.close(); return; }
        const result = await engine.analyze(frame, threshold);
        if (!active || document.hidden || generation !== generationRef.current) return;
        const now = performance.now();
        const activeZone: Zone | null = config.zones.find(z => z.cameraId === cameraId && z.enabled && z.type === 'restricted') ?? null;
        const activeRule: SafetyRule | undefined = config.rules.find(r => r.zoneId === activeZone?.id && r.enabled && r.classId === 'person');
        const imageZone: ImageZone | null = activeZone ? { id: activeZone.id, cameraId, polygon: activeZone.polygon } : null;
        const filtered = activeRule ? result.detections.filter(d => d.confidence >= activeRule.minConfidence) : result.detections;
        const observed = trackerRef.current.step(cameraId, filtered, imageZone, now);
        if (activeRule) incidentsRef.current.ingest(observed.events, activeZone, activeRule, new Date().toISOString());
        const history = incidentsRef.current.snapshot();
        incidentCenter.ingest(history.incidents);
        if (previewRef.current) {
          previewRef.current.getContext('2d')?.drawImage(canvas, 0, 0,
            previewRef.current.width, previewRef.current.height);
        }
        setDetections(filtered); setTracks(observed.tracks);
        setLastAtMs(now);
        setSamples(prev => [...prev, { atMs: now, inferenceMs: result.metrics.inferenceMs, detections: filtered.length }].slice(-120));
        setInferenceTotalMs(result.metrics.totalMs);
        setIncidents(history.incidents); setLog(history.log);
      } catch (error) {
        if (active && engineRef.current === engine) {
          incidentCenter.markMonitoringInterrupted([cameraId], 'Error de inferencia de video');
          setModelError(error instanceof Error ? error.message : String(error));
          setModelState('error');
          engine.dispose(); engineRef.current = null;
        }
      } finally { busyRef.current = false; }
    };
    void process();
    const timer = window.setInterval(() => { void process(); }, intervalMs);
    return () => { active = false; window.clearInterval(timer); };
    // Las nuevas versiones de configuración invalidan resultados en tránsito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, pageVisible, sourceStatus, modelState, intervalMs, configSignature]);

  function savePolygon(points: ImagePoint[]): string | null {
    const error = validateImagePolygon(points);
    if (error) return error;
    try { setImagePolygon(cameraId, points); return null; }
    catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
  }

  function removePolygon(): void { setImagePolygon(cameraId, []); }

  const now = performance.now();
  const fresh = pageVisible && modelState === 'ready' && sourceStatus === 'online' &&
    lastAtMs !== null && now - lastAtMs <= Math.max(2200, intervalMs * 4);
  const fps = pageVisible ? recentAnalysisFps(samples, now, foregroundSinceMs, intervalMs, 1) : 0;
  const avgInferenceMs = samples.length ? samples.reduce((sum, sample) => sum + sample.inferenceMs, 0) / samples.length : 0;

  return {
    cameraId, sourceType, previewRef, sourceStatus, sourceError, fileName, openFile, openWebcam, disconnect,
    modelState, modelError, provider, setProvider, initializeModel, stopModel,
    threshold, setThreshold, intervalMs, setIntervalMs,
    pageVisible, fps, avgInferenceMs, inferenceTotalMs,
    zone, savePolygon, removePolygon, tracks: fresh ? tracks : [], detections: fresh ? detections : [],
    people: fresh ? tracks.filter(t => t.seen).length : 0, samples, incidents, log,
  };
}
