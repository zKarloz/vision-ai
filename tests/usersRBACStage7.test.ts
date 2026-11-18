import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canAccessModule, canAcknowledgeIncident, canManageConfiguration, canManageUsers, mayEnterProduct } from '../src/application/remote/accessPolicy';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('VISION AI · usuarios y RBAC por módulo', () => {
  it('autoriza los cuatro roles reconocidos y deniega usuarios sin membresía', () => {
    expect(mayEnterProduct(null)).toBe(false);
    for (const role of ['administrador', 'supervisor', 'operador', 'auditor'] as const) {
      expect(mayEnterProduct(role)).toBe(true);
    }
  });
  it('Users es exclusivo de administradores', () => {
    expect(canManageUsers('administrador')).toBe(true);
    for (const role of ['operador', 'supervisor', 'auditor'] as const) {
      expect(canManageUsers(role)).toBe(false);
      expect(canAccessModule(role, 'usuarios')).toBe(false);
      expect(canAccessModule(role, 'configuracion')).toBe(true);
      expect(canManageConfiguration(role)).toBe(false);
    }
  });
  it('protege reconocimiento de incidentes', () => {
    expect(canAcknowledgeIncident('operador')).toBe(false);
    expect(canAcknowledgeIncident('auditor')).toBe(false);
    expect(canAcknowledgeIncident('supervisor')).toBe(true);
    expect(canAcknowledgeIncident('administrador')).toBe(true);
  });
  it('limita las pantallas del auditor a consulta', () => {
    expect(canAccessModule('auditor', 'incidentes')).toBe(true);
    expect(canAccessModule('auditor', 'reportes')).toBe(true);
    expect(canAccessModule('auditor', 'monitoreo')).toBe(false);
  });
  it('protege rutas por comprobación independiente del sidebar', () => {
    expect(source('src/app/RootApp.tsx')).toContain('function GuardedModule');
    expect(source('src/app/RootApp.tsx')).toContain('module="usuarios"');
  });
  it('el servidor exige JWT de usuario y rol desde PostgreSQL', () => {
    const edge = source('supabase/functions/vision-manage-users/index.ts');
    expect(edge).toContain("auth: 'user'");
    // Evita el 401 por consultar sub en userClaims: la identidad normalizada usa id.
    expect(edge).toContain('ctx.userClaims?.id');
    expect(edge).not.toContain('ctx.userClaims?.sub');
    expect(edge).toContain("member?.role !== 'administrador'");
    expect(edge).not.toContain('VITE_SUPABASE_SERVICE_ROLE');
  });
  it('impide cambiar el rol propio y crea contraseñas temporales', () => {
    const edge = source('supabase/functions/vision-manage-users/index.ts');
    expect(edge).toContain('body.userId === caller');
    expect(edge).toContain('crypto.randomUUID()');
    expect(edge).toContain('vision_ai_password_change_required');
  });
  it('registra cambios de roles bajo RLS, sin permiso de escritura pública', () => {
    const sql = source('supabase/migrations/20261117_user_management_rbac.sql');
    expect(sql).toContain('vision_ai_user_audit');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain("m.role = 'operador'");
    expect(sql).toContain("action in ('opened','closed','tracking-lost','escalated')");
  });
});
