/** Nombre público decorativo: NUNCA se utiliza para decidir roles ni permisos. */
export const DISPLAY_NAME_METADATA_KEY = 'vision_ai_display_name';

interface DisplayIdentity {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Valida antes de enviar datos del usuario a Supabase Auth. */
export function normalizeDisplayName(input: string): string {
  if (/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(input)) {
    throw new Error('El nombre no puede contener caracteres de control.');
  }
  const name = input.trim().replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 60) {
    throw new Error('El nombre visible debe tener entre 2 y 60 caracteres.');
  }
  return name;
}

/** Lee solo la propiedad de perfil esperada; conserva el alias del correo como respaldo. */
export function displayNameForUser(user: DisplayIdentity | null | undefined): string {
  const saved = user?.user_metadata?.[DISPLAY_NAME_METADATA_KEY];
  if (typeof saved === 'string') {
    try { return normalizeDisplayName(saved); } catch { /* Metadato inválido: respaldo seguro. */ }
  }
  return user?.email?.split('@')[0]?.trim() || 'Cuenta';
}
