import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ReportCenter } from '../../application/reports/ReportCenter';
import { useIncidentCenter } from './IncidentCenterProvider';
import { useAccountStorage } from './AccountStorageProvider';

const Context = createContext<ReportCenter | null>(null);

/** Bandeja global: se actualiza con cierres YOLO incluso fuera de la ruta Reportes. */
export function ReportCenterProvider({ children }: { children: ReactNode }) {
  const { state: incidentState } = useIncidentCenter();
  const storage = useAccountStorage();
  const [center] = useState(() => new ReportCenter(storage));

  useEffect(() => {
    center.syncClosedIncidents(incidentState);
    center.generatePreviousDayIfNeeded(incidentState);
  }, [center, incidentState]);

  useEffect(() => {
    // Simula el fin de día solo con la aplicación abierta; NO envía correos.
    const interval = window.setInterval(() => center.generatePreviousDayIfNeeded(incidentState), 60_000);
    return () => window.clearInterval(interval);
  }, [center, incidentState]);

  return <Context.Provider value={center}>{children}</Context.Provider>;
}

export function useReportCenter() {
  const center = useContext(Context);
  if (!center) throw new Error('useReportCenter requiere ReportCenterProvider.');
  const state = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  return { center, state };
}
