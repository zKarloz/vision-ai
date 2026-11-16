import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import { QUALITY_STEPS, qualityProgress } from '../../application/qualityGuide';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { Button } from '../../shared/components/Button';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { useReportCenter } from '../../app/providers/ReportCenterProvider';
import { useRemoteSync } from '../../app/providers/RemoteSyncProvider';

const labels = { funcional: 'Flujo funcional', interfaz: 'Interfaz', seguridad: 'Acceso', remoto: 'Integración remota' };

/**
 * Guion guiado de calidad para la defensa académica.
 * Las casillas son confirmaciones humanas y NO alteran alarmas, cámaras ni datos.
 * El estado no se comparte entre usuarios ni se guarda en localStorage.
 */
export function QualityPage() {
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const { state: incidents } = useIncidentCenter();
  const { state: reports } = useReportCenter();
  const remote = useRemoteSync();
  const progress = qualityProgress(completed);
  const activeIncidents = incidents.incidents.filter(item => item.status !== 'closed').length;

  function toggle(id: string) {
    setCompleted(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <>
    <PageHeader eyebrow="Etapa 7 · Calidad y aceptación" title="Demostración guiada"
      description="Lista manual de aceptación basada en el documento rector. Comprueba el funcionamiento real, accesibilidad y seguridad antes de cerrar la etapa." />
    <div className="mb-5 grid gap-4 md:grid-cols-[1.5fr_1fr]">
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><ClipboardCheck size={18} /> Avance de verificación</h2>
          <span className="text-xs font-semibold tabular-nums text-[var(--muted)]" aria-live="polite">{progress.completed} de {progress.total} comprobaciones</span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--muted-bg)]" role="progressbar"
          aria-label="Progreso de la lista de aceptación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
          <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Las casillas indican pruebas realizadas por ti, no resultados medidos automáticamente. No se guardan datos de esta guía.</p>
        <Button size="sm" className="mt-4" onClick={() => setCompleted(new Set())}><RotateCcw size={15} /> Reiniciar guía</Button>
      </Panel>
      <Panel className="p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} /> Señales reales del sistema</h2>
        <dl className="mt-4 grid grid-cols-3 gap-3" aria-label="Resumen local de la sesión">
          <div><dt className="text-[11px] text-[var(--muted)]">Incidentes</dt><dd className="mt-1 text-xl font-bold tabular-nums">{incidents.incidents.length}</dd></div>
          <div><dt className="text-[11px] text-[var(--muted)]">Abiertos</dt><dd className="mt-1 text-xl font-bold tabular-nums">{activeIncidents}</dd></div>
          <div><dt className="text-[11px] text-[var(--muted)]">Reportes</dt><dd className="mt-1 text-xl font-bold tabular-nums">{reports.reports.length}</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Sincronización remota: {remote.enabled ? (remote.error ? 'con error' : 'autorizada') : 'no habilitada en esta sesión'}. Estos indicadores corresponden al navegador.</p>
      </Panel>
    </div>

    <div className="space-y-3" aria-label="Pasos de aceptación de VISION AI">
      {QUALITY_STEPS.map((step, index) => {
        const checked = completed.has(step.id);
        return <Panel key={step.id} className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--muted-bg)] text-xs font-bold text-[var(--muted)] tabular-nums">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{labels[step.category]}</p>
                <h2 id={`paso-${step.id}`} className="mt-1 text-base font-bold">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.description}</p>
                <p className="mt-3 flex items-start gap-2 text-xs leading-5"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-[var(--success)]" /> <span><strong>Resultado esperado:</strong> {step.expected}</span></p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
                <input type="checkbox" checked={checked} onChange={() => toggle(step.id)} aria-label={`Marcar ${step.title} como verificado`}
                  className="h-4 w-4 accent-[var(--primary)]" /> Verificado
              </label>
              <Link to={step.path} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] underline-offset-4 hover:underline">{step.action}<ArrowUpRight aria-hidden="true" size={14} /></Link>
            </div>
          </div>
        </Panel>;
      })}
    </div>
    <Panel className="mt-5 border-[var(--notice-border)] bg-[var(--notice-bg)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold"><Info size={18} /> Alcance que debemos comunicar</h2>
      <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Estas pruebas emplean el contrato de detecciones YOLO reales. El modelo COCO actual reconoce personas, pero no certifica detección de conos, cascos ni chalecos. La demostración del cono que describe el PDF queda como brecha explícita hasta disponer de un modelo entrenado. Tampoco se garantiza monitoreo con el navegador cerrado.</p>
      <p className="mt-2 text-xs leading-6 text-[var(--muted)]">La ejecución automática de Cron y la entrega en correo requieren evidencia del servidor; marcar la casilla no sustituye esa comprobación.</p>
    </Panel>
  </>;
}
