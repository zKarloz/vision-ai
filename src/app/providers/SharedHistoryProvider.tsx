import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { useIncidentCenter } from './IncidentCenterProvider';
import { remoteClient, getInstallationId } from '../../infrastructure/supabase/client';
import {
  sharedIncidentFromRow, sharedAuditFromRow, sharedReportFromRow, settleSharedRows,
  type SharedIncidentRow, type SharedAuditRow, type SharedReportAuditRow, type SharedReportRow,
} from '../../application/remote/sharedHistory';
import type { CenterIncident, IncidentAuditEvent } from '../../application/incidents/IncidentCenter';
import type { ReportDocument } from '../../core/domain/report';

interface SharedHistoryState {
  /** El estado de Incidentes no depende de que Reportes tenga sus tablas instaladas. */
  loaded: boolean;
  loading: boolean;
  error: string;
  auditError: string;
  reportsLoaded: boolean;
  reportsError: string;
  reportAuditError: string;
  refreshedAt: string | null;
  incidents: CenterIncident[];
  audit: IncidentAuditEvent[];
  reports: ReportDocument[];
  reportAudit: SharedReportAuditRow[];
}
interface SharedHistoryContext extends SharedHistoryState {
  refresh: () => Promise<void>;
  actOnIncident: (id: string, action: 'acknowledge' | 'close', note?: string) => Promise<void>;
  generateDaily: (day: string) => Promise<boolean>;
  registerExport: (key: string, format: 'PDF' | 'CSV' | 'JSON') => Promise<void>;
}
const Context = createContext<SharedHistoryContext | null>(null);
const initial: SharedHistoryState = {
  loaded: false, loading: false, error: '', auditError: '',
  reportsLoaded: false, reportsError: '', reportAuditError: '', refreshedAt: null,
  incidents: [], audit: [], reports: [], reportAudit: [],
};

/** Lee tablas paginadas de Supabase, incluidas aquellas con más de mil registros. */
async function fetchAll<T>(table: 'vision_incidents' | 'vision_incident_audit' | 'vision_reports' | 'vision_report_audit',
  order: string): Promise<T[]> {
  if (!remoteClient) return [];
  const records: T[] = [];
  const batchSize = 500;
  for (let offset = 0; offset < 20000; offset += batchSize) {
    const { data, error } = await remoteClient.from(table).select('*')
      .order(order, { ascending: false }).range(offset, offset + batchSize - 1);
    if (error) throw new Error(`Historial compartido (${table}): ${error.message}`);
    const batch = (data ?? []) as T[];
    records.push(...batch);
    if (batch.length < batchSize) return records;
  }
  throw new Error(`El historial de ${table} excede 20 000 registros. Se requiere paginación remota.`);
}

