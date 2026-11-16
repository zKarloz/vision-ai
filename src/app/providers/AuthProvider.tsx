import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isRecognizedRole, mayEnterProduct } from '../../application/remote/accessPolicy';
import type { MemberRole } from '../../application/remote/remotePayload';
import { remoteClient, remoteConfigured } from '../../infrastructure/supabase/client';

export type AuthStatus = 'unconfigured' | 'checking' | 'signed-out' | 'authorized' | 'forbidden' | 'error';

interface AuthContextValue {
  configured: boolean;
  status: AuthStatus;
  session: Session | null;
  role: MemberRole | null;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}
const Context = createContext<AuthContextValue | null>(null);

/**
 * La sesión de Supabase es la puerta de entrada a VISION AI.
 * No se confía en localStorage como prueba de identidad: getUser() consulta Auth,
 * y el rol se lee desde una tabla protegida por RLS. Sin membresía no hay app.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [status, setStatus] = useState<AuthStatus>(remoteConfigured ? 'checking' : 'unconfigured');
  const [error, setError] = useState('');
  const [verificationRequest, setVerificationRequest] = useState(0);
  const lastSessionKey = useRef<string | null>(null);

  useEffect(() => {
    if (!remoteClient) return;
    const client = remoteClient;
    let active = true;
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      const key = nextSession ? `${nextSession.user.id}:${nextSession.access_token}` : null;
      // Supabase puede emitir SIGNED_IN al recuperar el foco de la pestaña.
      // No invalidar el acceso si la identidad y el token no han cambiado.
      if (key === lastSessionKey.current) return;
      lastSessionKey.current = key;
      setSession(nextSession);
      setRole(null);
      setStatus(nextSession ? 'checking' : 'signed-out');
      setError('');
    });
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) { setError(authError.message); setStatus('error'); return; }
      lastSessionKey.current = data.session ? `${data.session.user.id}:${data.session.access_token}` : null;
      setSession(data.session);
      if (!data.session) setStatus('signed-out');
    }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : 'No se pudo restaurar la sesión.'); setStatus('error'); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session || !remoteClient) return;
    const client = remoteClient;
    let active = true;
    const expectedUserId = session.user.id;
    setStatus('checking');
    setRole(null);
    void (async () => {
      try {
        // getUser autentica el JWT en el servidor; getSession por sí solo lee el caché.
        const { data: identity, error: identityError } = await client.auth.getUser();
        if (identityError || !identity.user || identity.user.id !== expectedUserId) {
          throw new Error(identityError?.message ?? 'No se pudo verificar la identidad.');
        }
        const { data, error: membershipError } = await client.from('vision_ai_members')
          .select('role').eq('user_id', expectedUserId).maybeSingle();
        if (membershipError) throw new Error(`Error al consultar tu rol: ${membershipError.message}`);
        if (!active) return;
        const memberRole = isRecognizedRole(data?.role) ? data.role : null;
        setRole(memberRole);
        setError('');
        setStatus(mayEnterProduct(memberRole) ? 'authorized' : 'forbidden');
      } catch (cause) {
        if (!active) return;
        setRole(null);
        setError(cause instanceof Error ? cause.message : 'No se pudo verificar el acceso.');
        setStatus('error');
      }
    })();
    return () => { active = false; };
  }, [session?.access_token, session?.user.id, verificationRequest]);

  async function signIn(email: string, password: string): Promise<void> {
    if (!remoteClient) throw new Error('Configura Supabase antes de iniciar sesión.');
    setError('');
    const { data, error: authError } = await remoteClient.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError(authError.message); throw new Error(authError.message); }
    // El evento de Auth también actualiza la sesión; aquí no concedemos acceso todavía.
    setSession(data.session);
  }

  async function signOut(): Promise<void> {
    if (!remoteClient) return;
    setError('');
    const { error: authError } = await remoteClient.auth.signOut();
    if (authError) { setError(authError.message); throw new Error(authError.message); }
    setRole(null);
    setSession(null);
    setStatus('signed-out');
  }

  async function retry(): Promise<void> {
    if (!remoteClient) return;
    setStatus('checking'); setError('');
    const { data, error: authError } = await remoteClient.auth.getSession();
    if (authError) { setError(authError.message); setStatus('error'); return; }
    if (!data.session) { setSession(null); setStatus('signed-out'); return; }
    setSession(data.session);
    setVerificationRequest(current => current + 1);
  }

  return <Context.Provider value={{ configured: remoteConfigured, status, session, role, error, signIn, signOut, retry }}>
    {children}
  </Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('useAuth requiere AuthProvider.');
  return context;
}
