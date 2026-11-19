import { useState } from 'react';
import { Archive, CalendarClock, Download, FileJson, FileSpreadsheet, FileText, Mail, RefreshCcw, ShieldCheck, Timer } from 'lucide-react';
import { useSharedHistory } from '../../app/providers/SharedHistoryProvider';
import type { ReportDocument } from '../../core/domain/report';
import { limaDayKey, previousLimaDay } from '../../core/domain/report';
import { downloadReport, type ReportFormat } from '../../infrastructure/reports/reportDownloads';
import { Button } from '../../shared/components/Button';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { Spinner } from '../../shared/components/Spinner';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { Tabs } from '../../shared/components/Tabs';
import { RemoteConnectionPanel } from './RemoteConnectionPanel';
import { useAuth } from '../../app/providers/AuthProvider';
import { canGenerateReports } from '../../application/remote/accessPolicy';

const formatDate = (date: string) => new Date(date).toLocaleString('es-PE', { timeZone: 'America/Lima' });

/** Informes compartidos; Cron y los permisos de escritura permanecen en Supabase. */
export function ReportsPage() {
  const { role } = useAuth();
  const canGenerate = canGenerateReports(role);
  const shared = useSharedHistory();
  const [selectedDay, setSelectedDay] = useState(() => previousLimaDay(new Date()));
  const [type, setType] = useState<'all' | 'incident' | 'daily'>('all');
  const [message, setMessage] = useState('');
  const todayLima = limaDayKey(new Date());
  const reports = shared.reports.filter(report => type === 'all' || report.type === type);
  const dailyCount = shared.reports.filter(report => report.type === 'daily').length;
  const incidentCount = shared.reports.filter(report => report.type === 'incident').length;

  async function createDaily() {
    if (!canGenerate) return;
    try {
      if (selectedDay > todayLima) { setMessage('No puedes generar un informe de una fecha futura.'); return; }
      const created = await shared.generateDaily(selectedDay);
      setMessage(created ? `Resumen diario ${selectedDay} archivado en Supabase para todos los usuarios.` : 'Ya existía el informe compartido de ese día; no se duplicó.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo generar el reporte.'); }
  }
  async function exportFile(report: ReportDocument, format: ReportFormat) {
    try {
      if (!shared.reportsLoaded || shared.reportsError || shared.reportAuditError) throw new Error('La consulta remota debe estar disponible para auditar la descarga.');
      // Registrar ANTES de descargar, evitando descargas silenciosas si falla la auditoría.
      await shared.registerExport(report.key, format);
      downloadReport(report, format);
      setMessage(`${format} descargado para ${report.key}; acción registrada en Supabase.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo descargar el reporte.'); }
  }

  const columns: TableColumn<ReportDocument>[] = [
    { key: 'report', header: 'Reporte', render: report => <div className="max-w-[260px]"><strong className="text-xs">{report.title}</strong><p className="mt-1 text-[11px] text-[var(--muted)]">{report.key}</p></div> },
    { key: 'period', header: 'Periodo / generado', render: report => <div className="text-xs">{formatDate(report.period.start)}<p className="mt-1 text-[var(--muted)]">Generado {formatDate(report.generatedAt)}</p></div> },
    { key: 'stats', header: 'Incidentes', render: report => <div className="text-xs">{report.stats.total} total · {report.stats.critical} críticos<p className="mt-1 text-[var(--muted)]">{report.stats.closed} cerrados</p></div> },
    { key: 'status', header: 'Estado', render: () => <div><StatusBadge tone="success">Archivado en Supabase</StatusBadge><p className="mt-1 text-[11px] text-[var(--muted)]">El archivo no acredita entrega por correo</p></div> },
    { key: 'download', header: 'Descargas', render: report => <div className="flex flex-wrap gap-1.5">
      <Button size="sm" onClick={() => void exportFile(report, 'PDF')} aria-label={`Descargar PDF de ${report.key}`}><FileText size={14}/> PDF</Button>
      <Button size="sm" onClick={() => void exportFile(report, 'CSV')} aria-label={`Descargar CSV de ${report.key}`}><FileSpreadsheet size={14}/> CSV</Button>
      <Button size="sm" onClick={() => void exportFile(report, 'JSON')} aria-label={`Descargar JSON de ${report.key}`}><FileJson size={14}/> JSON</Button>
    </div> },
  ];
  const auditColumns: TableColumn<(typeof shared.reportAudit)[number]>[] = [
    { key: 'at', header: 'Hora local', render: row => <span className="text-xs">{formatDate(row.at)}</span> },
    { key: 'report', header: 'Reporte', render: row => <span className="text-xs">{row.report_key}</span> },
    { key: 'action', header: 'Acción', render: row => <span className="text-xs">{row.action === 'generated' ? 'Generación' : 'Descarga'}</span> },
    { key: 'details', header: 'Detalle', render: row => <span className="text-xs text-[var(--muted)]">{`${row.details} · ${row.actor}`}</span> },
  ];

  return <>
    <PageHeader title="Reportes y bandeja"
      description="Informes y auditoría compartidos en Supabase para todas las cuentas autorizadas. Los informes diarios por correo siguen siendo gestionados por Cron."
      actions={<Button onClick={() => void shared.refresh()}><RefreshCcw size={16}/> Actualizar</Button>}/>
    {!shared.reportsLoaded && !shared.reportsError && <div className="mb-4"><Spinner label="Consultando informes de todos los usuarios…"/></div>}
    {shared.reportsError && <p role="alert" className="mb-4 rounded-xl bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">Error consultando informes: {shared.reportsError}. {shared.reportsLoaded ? 'Datos anteriores; los cambios requieren conexión.' : 'No se presentan reportes locales como compartidos.'}</p>}
    {shared.reportAuditError && <p role="alert" className="mb-4 rounded-xl bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">La auditoría de reportes no está disponible: {shared.reportAuditError}. Los informes se consultan independientemente; la descarga requiere auditoría operativa.</p>}
    <section className="mb-5 grid gap-3 md:grid-cols-3" aria-label="Estadísticas de reportes">
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Archive size={16}/> Reportes archivados</p><p className="mt-2 text-2xl font-bold tabular-nums">{shared.reports.length}</p></Panel>
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16}/> Por incidente</p><p className="mt-2 text-2xl font-bold tabular-nums">{incidentCount}</p></Panel>
      <Panel className="p-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarClock size={16}/> Diarios</p><p className="mt-2 text-2xl font-bold tabular-nums">{dailyCount}</p></Panel>
    </section>
    {message && <p role="status" className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3 text-xs text-[var(--text)]">{message}</p>}
    <Tabs label="Secciones de reportes" items={[
      ...(canGenerate ? [{ id: 'operacion', label: 'Operación y sincronización', icon: Timer, content: (
        <>
          <div className="mb-5 grid gap-4 xl:grid-cols-2">
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Timer size={17}/> Simular cierre del día</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Cada cierre YOLO o revisado se archiva en el historial común. El resumen del día elegido se calcula en Supabase sobre todos los usuarios; si ya existe no se duplica.</p>
              <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Día de operación (Lima)
                <input className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5" type="date" max={todayLima} value={selectedDay} onChange={event => setSelectedDay(event.target.value)}/>
              </label><Button variant="primary" onClick={() => void createDaily()}><Download size={16}/> Generar resumen</Button></div>
            </Panel>
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Mail size={17}/> Envío al administrador</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">El envío diario a las 00:05 de Lima se administra en Supabase Cron. La bandeja compartida no demuestra por sí sola que un trabajo se envió: revisa la auditoría del servidor y el buzón.</p>
              <div className="mt-4"><StatusBadge tone="warning">Verificar ejecución de Cron</StatusBadge></div>
              <p className="mt-3 text-xs text-[var(--muted)]">La bandeja no afirma entregas. Al cerrar la pestaña no hay planificación local continua.</p>
            </Panel>
          </div>
          <RemoteConnectionPanel/>
        </>
      ) }] : []),
      { id: 'informes', label: 'Informes generados', icon: Archive, count: shared.reports.length, content: (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="text-sm font-bold">Informes generados</h2>
            <label className="text-xs">Tipo <select className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5" value={type} onChange={event => setType(event.target.value as typeof type)}>
              <option value="all">Todos</option><option value="incident">Por incidente</option><option value="daily">Diarios</option>
            </select></label>
          </div>
          <DataTable accessibleName="Bandeja de reportes" rows={reports} columns={columns} getRowKey={row => row.key} emptyMessage="Aún no hay reportes. Cierra un incidente YOLO o genera el resumen diario."/>
        </Panel>
      ) },
      { id: 'auditoria', label: 'Auditoría de reportes', icon: ShieldCheck, count: shared.reportAudit.length, content: (
        <Panel className="overflow-hidden">
          <div className="p-5"><h2 className="text-sm font-bold">Auditoría de reportes</h2></div>
          <DataTable accessibleName="Auditoría de reportes" rows={shared.reportAudit} columns={auditColumns} getRowKey={row => String(row.id)} emptyMessage="Todavía no se han generado o descargado reportes."/>
        </Panel>
      ) },
    ]}/>
    {!canGenerate && <p className="mt-4 text-xs text-[var(--muted)]">Vista compartida de solo lectura. Los informes contienen incidentes de todas las cuentas autorizadas.</p>}
    <p className="mt-4 text-xs text-[var(--muted)]">Persistencia: Supabase (compartida). Actualización periódica; sin imágenes ni vídeo. Los incidentes del informe son snapshots del momento de generación; su auditoría puede reflejar acciones posteriores.</p>
  </>;
}
