import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Monitor, Moon, Save, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { useTheme, type ThemePreference } from '../../app/providers/ThemeProvider';
import { normalizeDisplayName } from '../../application/remote/profileDisplayName';
import { Button } from '../../shared/components/Button';
import { Panel } from '../../shared/components/Panel';

/** Preferencias personales disponibles para los cuatro roles; no afectan permisos RBAC. */
export function ProfileSettingsPanel() {
  const { displayName, session, updateDisplayName } = useAuth();
  const [candidate, setCandidate] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setCandidate(displayName);
    setNotice('');
    setError('');
  }, [displayName, session?.user.id]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    setSaving(true);
    try {
      const normalized = normalizeDisplayName(candidate);
      await updateDisplayName(normalized);
      setCandidate(normalized);
      setNotice('Nombre visible actualizado en tu cuenta.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar tu nombre.');
    } finally { setSaving(false); }
  }

  return <Panel className="p-5">
    <h2 className="flex items-center gap-2 text-sm font-bold"><UserRound size={18}/> Perfil de usuario</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">El nombre se mostrará en la esquina superior derecha. Se guarda en tu cuenta de Supabase, no cambia tu correo ni tu rol.</p>
    <form onSubmit={event => { void onSave(event); }} className="mt-5 space-y-4">
      <label htmlFor="nombre-visible" className="block text-xs font-semibold">Nombre visible
        <input id="nombre-visible" name="displayName" type="text" autoComplete="nickname"
          minLength={2} maxLength={60} required value={candidate}
          onChange={event => { setCandidate(event.target.value); setError(''); setNotice(''); }}
          className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm"
          placeholder="Cómo quieres que aparezca tu nombre" />
      </label>
      <p className="break-all text-[11px] text-[var(--muted)]">Correo de acceso: {session?.user.email ?? 'Sin correo'}</p>
      {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 text-xs text-[var(--success)]"><CheckCircle2 size={15}/>{notice}</p>}
      <Button type="submit" variant="primary" disabled={saving || !candidate.trim() || candidate.trim().replace(/\s+/gu, ' ') === displayName}>
        <Save size={15}/>{saving ? 'Guardando…' : 'Guardar nombre'}
      </Button>
    </form>
  </Panel>;
}

const choices: { value: ThemePreference; text: string; icon: typeof Sun }[] = [
  { value: 'light', text: 'Claro', icon: Sun },
  { value: 'dark', text: 'Oscuro', icon: Moon },
  { value: 'system', text: 'Automático', icon: Monitor },
];

/** Apariencia local: Automático responde a los cambios de Windows/macOS/navegador. */
export function AppearanceSettingsPanel() {
  const { preference, theme, setPreference } = useTheme();
  return <Panel className="p-5">
    <h2 className="flex items-center gap-2 text-sm font-bold"><Sun size={18}/> Apariencia</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Claro, oscuro en escala de grises o automático según el tema del sistema.</p>
    <div role="group" aria-label="Preferencia de apariencia" className="mt-5 flex flex-wrap gap-2">
      {choices.map(({ value, text, icon: Icon }) => <Button key={value} variant={preference === value ? 'primary' : 'secondary'}
        aria-pressed={preference === value} onClick={() => setPreference(value)}><Icon size={15}/>{text}</Button>)}
    </div>
    {preference === 'system' && <p role="status" className="mt-3 text-xs text-[var(--muted)]">Automático activo · actualmente se muestra el tema {theme === 'dark' ? 'oscuro' : 'claro'}.</p>}
  </Panel>;
}
