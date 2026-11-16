import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** URL y publishable key son públicas. Service role y Resend NUNCA se envían a Vite. */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const remoteConfigured = /^https:\/\//.test(url) && key.length > 10;
export const remoteClient: SupabaseClient | null = remoteConfigured
  ? createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })
  : null;

/** Identificador de navegador para evitar colisiones de IDs locales entre equipos. */
const INSTALLATION_KEY = 'vision-ai:remote-installation:v1';
export function getInstallationId(): string {
  const existing = window.localStorage.getItem(INSTALLATION_KEY);
  if (existing && /^[\da-f-]{36}$/i.test(existing)) return existing;
  const generated = crypto.randomUUID();
  window.localStorage.setItem(INSTALLATION_KEY, generated);
  return generated;
}
