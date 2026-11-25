import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, BellRing, Camera, Check, ChevronDown, ChevronRight, Cloud, Layers3, LayoutDashboard, LogOut, Menu, Monitor, Moon, Settings2, Shield, Sun, UserRound, UsersRound, X } from 'lucide-react';
import { useTheme, type ThemePreference } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useIncidentCenter } from '../providers/IncidentCenterProvider';
import { useRemoteSync } from '../providers/RemoteSyncProvider';
import { cn } from '../../shared/utils/cn';
import { wrappedFocusTarget } from '../../shared/utils/focusTrap';
import { canAccessModule, type ProductModule } from '../../application/remote/accessPolicy';

const nav: { to: string; text: string; icon: typeof LayoutDashboard; module: ProductModule }[] = [
  { to: '/', text: 'Resumen', icon: LayoutDashboard, module: 'resumen' },
  { to: '/camaras', module: 'camaras', text: 'Cámaras', icon: Camera },
  { to: '/monitoreo', module: 'monitoreo', text: 'Monitoreo', icon: Activity },
  { to: '/zonas', module: 'zonas', text: 'Zonas y reglas', icon: Layers3 },
  { to: '/incidentes', module: 'incidentes', text: 'Incidentes', icon: BellRing },
  { to: '/reportes', module: 'reportes', text: 'Reportes', icon: BarChart3 },
  { to: '/usuarios', module: 'usuarios', text: 'Usuarios', icon: UsersRound },
  { to: '/configuracion', module: 'configuracion', text: 'Configuración', icon: Settings2 },
];

const accountAction = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--muted-bg)] focus-visible:outline-2';

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Automático', icon: Monitor },
];

/** Shell operativo: navegación, cuenta y alarmas sin controles de desarrollo visibles. */
export function AppShell() {
  const { preference, setPreference } = useTheme();
  const { session, role, displayName, signOut } = useAuth();
  const { state } = useIncidentCenter();
  const remote = useRemoteSync();
  const alarmCount = state.incidents.filter(item => item.status === 'open' || item.status === 'escalated').length;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Conserva el panel montado al cerrar para que pueda completar la animación de salida.
  const [accountMounted, setAccountMounted] = useState(false);
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
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = wrappedFocusTarget(focusable, focused, event.shiftKey);
      if (target) { event.preventDefault(); target.focus(); }
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

  const visibleNav = nav.filter(item => canAccessModule(role, item.module));
  const page = visibleNav.find(item => item.to === location.pathname)?.text ?? 'Resumen';
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
      <nav aria-label="Navegación principal" className="space-y-1">{visibleNav.map(({ to, text, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors', isActive ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]' : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]')}><Icon size={18} /><span className="flex-1">{text}</span></NavLink>)}</nav>
      <div className="mt-auto border-t border-[var(--sidebar-border)] px-3 pt-4 text-[11px] text-[var(--sidebar-muted)]">VISION AI · v1.9.6</div>
    </aside>
    <div className="min-h-screen min-w-0 max-w-full lg:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3 text-sm"><button ref={menuButtonRef} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="navegacion-lateral" className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="hidden text-[var(--muted)] sm:inline">Plataforma</span><ChevronRight className="hidden text-[var(--muted)] sm:inline" size={15} /><span className="font-semibold">{page}</span></div>
        <div ref={accountContainerRef} className="relative">
          <button ref={accountButtonRef} type="button" aria-label="Abrir menú de cuenta" aria-expanded={accountOpen} aria-controls={accountMounted ? 'menu-cuenta' : undefined} aria-haspopup="true" onClick={() => {
              if (!accountOpen) setAccountMounted(true);
              setAccountOpen(open => !open);
            }} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 hover:bg-[var(--muted-bg)]">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-[var(--muted-bg)]"><UserRound size={18}/>{alarmCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" aria-hidden="true"/>}</span>
            <span className="hidden max-w-36 truncate text-xs font-semibold sm:block" title={displayName}>{displayName}</span><ChevronDown size={15} className="text-[var(--muted)]"/>
          </button>
          {accountMounted && <div id="menu-cuenta" role="group" aria-label="Opciones de cuenta"
            aria-hidden={!accountOpen} inert={!accountOpen}
            onAnimationEnd={event => {
              // Solo desmontamos al acabar la salida del propio panel, no de sus hijos.
              if (event.target === event.currentTarget && !accountOpen) setAccountMounted(false);
            }}
            className={cn('absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-1.5rem))] origin-top-right rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl',
              accountOpen ? 'account-menu-enter' : 'account-menu-exit')}>

            <div className="border-b border-[var(--border)] px-3 py-3"><div className="truncate text-sm font-bold">{displayName}</div><div className="mt-1 break-all text-xs text-[var(--muted)]">{session?.user.email}</div><div className="mt-1 text-xs capitalize text-[var(--muted)]">{role ?? 'Sin rol'}</div></div>
            <Link to="/incidentes" className={accountAction} onClick={() => setAccountOpen(false)}><BellRing size={17}/><span className="flex-1">Notificaciones</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', alarmCount ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : 'bg-[var(--muted-bg)] text-[var(--muted)]')}>{alarmCount}</span></Link>
            <div className="border-t border-[var(--border)] px-3 py-3">
              <p className="text-xs font-semibold text-[var(--text)]">Tema de la interfaz</p>
              <div role="group" aria-label="Tema de la interfaz" className="mt-2 grid grid-cols-3 gap-1.5">
                {themeOptions.map(({ value, label, icon: Icon }) => <button key={value} type="button"
                  aria-pressed={preference === value} onClick={() => setPreference(value)}
                  className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                    preference === value ? 'border-[var(--text)] bg-[var(--muted-bg)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--muted-bg)]')}>
                  <span className="relative"><Icon size={17}/>{preference === value && <Check size={10} className="absolute -right-3 -top-1" aria-hidden="true"/>}</span>
                  <span>{label}</span>
                </button>)}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]"><Cloud size={16}/><span role="status" className="flex-1">{syncText}</span></div>
            {remote.error && canAccessModule(role, 'reportes') && <Link to="/reportes" onClick={() => setAccountOpen(false)} className="block px-3 pb-2 text-xs text-[var(--danger)] hover:underline">Revisar sincronización</Link>}
            <button type="button" className={`${accountAction} border-t border-[var(--border)] text-[var(--danger)]`} onClick={() => { setAccountOpen(false); setSignOutError(''); void signOut().catch(cause => setSignOutError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.')); }}><LogOut size={17}/><span>Cerrar sesión</span></button>
          </div>}
        </div>
      </header>
      {signOutError && <p role="alert" className="px-5 py-2 text-xs text-[var(--danger)]">{signOutError}</p>}
      <main id="contenido" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-[1600px] p-5 md:p-8"><Outlet /></main>
    </div>
  </div>;
}
