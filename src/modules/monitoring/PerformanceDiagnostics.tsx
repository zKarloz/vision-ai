import { Download, Gauge } from 'lucide-react';
import { Button } from '../../shared/components/Button';
import { fpsAssessment, measurePerformanceWindow, type PerformanceSample } from './performanceEvidence';

interface CameraInput {
  cameraId: string;
  samples: readonly PerformanceSample[];
  scanning: boolean;
}

interface Props {
  cameras: readonly CameraInput[];
  provider: string;
  source: 'virtual-3d' | 'webcam' | 'video-loop';
  mode: 'selected' | 'all';
  intervalMs: number;
  threshold: number;
  foregroundSinceMs: number;
  visible: boolean;
}

const display = (value: number | null, unit: string) => value === null ? '—' : `${value.toFixed(1)} ${unit}`;

/** Diagnóstico común para cámaras 3D, webcam y archivo; no guarda fotogramas. */
export function PerformanceDiagnostics({ cameras, provider, source, mode, intervalMs,
  threshold, foregroundSinceMs, visible }: Props) {
  const nowMs = performance.now();
  const camerasInRotation = Math.max(1, cameras.filter(camera => camera.scanning).length);
  const rows = cameras.map(camera => ({
    cameraId: camera.cameraId,
    scanning: camera.scanning,
    measurement: measurePerformanceWindow(camera.samples, nowMs, foregroundSinceMs,
      intervalMs, camerasInRotation, visible && camera.scanning),
  }));
  const measured = rows.some(row => row.measurement.summary.state === 'ready');

  function exportEvidence(): void {
    // Solo metadatos de rendimiento, de la ventana continua más reciente.
    const payload = {
      schema: 'vision-ai/performance-d2/v1', generatedAt: new Date().toISOString(),
      source, provider, analysisMode: mode, intervalMs, confidenceThreshold: threshold,
      visibility: visible ? 'visible' : 'paused',
      definitions: {
        fps: 'Muestras YOLO por segundo durante el último tramo continuo visible, por cámara; no FPS de Three.js',
        inferenceMs: 'Tiempo de inferencia comunicado por ONNX Runtime',
        cycleMs: 'Captura de fotograma hasta reglas y publicación local de incidente; NO mide reproducción real de sirena',
        percentile: 'Percentil 95 nearest-rank',
        objective: '5–15 FPS/cámara, latencia detección→alarma < 1500 ms (pendiente de ensayo extremo a extremo)',
      },
      cameras: rows.map(row => ({ cameraId: row.cameraId, scanning: row.scanning,
        summary: row.measurement.summary,
        // Tiempos relativos al inicio del navegador, sin historial de incidentes.
        samples: row.measurement.samples,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vision-ai-d2-rendimiento-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return <section aria-label="Diagnóstico de rendimiento YOLO" className="mt-4 border-t border-[var(--border)] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold"><Gauge size={16}/> D2 · Evidencia por cámara</h3>
      <Button size="sm" onClick={exportEvidence} disabled={!measured}><Download size={14}/> Exportar métricas JSON</Button>
    </div>
    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">Ventana continua de hasta 12 s, con al menos 5 capturas y 2 s observados. P95 = el valor bajo el cual cae el 95 % de muestras. No son FPS de renderizado.</p>
    <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[540px] text-left text-xs">
        <thead className="bg-[var(--muted-bg)] text-[var(--muted)]"><tr>
          <th scope="col" className="px-3 py-2">Cámara</th>
          <th scope="col" className="px-3 py-2">FPS YOLO</th>
          <th scope="col" className="px-3 py-2">Inferencia P95</th>
          <th scope="col" className="px-3 py-2">Ciclo P95</th>
          <th scope="col" className="px-3 py-2">Muestras</th>
        </tr></thead>
        <tbody>{rows.map(row => {
          const info = row.measurement.summary;
          const assessment = fpsAssessment(info.fps);
          const ready = info.state === 'ready';
          return <tr key={row.cameraId} className="border-t border-[var(--border)]">
            <th scope="row" className="px-3 py-2 font-semibold">{row.cameraId}</th>
            <td className="px-3 py-2 tabular-nums">{ready ? display(info.fps, 'FPS') : info.state === 'paused' ? 'En pausa' : 'Midiendo…'}
              {assessment === 'below' && <span className="ml-1 text-[var(--warning)]">(bajo objetivo)</span>}
              {assessment === 'within' && <span className="ml-1 text-[var(--success)]">(en rango)</span>}
            </td>
            <td className="px-3 py-2 tabular-nums">{display(info.inferenceP95Ms, 'ms')}</td>
            <td className="px-3 py-2 tabular-nums">{display(info.cycleP95Ms, 'ms')}</td>
            <td className="px-3 py-2 tabular-nums">{info.samples}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">«Ciclo» cubre captura → reglas → publicación local. <strong>No equivale a detección → sirena audible</strong>, que debe medirse aparte con sonido activado y prueba de campo. El archivo JSON no contiene imágenes, contraseñas ni auditoría de usuarios.</p>
  </section>;
}
