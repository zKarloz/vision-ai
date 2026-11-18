import { remoteClient } from './client';
import type { MemberRole } from '../../application/remote/remotePayload';

/** Solo la Edge Function ve la clave secreta y la API de administración de Auth. */
export interface ManagedUser {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  lastSignInAt: string | null;
  passwordChangeRequired: boolean;
}

async function invokeUsers<T>(body: Record<string, unknown>): Promise<T> {
  if (!remoteClient) throw new Error('Supabase no está configurado.');
  const { data, error } = await remoteClient.functions.invoke('vision-manage-users', { body });
  if (error) {
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response) {
      const payload: unknown = await context.json().catch(() => null);
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        throw new Error(payload.error);
      }
    }
    throw new Error(error.message || 'La administración remota no respondió.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const response = await invokeUsers<{ users: ManagedUser[] }>({ action: 'list' });
  return response.users;
}

export async function createManagedUser(email: string, role: MemberRole): Promise<string> {
  const response = await invokeUsers<{ temporaryPassword: string }>({ action: 'create', email, role });
  if (!response.temporaryPassword) throw new Error('La cuenta fue creada, pero no se recibió la contraseña temporal.');
  return response.temporaryPassword;
}

export async function changeManagedUserRole(userId: string, role: MemberRole): Promise<void> {
  await invokeUsers({ action: 'set-role', userId, role });
}

/** Recuperación administrativa de una cuenta de prueba, sin exponer secretos. */
export async function resetManagedUserPassword(userId: string): Promise<{ temporaryPassword: string; auditWarning?: string }> {
  const response = await invokeUsers<{ temporaryPassword: string; auditWarning?: string }>({ action: 'reset-password', userId });
  if (!response.temporaryPassword) throw new Error('No se recibió una contraseña temporal nueva.');
  return response;
}

export async function changeFirstPassword(password: string): Promise<void> {
  await invokeUsers({ action: 'change-first-password', password });
}
