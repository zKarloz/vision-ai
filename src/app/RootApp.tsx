import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { CameraRegistryProvider } from './providers/CameraRegistryProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { IncidentCenterProvider } from './providers/IncidentCenterProvider';
import { ReportCenterProvider } from './providers/ReportCenterProvider';
import { RemoteSyncProvider } from './providers/RemoteSyncProvider';
import { AppShell } from './layout/AppShell';
import { AuthEntryPage } from '../modules/auth/AuthEntryPage';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { CamerasPage } from '../modules/cameras/CamerasPage';
import { Spinner } from '../shared/components/Spinner';
import { ZonesPage } from '../modules/zones/ZonesPage';
import { IncidentsPage } from '../modules/incidents/IncidentsPage';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { QualityPage } from '../modules/quality/QualityPage';

// El visor 3D y ONNX no se inicializan hasta entrar a Monitoreo con sesión autorizada.
const MonitoringPage = lazy(() => import('../modules/monitoring/MonitoringPage').then(module => ({ default: module.MonitoringPage })));

/** La autorización controla todas las rutas, incluso los enlaces directos. */
function AuthenticatedProduct() {
  const auth = useAuth();
  if (auth.status === 'checking') return <AuthEntryPage />;
  if (auth.status !== 'authorized' || !auth.session || auth.role !== 'administrador') {
    return <Routes>
      <Route path="login" element={<AuthEntryPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }
  // Montar los centros locales solo después de comprobar el acceso evita mostrar
  // historial, configuración y reportes antes de iniciar sesión.
  return <CameraRegistryProvider><IncidentCenterProvider><ReportCenterProvider><RemoteSyncProvider>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="camaras" element={<CamerasPage />} />
        <Route path="monitoreo" element={<Suspense fallback={<div className="grid min-h-96 place-items-center"><Spinner label="Preparando Monitoreo…" /></div>}><MonitoringPage /></Suspense>} />
        <Route path="zonas" element={<ZonesPage />} />
        <Route path="incidentes" element={<IncidentsPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="guia" element={<QualityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </RemoteSyncProvider></ReportCenterProvider></IncidentCenterProvider></CameraRegistryProvider>;
}

/** Inicio único del producto: autenticación obligatoria con Supabase. */
export function RootApp() {
  return <ThemeProvider><AuthProvider><BrowserRouter><AuthenticatedProduct /></BrowserRouter></AuthProvider></ThemeProvider>;
}
