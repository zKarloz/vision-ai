import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canAccessModule, canManageConfiguration } from '../src/application/remote/accessPolicy';
import { displayNameForUser, normalizeDisplayName } from '../src/application/remote/profileDisplayName';
import { parseThemePreference, resolveTheme } from '../src/app/providers/ThemeProvider';

/** Regresiones del nombre visible sin tocar correo, membresía ni app_metadata. */
describe('Perfil de usuario editable', () => {
  it('muestra el correo solo como respaldo para cuentas anteriores', () => {
    expect(displayNameForUser({ email: 'nombre.usuario@ejemplo.com' })).toBe('nombre.usuario');
    expect(displayNameForUser(null)).toBe('Cuenta');
  });
  it('prefiere el nombre guardado en metadatos de Supabase Auth', () => {
    expect(displayNameForUser({ email: 'original@ejemplo.com', user_metadata: { vision_ai_display_name: 'Patricia' } })).toBe('Patricia');
  });
  it('normaliza espacios y rechaza nombres inválidos o caracteres de control', () => {
    expect(normalizeDisplayName('  María   López  ')).toBe('María López');
    expect(() => normalizeDisplayName('x')).toThrow();
    expect(() => normalizeDisplayName('a'.repeat(61))).toThrow();
    expect(() => normalizeDisplayName('Admin\u202Eext')).toThrow();
  });
  it('permite editar preferencias a todos, pero nunca controles operativos', () => {
    for (const role of ['operador', 'supervisor', 'auditor'] as const) {
      expect(canAccessModule(role, 'configuracion')).toBe(true);
      expect(canManageConfiguration(role)).toBe(false);
    }
    expect(canManageConfiguration('administrador')).toBe(true);
  });
  it('usa updateUser con metadatos del propio usuario, sin secretos ni SQL', () => {
    const auth = readFileSync(resolve(process.cwd(), 'src/app/providers/AuthProvider.tsx'), 'utf8');
    expect(auth).toContain('remoteClient.auth.updateUser');
    expect(auth).toContain('DISPLAY_NAME_METADATA_KEY');
    expect(auth).not.toContain('auth.admin.updateUserById');
  });
});

describe('Tema automático y compatibilidad con preferencias anteriores', () => {
  it('mantiene claro como valor predeterminado y conserva la opción oscura anterior', () => {
    expect(parseThemePreference(null)).toBe('light');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('valor-inválido')).toBe('light');
  });
  it('usa el esquema del sistema cuando se selecciona Automático', () => {
    expect(parseThemePreference('system')).toBe('system');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('suscribe la preferencia del sistema y la desuscribe al desmontar', () => {
    const provider = readFileSync(resolve(process.cwd(), 'src/app/providers/ThemeProvider.tsx'), 'utf8');
    expect(provider).toContain("(prefers-color-scheme: dark)");
    expect(provider).toContain("addEventListener('change'");
    expect(provider).toContain("removeEventListener('change'");
  });
  it('ofrece tres opciones en el menú de cuenta', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/app/layout/AppShell.tsx'), 'utf8');
    expect(shell).toContain("value: 'system'");
    expect(shell).toContain('aria-pressed={preference === value}');
  });
});
