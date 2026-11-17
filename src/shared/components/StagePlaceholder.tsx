import { ArrowRight, Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

/** Evita fabricar incidentes o reportes mientras todavía no existe backend. */
export function StagePlaceholder({ title, description, details }: { title: string; description: string; targetStage: number; details: string[] }) {
  return <>
    <PageHeader title={title} description={description} />
    <Panel className="p-7 md:p-10">
      <div className="max-w-2xl">
        <div className="mb-5 inline-flex rounded-2xl bg-[var(--muted-bg)] p-3 text-[var(--accent)]"><Construction size={24} /></div>
        <div className="mb-3"><StatusBadge tone="warning">Sin datos operativos todavía</StatusBadge></div>
        <h2 className="text-xl font-bold">Implementación programada</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Las funciones en desarrollo se habilitarán únicamente cuando dispongan de datos y pruebas verificables.</p>
        <ul className="mt-5 space-y-3">{details.map((detail) => <li key={detail} className="flex gap-3 text-sm"><ArrowRight size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />{detail}</li>)}</ul>
        <Link className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline" to="/monitoreo">Ir a Monitoreo <ArrowRight size={16} /></Link>
      </div>
    </Panel>
  </>;
}