/** Supabase conserva el historial global; el centro local solo guarda el seguimiento del sensor. */
export function SharedHistoryProvider({ children }: { children: ReactNode }) {
  const { session, role } = useAuth();
  const { center } = useIncidentCenter();
  const [history, setHistory] = useState<SharedHistoryState>(initial);
  const generation = useRef(0);
  const enabled = !!session && !!remoteClient && role !== null;

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !session) return;
    const current = ++generation.current;
    setHistory(before => ({ ...before, loading: true }));
    try {
      // Las cuatro consultas son INDEPENDIENTES: la ausencia de auditoría de
      // reportes no debe dejar en blanco los incidentes ya guardados en Supabase.
      const [incidentResult, auditResult, reportResult, reportAuditResult] = await Promise.allSettled([
        fetchAll<SharedIncidentRow>('vision_incidents', 'opened_at'),
        fetchAll<SharedAuditRow>('vision_incident_audit', 'at'),
        fetchAll<SharedReportRow>('vision_reports', 'generated_at'),
        fetchAll<SharedReportAuditRow>('vision_report_audit', 'at'),
      ]);
      if (current !== generation.current) return;

      const incidentSlice = settleSharedRows(incidentResult);
      const auditSlice = settleSharedRows(auditResult);
      const reportSlice = settleSharedRows(reportResult);
      const reportAuditSlice = settleSharedRows(reportAuditResult);

      const incidents = incidentSlice.rows?.map(sharedIncidentFromRow) ?? null;
      const cameras = new Map((incidents ?? []).map(incident => [incident.id, incident.cameraId]));
      const audit = auditSlice.rows?.map(action => sharedAuditFromRow(action, cameras.get(action.incident_id) ?? '—')) ?? null;
      const reports = reportSlice.rows?.map(row => sharedReportFromRow(row, audit ?? [])) ?? null;

      // Reconciliar únicamente los incidentes de ESTA cuenta e instalación.
      // Una caída de Reportes no afecta al reconocimiento remoto del sensor.
      if (incidentSlice.rows !== null) {
        try {
          const installation = getInstallationId();
          center.reconcileSharedDecisions(incidentSlice.rows.filter(row =>
            row.owner_id === session.user.id && row.installation_id === installation));
        } catch {
          // Un fallo del respaldo local no invalida incidentes recibidos de PostgreSQL.
        }
      }

      setHistory(before => ({
        ...before, loading: false,
        loaded: incidents !== null ? true : before.loaded,
        reportsLoaded: reports !== null ? true : before.reportsLoaded,
        error: incidentSlice.error,
        auditError: auditSlice.error,
        reportsError: reportSlice.error,
        reportAuditError: reportAuditSlice.error,
        refreshedAt: new Date().toISOString(),
        incidents: incidents ?? before.incidents,
        audit: audit ?? before.audit,
        reports: reports ?? before.reports,
        reportAudit: reportAuditSlice.rows ?? before.reportAudit,
      }));
    } catch (cause) {
      if (current !== generation.current) return;
      setHistory(before => ({ ...before, loading: false,
        error: cause instanceof Error ? cause.message : 'No fue posible procesar el historial de incidentes.' }));
    }
  }, [center, enabled, session?.user.id]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onUpdate = () => { if (document.visibilityState !== 'hidden' && navigator.onLine) void refresh(); };
    const interval = window.setInterval(onUpdate, 12_000);
    window.addEventListener('online', onUpdate);
    window.addEventListener('vision-ai:remote-changed', onUpdate);
    document.addEventListener('visibilitychange', onUpdate);
    return () => {
      generation.current++;
      window.clearInterval(interval);
      window.removeEventListener('online', onUpdate);
      window.removeEventListener('vision-ai:remote-changed', onUpdate);
      document.removeEventListener('visibilitychange', onUpdate);
    };
  }, [enabled, refresh]);

  const actOnIncident = async (id: string, action: 'acknowledge' | 'close', note = '') => {
    if (!remoteClient || !session || !['administrador', 'supervisor'].includes(role ?? '')) {
      throw new Error('Tu rol no permite gestionar incidentes.');
    }
    if (action === 'close' && note.trim().length < 10) throw new Error('La revisión requiere una nota de 10 caracteres como mínimo.');
    const { error } = await remoteClient.rpc('vision_act_on_incident', {
      p_incident_id: id, p_action: action, p_note: note.trim(),
    });
    if (error) {
      // El error PGRST202 señala una migración RPC ausente o el caché de esquema obsoleto.
      const missingRpc = error.code === 'PGRST202';
      throw new Error(missingRpc
        ? 'La función de reconocimiento no está disponible en Supabase. Comprueba la migración 20261118_shared_history_multiuser.sql y recarga el esquema de PostgREST.'
        : error.message);
    }
    await refresh();
  };

  const generateDaily = async (day: string): Promise<boolean> => {
    if (!remoteClient || role !== 'administrador') throw new Error('Solo el administrador puede generar reportes.');
    const { data, error } = await remoteClient.rpc('vision_generate_shared_daily_report', { p_day: day });
    if (error) throw new Error(error.message);
    await refresh();
    return data === true;
  };

  const registerExport = async (key: string, format: 'PDF' | 'CSV' | 'JSON') => {
    if (!remoteClient || !session) throw new Error('No hay una sesión activa.');
    const { error } = await remoteClient.rpc('vision_record_shared_report_export', {
      p_report_key: key, p_format: format,
    });
    if (error) throw new Error(error.message);
    await refresh();
  };

  return <Context.Provider value={{ ...history, refresh, actOnIncident, generateDaily, registerExport }}>{children}</Context.Provider>;
}

export function useSharedHistory() {
  const context = useContext(Context);
  if (!context) throw new Error('useSharedHistory requiere SharedHistoryProvider.');
  return context;
}
