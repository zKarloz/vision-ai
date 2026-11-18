import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn, Moon, RefreshCcw, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { useTheme } from '../../app/providers/ThemeProvider';
import { Button } from '../../shared/components/Button';
import { Spinner } from '../../shared/components/Spinner';

/** Pantalla pública única. Ni el sidebar ni el monitor se montan antes de autorizar. */
export function AuthEntryPage() {
  const auth = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [firstPassword, setFirstPassword] = useState('');
  const [firstPasswordConfirm, setFirstPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true); setFormError('');
    try { await auth.signIn(email, password); setPassword(''); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); }
    finally { setWorking(false); }
  }

  async function logout() {
    setLeaving(true);
    try { await auth.signOut(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.'); }
    finally { setLeaving(false); }
  }

  const loading = auth.status === 'checking';
  const forbidden = auth.status === 'forbidden';
  const unconfigured = auth.status === 'unconfigured';
  const statusError = auth.status === 'error';
  const firstPasswordRequired = auth.status === 'password-change-required';

  async function completePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError('');
    if (firstPassword.length < 12 || firstPassword !== firstPasswordConfirm) {
      setPasswordError('Usa al menos 12 caracteres y confirma la misma contraseña.');
      return;
    }
    setChangingPassword(true);
    try {
      await auth.completeFirstPassword(firstPassword);
      setFirstPassword(''); setFirstPasswordConfirm('');
      setPasswordChanged(true);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'No fue posible guardar la contraseña.';
      setPasswordError(detail.includes('no necesita cambiar')
        ? 'La contraseña ya se cambió. Cierra sesión e ingresa con tu contraseña personal.'
        : detail);
    } finally { setChangingPassword(false); }
  }

  return <div className="flex min-h-screen flex-col bg-[var(--page)] text-[var(--text)]">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-text)]"><ShieldCheck size={22}/></div>
        <span className="font-extrabold tracking-tight">VISION AI</span></div>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--card)]" onClick={toggle}
        aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button>
    </header>
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 pb-16 pt-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-xl lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between gap-12 bg-[var(--sidebar)] p-8 text-[var(--sidebar-text)] md:p-10">
          <div><span className="rounded-full border border-[var(--sidebar-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--sidebar-muted)]">Acceso seguro</span>
            <h1 className="mt-8 text-3xl font-extrabold tracking-tight md:text-4xl">Monitoreo visual inteligente.</h1>
            <p className="mt-5 text-sm leading-7 text-[var(--sidebar-muted)]">Cámaras, detección YOLO, zonas de seguridad, incidentes y reportes en una sola plataforma.</p></div>
          <div className="flex items-center gap-2 text-xs text-[var(--sidebar-muted)]"><LockKeyhole size={15}/> Acceso mediante Supabase Auth</div>
        </section>
        <section className="flex min-h-[395px] flex-col justify-center px-7 py-10 md:px-12">
          {loading ? <div role="status" className="space-y-3"><h2 className="text-xl font-bold">Verificando acceso</h2><Spinner label="Comprobando sesión y rol en Supabase…"/></div>
          : unconfigured ? <div className="space-y-3"><h2 className="text-xl font-bold">Falta configurar Supabase</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">Añade VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia Vite. La aplicación no abre sin autenticación.</p></div>
          : forbidden ? <div className="space-y-4"><h2 className="text-xl font-bold">Acceso aún no habilitado</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">Tu cuenta todavía no tiene una membresía válida. Solicita acceso a un administrador.</p>
            <p className="break-all text-xs text-[var(--muted)]">{auth.session?.user.email ?? ''}</p>
            <Button onClick={() => void logout()} disabled={leaving}>{leaving ? 'Saliendo…' : 'Cerrar sesión'}</Button></div>
          : statusError ? <div className="space-y-4"><h2 className="text-xl font-bold">No se pudo verificar el acceso</h2>
            <p role="alert" className="text-sm text-[var(--danger)]">{auth.error}</p>
            <div className="flex flex-wrap gap-2"><Button onClick={() => void auth.retry()}><RefreshCcw size={16}/> Reintentar</Button>
              <Button onClick={() => void logout()} disabled={leaving}>Cerrar sesión</Button></div></div>
          : firstPasswordRequired ? <form onSubmit={completePassword} className="space-y-5">
            <div><h2 className="text-xl font-bold">Establecer contraseña personal</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">El administrador creó tu cuenta con una clave temporal. Para continuar debes establecer una nueva contraseña de al menos 12 caracteres.</p></div>
            <label className="block text-sm font-semibold">Nueva contraseña
              <input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={firstPassword} onChange={event => setFirstPassword(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-4 py-3" />
            </label>
            <label className="block text-sm font-semibold">Confirmar nueva contraseña
              <input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={firstPasswordConfirm} onChange={event => setFirstPasswordConfirm(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-4 py-3" />
            </label>
            {passwordError && <p role="alert" className="text-xs text-[var(--danger)]">{passwordError}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={changingPassword || !firstPassword}>{changingPassword ? 'Guardando…' : 'Guardar y entrar'}</Button>
              <Button onClick={() => void logout()} disabled={changingPassword || leaving}>Cerrar sesión</Button></div>
          </form>
          : <form onSubmit={submit} className="space-y-5">
            {passwordChanged && <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3 text-sm">Tu nueva contraseña se guardó. Inicia sesión con ella si es necesario.</p>}
            <div><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--muted-bg)]"><KeyRound size={22}/></div>
              <h2 className="text-2xl font-extrabold tracking-tight">Iniciar sesión</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">Ingresa con la cuenta asignada por el administrador de VISION AI.</p></div>
            <label className="block text-sm font-semibold">Correo electrónico
              <input autoComplete="username" name="email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com" className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 text-sm"/></label>
            <label className="block text-sm font-semibold">Contraseña
              <div className="relative mt-2"><input autoComplete="current-password" name="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 pr-12 text-sm"/>
                <button type="button" className="absolute inset-y-0 right-2 grid w-9 place-items-center text-[var(--muted)]" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
            <Button type="submit" variant="primary" className="w-full" disabled={working || !email || !password}>
              <LogIn size={17}/>{working ? 'Ingresando…' : 'Entrar a VISION AI'}</Button>
            {(formError || auth.error) && <p role="alert" className="text-sm text-[var(--danger)]">{formError || auth.error}</p>}
            <p className="text-xs leading-5 text-[var(--muted)]">Las cuentas las gestiona el administrador de VISION AI. El registro público no está habilitado desde esta pantalla.</p>
          </form>}
        </section>
      </div>
    </main>
    <footer className="pb-6 text-center text-xs text-[var(--muted)]">VISION AI · Sistema de monitoreo visual</footer>
  </div>;
}
