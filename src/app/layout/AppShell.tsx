import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, BellRing, Camera, ChevronRight, CircleDot, Cpu, Layers3, LayoutDashboard, LogOut, Menu, Moon, Settings2, Shield, Sun, X } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useIncidentCenter } from '../providers/IncidentCenterProvider';
import { cn } from '../../shared/utils/cn';

const nav = [
  { to: '/', text: 'Resumen', icon: LayoutDashboard },
  { to: '/camaras', text: 'Cámaras', icon: Camera },
  { to: '/monitoreo', text: 'Monitoreo', icon: Activity },
  { to: '/zonas', text: 'Zonas y reglas', icon: Layers3 },
  { to: '/incidentes', text: 'Incidentes', icon: BellRing },
  { to: '/reportes', text: 'Reportes', icon: BarChart3 },
  { to: '/configuracion', text: 'Configuración', icon: Settings2 },
];

/** Navegación de producto: no renderiza WebGL ni carga ONNX fuera de Monitoreo. */
export function AppShell() {
  const { theme, toggle } = useTheme();
  const { session, role, signOut } = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const { state } = useIncidentCenter();
  const alarmCount = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated').length;
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const page = nav.find((item) => item.to === location.pathname)?.text ?? 'Resumen';
  return <div className="min-h-screen bg-[var(--page)] text-[var(--text)]">
    {mobileOpen && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] px-4 py-5 text-[var(--sidebar-text)] transition-transform lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-bg)] text-[var(--brand-fg)]"><Shield size={24} strokeWidth={2.5} /></div>
        <div><div className="text-lg font-extrabold tracking-[-0.06em]">VISION <span className="text-[var(--brand-highlight)]">AI</span></div><div className="text-[9px] font-bold uppercase tracking-[0.19em] text-[var(--sidebar-muted)]">Seguridad inteligente</div></div>
        <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-[var(--sidebar-muted)] lg:hidden" aria-label="Cerrar menú"><X size={19} /></button>
      </div>
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.19em] text-[var(--sidebar-muted)]">Espacio de trabajo</div>
      <nav aria-label="Navegación principal" className="space-y-1">{nav.map(({ to, text, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors', isActive ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]' : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]')}><Icon size={18} /><span className="flex-1">{text}</span></NavLink>)}</nav>
      <div className="mt-auto space-y-4">
        <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-soft)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Cpu size={16} />Motor de visión</div>
          <p className="text-[11px] leading-relaxed text-[var(--sidebar-muted)]">YOLOv8n real conectado al visor 3D de Monitoreo. Requiere descargar el modelo ONNX.</p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--sidebar-muted)]"><CircleDot size={12} /> Etapa 6 · Reportes</div>
        </div>
        <div className="flex items-center justify-between px-3 text-[10px] text-[var(--sidebar-muted)]"><span>VISION AI · v1.8.1</span><span>2026</span></div>
      </div>
    </aside>
    <div className="min-h-screen lg:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3 text-sm"><button aria-label="Abrir menú" className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="hidden text-[var(--muted)] sm:inline">Plataforma</span><ChevronRight className="hidden text-[var(--muted)] sm:inline" size={15} /><span className="font-semibold">{page}</span></div>
        <div className="flex items-center gap-3"><Link to="/incidentes" aria-label={`${alarmCount} alarmas pendientes`} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${alarmCount ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--muted-bg)] text-[var(--muted)]"}`}><BellRing size={16}/>{alarmCount}</Link><span className="hidden items-center gap-2 rounded-full bg-[var(--muted-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)] sm:flex"><CircleDot size={12} /> Entorno académico</span><button aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'} title="Cambiar tema" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--muted-bg)]">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--muted-bg)] text-xs font-bold" title={session?.user.email ?? 'Administrador'} aria-label={`Sesión ${role ?? 'autenticada'}`}>AD</div><button className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--muted-bg)]" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => { setSignOutError(''); void signOut().catch(cause => setSignOutError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.')); }}><LogOut size={17}/></button></div>
      </header>
      {signOutError && <p role="alert" className="px-5 py-2 text-xs text-[var(--danger)]">{signOutError}</p>}
      <main id="contenido" className="mx-auto w-full max-w-[1600px] p-5 md:p-8"><Outlet /></main>
    </div>
  </div>;
}
