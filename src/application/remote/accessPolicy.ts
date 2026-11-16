import type { MemberRole } from './remotePayload';

/**
 * Primera política de entrada: solo está provisionada la cuenta administradora.
 * Los demás roles existen en el dominio, pero NO se habilitarán hasta aprobar RBAC.
 * Esta comprobación mejora la UX; los permisos reales siguen protegidos por RLS.
 */
export function mayEnterProduct(role: MemberRole | null): boolean {
  return role === 'administrador';
}

/** Se comprueba la membresía en Supabase; una sesión sin rol no concede acceso. */
export function isRecognizedRole(value: unknown): value is MemberRole {
  return value === 'administrador' || value === 'supervisor' || value === 'operador' || value === 'auditor';
}
