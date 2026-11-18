import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { CameraRegistryProvider } from './providers/CameraRegistryProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { IncidentCenterProvider } from './providers/IncidentCenterProvider';
import { RemoteSyncProvider } from './providers/RemoteSyncProvider';
import { SharedHistoryProvider } from './providers/SharedHistoryProvider';
import { AccountStorageProvider } from './providers/AccountStorageProvider';
import { AppShell } from './layout/AppShell';
import { AuthEntryPage } from '../modules/auth/AuthEntryPage';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { CamerasPage } from '../modules/cameras/CamerasPage';
import { Spinner } from '../shared/components/Spinner';
import { canAccessModule, type ProductModule } from '../application/remote/accessPolicy';
import { UsersPage } from '../modules/users/UsersPage';
import { ZonesPage } from '../modules/zones/ZonesPage';
import { IncidentsPage } from '../modules/incidents/IncidentsPage';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { SettingsPage } from '../modules/settings/SettingsPage';

// El visor 3D y ONNX no se inicializan hasta entrar a Monitoreo con sesión autorizada.
const MonitoringPage = lazy(() => import('../modules/monitoring/MonitoringPage').then(module => ({ default: module.MonitoringPage })));

/** Control de rutas independiente del sidebar; una URL escrita a mano tampoco evade RBAC. */
function GuardedModule({ module, children }: { module: ProductModule; children: ReactNode }) {
  const { role } = useAuth();
  return canAccessModule(role, module) ? <>{children}</> : <Navigate to="/" replace />;
}

/** La autorización controla todas las rutas, incluso los enlaces directos. */
function AuthenticatedProduct() {
  const auth = useAuth();
  if (auth.status === 'checking') return <AuthEntryPage />;
  if (auth.status !== 'authorized' || !auth.session) {
    return <Routes>
      <Route path="login" element={<AuthEntryPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }
  // Montar los centros locales solo después de comprobar el acceso evita mostrar
  // historial, configuración y reportes antes de iniciar sesión.
  return <AccountStorageProvider key={auth.session.user.id} userId={auth.session.user.id}><CameraRegistryProvider><IncidentCenterProvider><RemoteSyncProvider><SharedHistoryProvider>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="camaras" element={<GuardedModule module="camaras"><CamerasPage /></GuardedModule>} />
        <Route path="monitoreo" element={<GuardedModule module="monitoreo"><Suspense fallback={<div className="grid min-h-96 place-items-center"><Spinner label="Preparando Monitoreo…" /></div>}><MonitoringPage /></Suspense></GuardedModule>} />
        <Route path="zonas" element={<GuardedModule module="zonas"><ZonesPage /></GuardedModule>} />
        <Route path="incidentes" element={<GuardedModule module="incidentes"><IncidentsPage /></GuardedModule>} />
        <Route path="reportes" element={<GuardedModule module="reportes"><ReportsPage /></GuardedModule>} />
        <Route path="usuarios" element={<GuardedModule module="usuarios"><UsersPage /></GuardedModule>} />
        <Route path="configuracion" element={<GuardedModule module="configuracion"><SettingsPage /></GuardedModule>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </SharedHistoryProvider></RemoteSyncProvider></IncidentCenterProvider></CameraRegistryProvider></AccountStorageProvider>;
}

/** Inicio único del producto: autenticación obligatoria con Supabase. */
export function RootApp() {
  return <ThemeProvider><AuthProvider><BrowserRouter><AuthenticatedProduct /></BrowserRouter></AuthProvider></ThemeProvider>;
}
