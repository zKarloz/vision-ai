import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, BellRing, Camera, ChevronDown, ChevronRight, Cloud, Layers3, LayoutDashboard, LogOut, Menu, Moon, Settings2, Shield, Sun, UserRound, X } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useIncidentCenter } from '../providers/IncidentCenterProvider';
import { useRemoteSync } from '../providers/RemoteSyncProvider';
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

const accountAction = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--muted-bg)] focus-visible:outline-2';

/** Shell operativo: navegación, cuenta y alarmas sin controles de desarrollo visibles. */
export function AppShell() {
  const { theme, toggle } = useTheme();
  const { session, role, signOut } = useAuth();
  const { state } = useIncidentCenter();
  const remote = useRemoteSync();
  const alarmCount = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated').length;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // El elemento semántico <aside> se tipa como HTMLElement en lib.dom.d.ts.
  const sidebarRef = useRef<HTMLElement | null>(null);
  const accountContainerRef = useRef<HTMLDivElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  // Cerrar menús después de navegar, incluso si la navegación se inicia desde un enlace.
  useEffect(() => { setMobileOpen(false); setAccountOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    const onDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); menuButtonRef.current?.focus(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onDialogKey);
    return () => document.removeEventListener('keydown', onDialogKey);
  }, [mobileOpen]);

  // El menú de cuenta admite Escape, clic fuera y navegación natural mediante Tab.
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountContainerRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAccountOpen(false); accountButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [accountOpen]);

  const page = nav.find(item => item.to === location.pathname)?.text ?? 'Resumen';
  const syncText = remote.busy ? 'Sincronizando…' : remote.error ? 'Error de sincronización' :
    remote.pendingCount > 0 ? `${remote.pendingCount} cambios pendientes` :
    remote.lastSyncedAt ? 'Sincronizado' : 'Pendiente de sincronizar';

  return <div className="min-h-screen bg-[var(--page)] text-[var(--text)]">
    <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--card)] focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[var(--text)]">Saltar al contenido principal</a>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Cerrar menú" onClick={() => { setMobileOpen(false); menuButtonRef.current?.focus(); }} />}
    <aside ref={sidebarRef} id="navegacion-lateral" aria-modal={mobileOpen || undefined} role={mobileOpen ? 'dialog' : undefined} aria-label={mobileOpen ? 'Menú de navegación' : undefined} className={cn('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] px-4 py-5 text-[var(--sidebar-text)] transition-transform lg:translate-x-0', mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible')}>
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-bg)] text-[var(--brand-fg)]"><Shield size={24} strokeWidth={2.5} /></div>
        <div><div className="text-lg font-extrabold tracking-[-0.06em]">VISION <span className="text-[var(--brand-highlight)]">AI</span></div><div className="text-[9px] font-bold uppercase tracking-[0.19em] text-[var(--sidebar-muted)]">Seguridad inteligente</div></div>
        <button ref={closeButtonRef} onClick={() => { setMobileOpen(false); menuButtonRef.current?.focus(); }} className="ml-auto rounded-lg p-2 text-[var(--sidebar-muted)] lg:hidden" aria-label="Cerrar menú"><X size={19} /></button>
      </div>
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.19em] text-[var(--sidebar-muted)]">Espacio de trabajo</div>
      <nav aria-label="Navegación principal" className="space-y-1">{nav.map(({ to, text, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors', isActive ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]' : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]')}><Icon size={18} /><span className="flex-1">{text}</span></NavLink>)}</nav>
      <div className="mt-auto border-t border-[var(--sidebar-border)] px-3 pt-4 text-[11px] text-[var(--sidebar-muted)]">VISION AI · v1.9.1</div>
    </aside>
    <div className="min-h-screen lg:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3 text-sm"><button ref={menuButtonRef} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="navegacion-lateral" className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="hidden text-[var(--muted)] sm:inline">Plataforma</span><ChevronRight className="hidden text-[var(--muted)] sm:inline" size={15} /><span className="font-semibold">{page}</span></div>
        <div ref={accountContainerRef} className="relative">
          <button ref={accountButtonRef} type="button" aria-label="Abrir menú de cuenta" aria-expanded={accountOpen} aria-controls="menu-cuenta" aria-haspopup="true" onClick={() => setAccountOpen(open => !open)} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 hover:bg-[var(--muted-bg)]">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-[var(--muted-bg)]"><UserRound size={18}/>{alarmCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" aria-hidden="true"/>}</span>
            <span className="hidden max-w-36 truncate text-xs font-semibold sm:block">{session?.user.email?.split('@')[0] ?? 'Cuenta'}</span><ChevronDown size={15} className="text-[var(--muted)]"/>
          </button>
          {accountOpen && <div id="menu-cuenta" role="group" aria-label="Opciones de cuenta" className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
            <div className="border-b border-[var(--border)] px-3 py-3"><div className="text-sm font-bold">Cuenta iniciada</div><div className="mt-1 break-all text-xs text-[var(--muted)]">{session?.user.email}</div><div className="mt-1 text-xs capitalize text-[var(--muted)]">{role ?? 'Sin rol'}</div></div>
            <Link to="/incidentes" className={accountAction} onClick={() => setAccountOpen(false)}><BellRing size={17}/><span className="flex-1">Notificaciones</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', alarmCount ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : 'bg-[var(--muted-bg)] text-[var(--muted)]')}>{alarmCount}</span></Link>
            <button type="button" className={accountAction} onClick={() => { toggle(); setAccountOpen(false); }}>{theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}<span>{theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}</span></button>
            <div className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]"><Cloud size={16}/><span role="status" className="flex-1">{syncText}</span></div>
            {remote.error && <Link to="/reportes" onClick={() => setAccountOpen(false)} className="block px-3 pb-2 text-xs text-[var(--danger)] hover:underline">Revisar sincronización</Link>}
            <button type="button" className={`${accountAction} border-t border-[var(--border)] text-[var(--danger)]`} onClick={() => { setAccountOpen(false); setSignOutError(''); void signOut().catch(cause => setSignOutError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.')); }}><LogOut size={17}/><span>Cerrar sesión</span></button>
          </div>}
        </div>
      </header>
      {signOutError && <p role="alert" className="px-5 py-2 text-xs text-[var(--danger)]">{signOutError}</p>}
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1600px] p-5 md:p-8"><Outlet /></main>
    </div>
  </div>;
}
