import type { MemberRole } from './remotePayload';

/** Matriz mínima de navegación basada en los casos de uso del PDF principal.
 * Esta matriz también se comprueba en las rutas: ocultar enlaces no autoriza acciones.
 * La autorización de datos remotos corresponde a Supabase RLS y Edge Functions.
 */
export type ProductModule = 'resumen' | 'camaras' | 'monitoreo' | 'zonas' | 'incidentes' | 'reportes' | 'configuracion' | 'usuarios';

const MODULE_ACCESS: Record<MemberRole, readonly ProductModule[]> = {
  administrador: ['resumen', 'camaras', 'monitoreo', 'zonas', 'incidentes', 'reportes', 'configuracion', 'usuarios'],
  operador: ['resumen', 'monitoreo', 'incidentes', 'configuracion'],
  supervisor: ['resumen', 'monitoreo', 'incidentes', 'configuracion'],
  auditor: ['resumen', 'incidentes', 'reportes', 'configuracion'],
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  administrador: 'Administrador', operador: 'Operador', supervisor: 'Supervisor', auditor: 'Auditor',
};

export function isRecognizedRole(value: unknown): value is MemberRole {
  return value === 'administrador' || value === 'supervisor' || value === 'operador' || value === 'auditor';
}

export function mayEnterProduct(role: MemberRole | null): boolean {
  return role !== null && isRecognizedRole(role);
}

export function canAccessModule(role: MemberRole | null, module: ProductModule): boolean {
  return role !== null && isRecognizedRole(role) && MODULE_ACCESS[role].includes(module);
}

export function canAcknowledgeIncident(role: MemberRole | null): boolean {
  return role === 'supervisor' || role === 'administrador';
}

/** Configuración personal es accesible a todos; la operativa sigue reservada. */
export function canManageConfiguration(role: MemberRole | null): boolean { return role === 'administrador'; }

export function canManageUsers(role: MemberRole | null): boolean { return role === 'administrador'; }
export function canGenerateReports(role: MemberRole | null): boolean { return role === 'administrador'; }
