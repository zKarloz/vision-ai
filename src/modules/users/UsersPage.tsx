import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, RefreshCcw, ShieldCheck, UserRoundPlus, UsersRound } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { ROLE_LABEL, canManageUsers } from '../../application/remote/accessPolicy';
import type { MemberRole } from '../../application/remote/remotePayload';
import { changeManagedUserRole, createManagedUser, listManagedUsers, resetManagedUserPassword, type ManagedUser } from '../../infrastructure/supabase/usersAdminApi';
import { Button } from '../../shared/components/Button';
import { DataTable, type TableColumn } from '../../shared/components/DataTable';
import { Modal } from '../../shared/components/Modal';
import { PageHeader } from '../../shared/components/PageHeader';
import { Panel } from '../../shared/components/Panel';
import { Spinner } from '../../shared/components/Spinner';

const options: MemberRole[] = ['operador', 'supervisor', 'auditor', 'administrador'];
const inputStyle = 'mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm text-[var(--text)]';
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('es-PE') : '—';

/** Módulo de alta y mantenimiento de cuentas: exclusivo del administrador. */
export function UsersPage() {
  const { session, role } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('operador');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState<MemberRole>('operador');
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setUsers(await listManagedUsers()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar usuarios.'); }
    finally { setLoading(false); setFirstLoad(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const password = await createManagedUser(email.trim(), newRole);
      setTemporaryPassword(password); setCreateOpen(false); setEmail(''); setCopied(false);
      await load();
      setMessage('Cuenta creada. Copia la contraseña temporal y entrégala por un canal privado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.'); }
    finally { setBusy(false); }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || editing.id === session?.user.id) return;
    setBusy(true); setError('');
    try { await changeManagedUserRole(editing.id, editRole); setEditing(null); await load(); setMessage('Rol actualizado. Los permisos del usuario se comprobarán desde Supabase.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo modificar el rol.'); }
    finally { setBusy(false); }
  }

  /** Genera una nueva clave temporal sin eliminar ni recrear el usuario. */
  async function resetPassword() {
    if (!resetTarget || resetTarget.id === session?.user.id) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await resetManagedUserPassword(resetTarget.id);
      setResetTarget(null);
      setTemporaryPassword(result.temporaryPassword);
      setCopied(false);
      await load();
      setMessage(result.auditWarning ?? 'Contraseña temporal restablecida. Entrégala de forma privada y exige su cambio en el siguiente ingreso.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo restablecer la contraseña.');
    } finally { setBusy(false); }
  }

  const filtered = users.filter(user => `${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()));
  const columns: TableColumn<ManagedUser>[] = [
    { key: 'email', header: 'Cuenta', render: user => <div className="max-w-72"><strong className="break-all text-xs">{user.email}</strong><div className="mt-1 text-[11px] text-[var(--muted)]">{user.id === session?.user.id ? 'Tu cuenta' : user.id.slice(0, 8)}</div></div> },
    { key: 'role', header: 'Rol', render: user => <span className="rounded-lg bg-[var(--muted-bg)] px-2.5 py-1 text-xs font-semibold">{ROLE_LABEL[user.role]}</span> },
    { key: 'status', header: 'Primer acceso', render: user => <span className="text-xs">{user.passwordChangeRequired ? 'Cambio de clave pendiente' : 'Habilitado'}</span> },
    { key: 'login', header: 'Último ingreso', render: user => <span className="text-xs">{formatDate(user.lastSignInAt)}</span> },
    { key: 'action', header: 'Acciones', render: user => <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={user.id === session?.user.id} onClick={() => { setEditing(user); setEditRole(user.role); setError(''); }}>Cambiar rol</Button>
      <Button size="sm" disabled={user.id === session?.user.id} onClick={() => { setResetTarget(user); setError(''); }}>Restablecer clave</Button>
    </div> },
  ];

  // El guard de ruta es otra barrera, pero el servidor vuelve a comprobar el rol.
  if (!canManageUsers(role)) return null;
  return <>
    <PageHeader title="Usuarios" description="Crea cuentas, asigna roles y controla qué módulos pueden utilizar. Las operaciones se verifican desde Supabase."
      actions={<Button variant="primary" onClick={() => { setCreateOpen(true); setError(''); }}><UserRoundPlus size={16}/> Agregar usuario</Button>}/>
    <section className="mb-5 grid gap-3 sm:grid-cols-3">
      <Panel className="p-4"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><UsersRound size={15}/> Cuentas registradas</p><p className="mt-2 text-2xl font-bold">{firstLoad ? '—' : users.length}</p></Panel>
      <Panel className="p-4"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={15}/> Administradores</p><p className="mt-2 text-2xl font-bold">{firstLoad ? '—' : users.filter(user => user.role === 'administrador').length}</p></Panel>
      <Panel className="p-4"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><UsersRound size={15}/> Otros roles</p><p className="mt-2 text-2xl font-bold">{firstLoad ? '—' : users.filter(user => user.role !== 'administrador').length}</p></Panel>
    </section>
    {error && <p className="mb-4 rounded-xl border border-[var(--danger)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
    {message && <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--muted-bg)] p-3 text-sm" role="status">{message}</p>}
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div><h2 className="text-sm font-bold">Directorio de usuarios</h2><p className="mt-1 text-xs text-[var(--muted)]">La contraseña no se guarda ni se muestra después del alta.</p></div>
        <div className="flex flex-wrap items-center gap-2"><input aria-label="Buscar usuarios" placeholder="Buscar por correo o rol…" value={search} onChange={event => setSearch(event.target.value)} className="w-60 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs"/>
          <Button size="sm" disabled={loading} onClick={() => void load()}>{loading ? <Spinner label="Actualizando…"/> : <><RefreshCcw size={14}/> Actualizar</>}</Button></div>
      </div>
      {firstLoad && loading ? <div className="grid min-h-60 place-items-center border-t border-[var(--border)] px-5 py-10"><Spinner label="Cargando usuarios desde Supabase…"/></div>
        : <DataTable accessibleName="Directorio de usuarios" rows={filtered} columns={columns} getRowKey={row => row.id} emptyMessage="No hay usuarios con estos filtros."/>}
    </Panel>
    <p className="mt-4 text-xs text-[var(--muted)]">La primera contraseña es temporal y debe cambiarse al iniciar sesión. El alta mediante contraseña temporal evita depender de SMTP y de un dominio propio.</p>
    <Modal title="Agregar usuario" description="El servidor crea una contraseña temporal aleatoria y asigna la membresía indicada." open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }}>
      <form className="space-y-4" onSubmit={event => void create(event)}>
        <label className="block text-xs font-semibold">Correo electrónico
          <input className={inputStyle} type="email" autoComplete="off" required maxLength={254} placeholder="usuario@empresa.com" value={email} onChange={event => setEmail(event.target.value)}/></label>
        <label className="block text-xs font-semibold">Rol inicial
          <select className={inputStyle} value={newRole} onChange={event => setNewRole(event.target.value as MemberRole)}>{options.map(option => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}</select></label>
        <p className="rounded-xl bg-[var(--muted-bg)] p-3 text-xs text-[var(--muted)]">Confirma que administras este correo. Supabase marcará la dirección como confirmada al crear la cuenta para permitir acceso sin servicio de invitaciones.</p>
        <div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !email} variant="primary">{busy ? 'Creando…' : 'Crear cuenta'}</Button></div>
      </form>
    </Modal>
    <Modal title="Contraseña temporal — mostrar una vez" description="Cópiala ahora. Al cerrar este diálogo no podrás recuperarla desde VISION AI." open={Boolean(temporaryPassword)} onClose={() => { setTemporaryPassword(''); setCopied(false); }}>
      <div className="space-y-4"><p className="break-all rounded-xl bg-[var(--muted-bg)] p-4 font-mono text-sm font-semibold" role="status">{temporaryPassword}</p>
        <p className="text-xs text-[var(--muted)]">Transmite la contraseña por un canal privado. El usuario deberá cambiarla durante su primer inicio de sesión.</p>
        <div className="flex justify-end gap-2"><Button onClick={() => void navigator.clipboard.writeText(temporaryPassword).then(() => setCopied(true)).catch(() => setError('No se pudo copiar; selecciona la contraseña manualmente.'))}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copiada' : 'Copiar'}</Button>
          <Button variant="primary" onClick={() => { setTemporaryPassword(''); setCopied(false); }}>Entendido</Button></div>
      </div>
    </Modal>
    <Modal title="Restablecer contraseña temporal" description="Esta acción reemplazará la contraseña actual. No elimina al usuario ni cambia su rol." open={Boolean(resetTarget)} onClose={() => { if (!busy) setResetTarget(null); }}>
      <div className="space-y-4">
        <p className="break-all text-sm font-semibold">{resetTarget?.email}</p>
        <p className="text-sm text-[var(--muted)]">La contraseña nueva se mostrará una sola vez. El usuario deberá cambiarla en su siguiente acceso.</p>
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={() => setResetTarget(null)}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={() => void resetPassword()}>{busy ? 'Restableciendo…' : 'Confirmar restablecimiento'}</Button>
        </div>
      </div>
    </Modal>
    <Modal title="Cambiar rol" description="El cambio se aplica en Supabase. No puedes cambiar el rol de tu propia cuenta." open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="space-y-4" onSubmit={event => void saveRole(event)}><p className="break-all text-sm font-semibold">{editing?.email}</p>
        <label className="block text-xs font-semibold">Nuevo rol<select className={inputStyle} value={editRole} onChange={event => setEditRole(event.target.value as MemberRole)}>{options.map(option => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}</select></label>
        <div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy || editing?.role === editRole}>{busy ? 'Guardando…' : 'Confirmar cambio'}</Button></div>
      </form>
    </Modal>
  </>;
}
