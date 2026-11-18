import { useState } from 'react';
import { Archive, CalendarClock, Download, FileJson, FileSpreadsheet, FileText, Mail, ShieldCheck, Timer } from 'lucide-react';
import { useIncidentCenter } from '../../app/providers/IncidentCenterProvider';
import { useReportCenter } from '../../app/providers/ReportCenterProvider';
import type { ReportDocument } from '../../core/domain/report';
import { limaDayKey, previousLimaDay } from '../../core/domain/report';
import { downloadReport, type ReportFormat } from '../../infrastructure/reports/reportDownloads';
import { Button } from '../../shared/components/Button';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { Tabs } from '../../shared/components/Tabs';
import { RemoteConnectionPanel } from './RemoteConnectionPanel';

const formatDate = (date: string) => new Date(date).toLocaleString('es-PE', { timeZone: 'America/Lima' });

/** Bandeja local: el correo programado corre en Supabase, no en el navegador. */
export function ReportsPage() {
  const { state: incidentState } = useIncidentCenter();
  const { center, state } = useReportCenter();
  const [selectedDay, setSelectedDay] = useState(() => previousLimaDay(new Date()));
  const [type, setType] = useState<'all' | 'incident' | 'daily'>('all');
  const [message, setMessage] = useState('');
  const todayLima = limaDayKey(new Date());
  const reports = state.reports.filter(report => type === 'all' || report.type === type);
  const dailyCount = state.reports.filter(report => report.type === 'daily').length;
  const incidentCount = state.reports.filter(report => report.type === 'incident').length;

  function createDaily() {
    try {
      if (selectedDay > todayLima) { setMessage('No puedes generar un informe de una fecha futura.'); return; }
      const created = center.generateDay(selectedDay, incidentState.incidents, incidentState.audit);
      setMessage(created ? `Resumen diario ${selectedDay} generado en la bandeja local.` : 'Este día ya tiene un reporte archivado: no se duplicó.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo generar el reporte.'); }
  }
  function exportFile(report: ReportDocument, format: ReportFormat) {
    try { downloadReport(report, format); center.recordExport(report.key, format); setMessage(`${format} descargado para ${report.key}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo descargar el reporte.'); }
  }

  const columns: TableColumn<ReportDocument>[] = [
    { key: 'report', header: 'Reporte', render: report => <div className="max-w-[260px]"><strong className="text-xs">{report.title}</strong><p className="mt-1 text-[11px] text-[var(--muted)]">{report.key}</p></div> },
    { key: 'period', header: 'Periodo / generado', render: report => <div className="text-xs">{formatDate(report.period.start)}<p className="mt-1 text-[var(--muted)]">Generado {formatDate(report.generatedAt)}</p></div> },
    { key: 'stats', header: 'Incidentes', render: report => <div className="text-xs">{report.stats.total} total · {report.stats.critical} críticos<p className="mt-1 text-[var(--muted)]">{report.stats.closed} cerrados</p></div> },
    { key: 'status', header: 'Estado', render: () => <div><StatusBadge tone="success">Archivado</StatusBadge><p className="mt-1 text-[11px] text-[var(--muted)]">DEMO · sin correo</p></div> },
    { key: 'download', header: 'Descargas', render: report => <div className="flex flex-wrap gap-1.5">
      <Button size="sm" onClick={() => exportFile(report, 'PDF')} aria-label={`Descargar PDF de ${report.key}`}><FileText size={14}/> PDF</Button>
      <Button size="sm" onClick={() => exportFile(report, 'CSV')} aria-label={`Descargar CSV de ${report.key}`}><FileSpreadsheet size={14}/> CSV</Button>
      <Button size="sm" onClick={() => exportFile(report, 'JSON')} aria-label={`Descargar JSON de ${report.key}`}><FileJson size={14}/> JSON</Button>
    </div> },
  ];
  const auditColumns: TableColumn<(typeof state.audit)[number]>[] = [
    { key: 'at', header: 'Hora local', render: row => <span className="text-xs">{formatDate(row.at)}</span> },
    { key: 'report', header: 'Reporte', render: row => <span className="text-xs">{row.reportKey}</span> },
    { key: 'action', header: 'Acción', render: row => <span className="text-xs">{row.action === 'generated' ? 'Generación' : row.action === 'exported' ? 'Descarga' : 'Sin cambios'}</span> },
    { key: 'details', header: 'Detalle', render: row => <span className="text-xs text-[var(--muted)]">{row.detail}</span> },
  ];

  return <>
    <PageHeader title="Reportes y bandeja"
      description="Reportes PDF/CSV/JSON locales, sincronización automática de incidentes y envíos diarios gestionados por Supabase." />
    <section className="mb-5 grid gap-3 md:grid-cols-3" aria-label="Estadísticas de reportes">
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Archive size={16}/> Reportes archivados</p><p className="mt-2 text-2xl font-bold tabular-nums">{state.reports.length}</p></Panel>
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16}/> Por incidente</p><p className="mt-2 text-2xl font-bold tabular-nums">{incidentCount}</p></Panel>
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarClock size={16}/> Diarios</p><p className="mt-2 text-2xl font-bold tabular-nums">{dailyCount}</p></Panel>
    </section>
    {message && <p role="status" className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3 text-xs text-[var(--text)]">{message}</p>}
    <Tabs label="Secciones de reportes" items={[
      { id: 'operacion', label: 'Operación y sincronización', icon: Timer, content: (
        <>
          <div className="mb-5 grid gap-4 xl:grid-cols-2">
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Timer size={17}/> Simular cierre del día</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Se genera automáticamente un reporte por incidente cerrado. Al abrir la aplicación también se prepara el resumen del día anterior si tuvo incidentes. Para la defensa puedes generar cualquier día hasta hoy.</p>
              <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Día de operación (Lima)
                <input className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5" type="date" max={todayLima} value={selectedDay} onChange={event => setSelectedDay(event.target.value)}/>
              </label><Button variant="primary" onClick={createDaily}><Download size={16}/> Generar resumen</Button></div>
            </Panel>
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Mail size={17}/> Envío al administrador</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">El envío diario a las 00:05 de Lima se administra en Supabase Cron. La bandeja local no puede asegurar que un trabajo remoto se ejecutó: revisa la auditoría del servidor y el buzón.</p>
              <div className="mt-4"><StatusBadge tone="warning">Verificar ejecución de Cron</StatusBadge></div>
              <p className="mt-3 text-xs text-[var(--muted)]">La bandeja no afirma entregas. Al cerrar la pestaña no hay planificación local continua.</p>
            </Panel>
          </div>
          <RemoteConnectionPanel/>
        </>
      ) },
      { id: 'informes', label: 'Informes generados', icon: Archive, count: state.reports.length, content: (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="text-sm font-bold">Informes generados</h2>
            <label className="text-xs">Tipo <select className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5" value={type} onChange={event => setType(event.target.value as typeof type)}>
              <option value="all">Todos</option><option value="incident">Por incidente</option><option value="daily">Diarios</option>
            </select></label>
          </div>
          <DataTable accessibleName="Bandeja de reportes" rows={reports} columns={columns} getRowKey={row => row.key} emptyMessage="Aún no hay reportes. Cierra un incidente YOLO o genera el resumen diario."/>
        </Panel>
      ) },
      { id: 'auditoria', label: 'Auditoría de reportes', icon: ShieldCheck, count: state.audit.length, content: (
        <Panel className="overflow-hidden">
          <div className="p-5"><h2 className="text-sm font-bold">Auditoría de reportes</h2></div>
          <DataTable accessibleName="Auditoría de reportes" rows={state.audit} columns={auditColumns} getRowKey={row => String(row.id)} emptyMessage="Todavía no se han generado o descargado reportes."/>
        </Panel>
      ) },
    ]}/>
    <p className="mt-4 text-xs text-[var(--muted)]">Persistencia: {state.storageOk ? 'localStorage del navegador' : 'solo memoria, almacenamiento no disponible'}. Sin imágenes ni video; reportes y auditoría únicamente con datos estructurados.</p>
  </>;
}
