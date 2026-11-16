import { Activity, ArrowRight, ArrowUpRight, Camera, CheckCircle2, Cpu, Database, FileText, Layers3, RadioTower, ShieldCheck, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { summarizeCameras } from '../../core/domain/camera';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { AlarmStatusBar } from '../../shared/components/AlarmStatusBar';

const steps = [
  { title: 'Fuente de video', description: 'Cámara 3D, archivo o webcam', icon: Video },
  { title: 'Detección YOLO', description: 'Inferencia ONNX en Web Worker', icon: Cpu },
  { title: 'Dominio y reglas', description: 'Seguimiento, zonas, incidentes', icon: Layers3 },
  { title: 'Persistencia y reportes', description: 'Supabase y automatización futura', icon: Database },
];

/** Resumen real del registro local; evita inventar ocupación o incidentes. */
export function DashboardPage() {
  const { cameras } = useCameraRegistry();
  const summary = summarizeCameras(cameras);
  const metrics = [
    { label: 'Cámaras registradas', value: summary.total, icon: Camera, note: 'Configuración local' },
    { label: 'Registros habilitados', value: summary.enabled, icon: CheckCircle2, note: 'No equivale a conectado' },
    { label: 'Fuentes virtuales', value: summary.virtual, icon: Video, note: 'Perspectivas de una escena 3D' },
    { label: 'Otros tipos de fuente', value: summary.other, icon: RadioTower, note: 'MP4 y webcam disponibles' },
  ];
  return <>
    <PageHeader eyebrow="Panel principal · Etapa 5" title="Centro de control" description="Plataforma de monitoreo visual industrial. El visor 3D y el motor YOLO real ahora forman parte nativa de Monitoreo." actions={<Link to="/monitoreo" className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-text)] hover:opacity-90"><Activity size={17} />Abrir monitoreo 3D <ArrowUpRight size={15} /></Link>} />
    <AlarmStatusBar/>
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores del registro local">{metrics.map(({ label, value, icon: Icon, note }) => <Panel key={label} className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--muted)]">{label}</span><span className="rounded-xl bg-[var(--muted-bg)] p-2 text-[var(--accent)]"><Icon size={19} /></span></div><p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{note}</p></Panel>)}</section>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <Panel className="overflow-hidden">
        <div className="border-b border-[var(--border)] p-6"><div className="flex items-center justify-between gap-4"><div><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Arquitectura prioritaria</p><h2 className="text-lg font-bold">Del fotograma a la acción</h2></div><StatusBadge tone="success">YOLO real integrado</StatusBadge></div><p className="mt-2 text-sm text-[var(--muted)]">La detección se obtiene a partir de píxeles renderizados, no de las posiciones internas de Three.js.</p></div>
        <div className="grid gap-3 p-6 md:grid-cols-2">{steps.map(({ title, description, icon: Icon }, index) => <div key={title} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-card)] p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--muted-bg)] text-[var(--accent)]"><Icon size={18} /></span><div><p className="text-xs font-semibold"><span className="mr-1.5 text-[var(--muted)]">0{index + 1}</span>{title}</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p></div></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4"><p className="text-xs text-[var(--muted)]">Fuente de referencia: documento de arquitectura VISION AI v2.0</p><Link to="/monitoreo" className="inline-flex items-center gap-2 text-xs font-bold text-[var(--accent)] hover:underline">Ver monitoreo <ArrowRight size={14} /></Link></div>
      </Panel>
      <div className="space-y-5">
        <Panel className="p-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-[var(--muted-bg)] p-2.5 text-[var(--accent)]"><ShieldCheck size={22} /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Estado del proyecto</p><h2 className="text-lg font-bold">Etapa 4 en desarrollo</h2></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--muted-bg)]" aria-label="Etapa 4 en desarrollo, integración de fuentes y cámaras disponible"><div className="h-full w-[78%] rounded-full bg-[var(--primary)]" /></div><p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">Dominio de zonas, reglas e incidentes con pruebas. El visor analiza cámaras 3D configurables dentro de un mundo compartido; también admite video en bucle y webcam. Supabase y RTSP siguen pendientes.</p><Link to="/camaras" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline">Gestionar registro de cámaras <ArrowRight size={16} /></Link></Panel>
        <Panel className="p-6"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><FileText size={18} className="text-[var(--accent)]" /> Datos sin fabricar</div><p className="text-xs leading-6 text-[var(--muted)]">Las cifras del panel principal corresponden al registro de cámaras. Los incidentes en Monitoreo proceden de YOLO y aún no se sincronizan con una base de datos.</p></Panel>
      </div>
    </div>
  </>;
}
