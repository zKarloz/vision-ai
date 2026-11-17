import { Layers3, PencilRuler, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { polygonsFromConfig } from '../../application/config/cameraPolygons';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';

/** La edición visual se hace sobre fotogramas en Monitoreo; aquí se resume el dominio. */
export function ZonesPage() {
  const { cameras, config, configState } = useCameraRegistry();
  const zones = polygonsFromConfig(config.zones);
  const rule = config.rules.find(item => item.classId === 'person' && item.enabled);
  return <>
    <PageHeader title="Zonas y reglas"
      description="Polígonos normalizados sobre imágenes RGB, reglas independientes del modelo YOLO y configuración por perspectiva 3D." />
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Panel className="overflow-hidden">
        <div className="border-b border-[var(--border)] p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><Layers3 size={17}/> Zonas por cámara</h2><p className="mt-1 text-xs text-[var(--muted)]">Configuración validada · Versión {configState.active}</p></div>
        <div className="space-y-3 p-5">
          {cameras.filter(camera => camera.sourceType === 'virtual-3d').map(camera => {
            const id = camera.id;
            const source = cameras.find(camera => camera.id === id);
            const points = zones[id] ?? [];
            return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4" key={id}>
              <div><p className="text-sm font-semibold">{id} · {source?.name ?? 'Registro no disponible'}</p><p className="mt-1 text-xs text-[var(--muted)]">{points.length >= 3 ? `${points.length} vértices, área restringida en imagen` : 'Sin polígono activo'}</p></div>
              <div className="flex items-center gap-2">{points.length >= 3 ? <StatusBadge tone="warning">Restringida</StatusBadge> : <StatusBadge>Sin zona</StatusBadge>}
                <Link to={`/monitoreo?camera=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--muted-bg)]"><PencilRuler size={14}/> Editar en imagen</Link></div>
            </div>;
          })}
          <p className="text-[11px] leading-5 text-[var(--muted)]">Se mantiene una sola escena Three.js. Las zonas se definen por imagen de cámara y no se calculan desde las posiciones internas de los personajes. El editor está en Monitoreo.</p>
        </div>
      </Panel>
      <Panel className="p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><ShieldAlert size={17}/> Regla de intrusión</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">{rule?.name ?? 'No hay una regla de persona activa'}</p>
        <dl className="mt-5 space-y-3 text-xs">
          {[['Clase', 'Persona (YOLO COCO)'], ['Confianza mínima', `${(rule?.minConfidence ?? 0)*100} %`],
            ['Confirmación', `${rule?.minFrames ?? '—'} fotogramas consecutivos`],
            ['Histéresis de salida', `${rule?.exitFrames ?? '—'} observaciones fuera`],
            ['Cooldown', `${rule?.cooldownSec ?? '—'} segundos por seguimiento`],
            ['Severidad', rule?.severity ?? '—']].map(([label,value]) => <div key={label} className="flex justify-between gap-4 border-b border-[var(--border)] pb-2"><dt className="text-[var(--muted)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
        </dl>
        <p className="mt-5 text-[11px] leading-5 text-[var(--muted)]">Las reglas pueden importarse en Configuración. El editor completo y su gestión multiusuario se incorporarán posteriormente.</p>
      </Panel>
    </div>
  </>;
}
