import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, FileJson2, History, Moon, RotateCcw, Sun, Upload } from 'lucide-react';
import { useCameraRegistry } from '../../app/providers/CameraRegistryProvider';
import { useTheme } from '../../app/providers/ThemeProvider';
import { ConfigValidationError, validateConfig, type ConfigSnapshot } from '../../application/config/configSchema';
import type { ConfigAudit, ConfigVersion } from '../../infrastructure/config/VersionedLocalConfigRepository';
import { Button } from '../../shared/components/Button';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { StatusBadge } from '../../shared/components/StatusBadge';

const MAX_FILE_BYTES = 256 * 1024;
const field = 'w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm';

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Etapa 3: importación de configuración con validación previa, historial y reversión. */
export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { config, configState, importConfig, rollbackConfig, exportConfig } = useCameraRegistry();
  const [candidate, setCandidate] = useState<ConfigSnapshot | null>(null);
  const [filename, setFilename] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = configState.versions.find(v => v.number === configState.active)!;

  async function readFile(file?: File) {
    setIssues([]); setNotice(''); setCandidate(null); setFilename(file?.name ?? '');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) { setIssues(['Archivo: utiliza un fichero .json.']); return; }
    if (file.size > MAX_FILE_BYTES) { setIssues(['Archivo: supera el límite de 256 KiB.']); return; }
    try {
      const contents = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      const parsed: unknown = JSON.parse(contents);
      setCandidate(validateConfig(parsed));
    } catch (error) {
      if (error instanceof ConfigValidationError) setIssues(error.issues);
      else setIssues([error instanceof Error ? error.message : 'No se pudo leer la configuración.']);
    }
  }

  function confirmImport() {
    if (!candidate) return;
    try {
      const changed = importConfig(candidate);
      setNotice(changed ? 'Configuración aplicada íntegramente. Se publicó una nueva versión.' : 'Contenido ya activo: no se duplicó la versión.');
      setCandidate(null); setFilename(''); setIssues([]);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) { setIssues([error instanceof Error ? error.message : 'No se pudo guardar la configuración.']); }
  }

  function confirmRollback() {
    if (rollbackTarget === null) return;
    try {
      const changed = rollbackConfig(rollbackTarget);
      setNotice(changed ? `Se publicó una nueva versión con el contenido de v${rollbackTarget}.` : 'Esa configuración ya está activa.');
      setIssues([]);
    } catch (error) { setIssues([error instanceof Error ? error.message : 'No se pudo revertir la versión.']); }
    setRollbackTarget(null);
  }

  const versions: TableColumn<ConfigVersion>[] = [
    {key:'version', header:'Versión', render: v => <strong>v{v.number}{v.number === configState.active ? ' · activa' : ''}</strong>},
    {key:'action', header:'Origen', render: v => <span className="text-xs">{v.action}</span>},
    {key:'at', header:'Fecha', render: v => <span className="text-xs">{new Date(v.at).toLocaleString('es-PE')}</span>},
    {key:'count', header:'Registros', render: v => <span className="text-xs">{v.snapshot.cameras.length} cámaras · {v.snapshot.zones.length} zonas · {v.snapshot.rules.length} reglas</span>},
    {key:'restore', header:'Acción', render: v => <Button size="sm" disabled={v.number === configState.active} onClick={() => setRollbackTarget(v.number)}><RotateCcw size={14}/> Revertir</Button>},
  ];
  const audits: TableColumn<ConfigAudit>[] = [
    {key:'id', header:'#', render: entry => <span className="tabular-nums">{entry.id}</span>},
    {key:'at', header:'Cuándo', render: entry => <span className="text-xs">{new Date(entry.at).toLocaleString('es-PE')}</span>},
    {key:'action', header:'Acción', render: entry => <strong className="text-xs">{entry.action}</strong>},
    {key:'version', header:'Versión', render: entry => <span>v{entry.version}</span>},
    {key:'details', header:'Detalle', render: entry => <span className="text-xs text-[var(--muted)]">{entry.details}</span>},
  ];

  return <>
    <PageHeader title="Configuración y carga de datos"
      description="Importa y exporta cámaras, zonas y reglas. Las versiones se validan, publican íntegramente y pueden revertirse." />
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-bold"><Database size={18}/> Configuración activa</h2><p className="mt-1 text-xs text-[var(--muted)]">Persistencia local versionada · modo académico</p></div><StatusBadge tone="success"><CheckCircle2 size={12}/> v{active.number}</StatusBadge></div>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[['Cámaras', config.cameras.length], ['Zonas', config.zones.length], ['Reglas', config.rules.length]].map(([label, count]) => <div key={label} className="rounded-xl bg-[var(--muted-bg)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 text-xl font-extrabold tabular-nums">{count}</dd></div>)}
        </dl>
        <p className="mt-4 break-all text-[11px] text-[var(--muted)]">Huella de contenido FNV-1a (no criptográfica): <code>{active.checksum}</code></p>
        <div className="mt-5 flex flex-wrap gap-2"><Button variant="primary" onClick={() => downloadJson(`vision-ai-config-v${active.number}.json`, exportConfig())}><Download size={15}/> Exportar configuración</Button><a className="inline-flex items-center rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--muted-bg)]" href="/examples/vision-ai-config-valid.json" download>Ejemplo válido</a><a className="inline-flex items-center rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--muted-bg)]" href="/examples/vision-ai-config-invalid.json" download>Ejemplo inválido</a></div>
      </Panel>
      <Panel className="p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><Sun size={18}/> Apariencia</h2><p className="mt-1 text-xs text-[var(--muted)]">Tema claro predeterminado y oscuro en escala de grises.</p><div className="mt-5 flex flex-wrap gap-2"><Button variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}><Sun size={15}/> Claro</Button><Button variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}><Moon size={15}/> Oscuro</Button></div><p className="mt-5 text-xs leading-5 text-[var(--muted)]">Supabase no está conectado: esta versión guarda los datos localmente en tu navegador. La migración SQL incluida prepara el almacenamiento remoto, que requiere credenciales y autenticación.</p></Panel>
      <Panel className="p-5 xl:col-span-2"><h2 className="flex items-center gap-2 text-sm font-bold"><Upload size={18}/> Importar JSON</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">UTF-8, máximo 256 KiB. Se comprueban los tipos, identificadores únicos, referencias y polígonos. Una importación inválida no modifica la versión activa.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3"><input ref={fileInput} aria-label="Archivo de configuración JSON" className={field} type="file" accept=".json,application/json" onChange={e => {void readFile(e.target.files?.[0]);}} />{candidate && <Button variant="primary" onClick={confirmImport}><FileJson2 size={15}/> Confirmar importación</Button>}</div>
        {candidate && <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3 text-xs"><strong>Archivo validado:</strong> {filename} · {candidate.cameras.length} cámaras, {candidate.zones.length} zonas, {candidate.rules.length} reglas. Revisa antes de publicar.</div>}
        {issues.length > 0 && <div className="mt-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-4 text-xs text-[var(--danger)]" role="alert"><p className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle size={15}/> Se rechazó la carga</p><ul className="list-disc space-y-1 pl-4">{issues.slice(0, 20).map((message, index) => <li key={index}>{message}</li>)}</ul>{issues.length > 20 && <p>Y {issues.length-20} errores más.</p>}</div>}
        {notice && <p className="mt-3 rounded-lg bg-[var(--muted-bg)] p-3 text-xs" role="status">{notice}</p>}
      </Panel>
      <Panel className="overflow-hidden xl:col-span-2"><div className="border-b border-[var(--border)] p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><History size={18}/> Historial de versiones</h2><p className="mt-1 text-xs text-[var(--muted)]">Se conservan las últimas 20 versiones. Revertir crea una versión nueva y auditable.</p></div><DataTable accessibleName="Versiones de configuración" rows={[...configState.versions].reverse()} columns={versions} getRowKey={row => String(row.number)} emptyMessage="Aún no hay versiones." /></Panel>
      <Panel className="overflow-hidden xl:col-span-2"><div className="border-b border-[var(--border)] p-5"><h2 className="flex items-center gap-2 text-sm font-bold">Auditoría local</h2><p className="mt-1 text-xs text-[var(--muted)]">Identidad de prueba, no autenticada. Se conservan las últimas 100 acciones.</p></div><DataTable accessibleName="Auditoría de configuración" rows={[...configState.audit].reverse()} columns={audits} getRowKey={row => String(row.id)} emptyMessage="Aún no hay registros de auditoría." /></Panel>
    </div>
    <ConfirmDialog open={rollbackTarget !== null} title={`Revertir al contenido de v${rollbackTarget ?? ''}`}
      message="Se publicará una nueva versión con los datos seleccionados. Se conservará el historial anterior y se actualizarán cámaras y zonas de Monitoreo."
      onCancel={() => setRollbackTarget(null)} onConfirm={confirmRollback} confirmLabel="Revertir versión"/>
  </>;
}
