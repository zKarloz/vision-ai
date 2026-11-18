import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/** Regresiones del primer acceso; no se usan contraseñas ni servicios reales. */
describe('Recuperación de contraseñas en VISION AI', () => {
  const edge = read('supabase/functions/vision-manage-users/index.ts');
  it('verifica el JWT y el rol admin antes de restablecer una cuenta', () => {
    expect(edge).toContain("auth: 'user'");
    expect(edge).toContain('ctx.userClaims?.id');
    expect(edge.indexOf("member?.role !== 'administrador'")).toBeLessThan(edge.indexOf("body.action === 'reset-password'"));
  });
  it('no permite restablecer la clave propia desde gestión de usuarios', () => {
    expect(edge).toContain('if (body.userId === caller)');
  });
  it('reinicia la obligatoriedad de cambiar clave y audita el restablecimiento', () => {
    expect(edge).toContain('vision_ai_password_change_required: true');
    expect(edge).toContain("action: 'password_reset'");
    expect(read('supabase/migrations/20261118_user_password_recovery.sql')).toContain("'password_reset'");
  });
  it('presenta una clave temporal solo al administrador', () => {
    const ui = read('src/modules/users/UsersPage.tsx');
    expect(ui).toContain('Restablecer contraseña temporal');
    expect(ui).toContain('resetManagedUserPassword');
    expect(ui).toContain('setTemporaryPassword(result.temporaryPassword)');
  });
  it('distingue guardar la clave de renovar la sesión', () => {
    const auth = read('src/app/providers/AuthProvider.tsx');
    expect(auth.indexOf('await changeFirstPassword(password)')).toBeLessThan(auth.indexOf('await remoteClient.auth.refreshSession()'));
    expect(auth).toContain("signOut({ scope: 'local' })");
    expect(read('src/modules/auth/AuthEntryPage.tsx')).toContain('Tu nueva contraseña se guardó.');
  });
});
