import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
const KEY = 'vision-3d-theme'; // Conserva la clave y la elección de quienes ya usan VISION AI.
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** Tema realmente aplicado (útil para componentes existentes y pantalla de acceso). */
  theme: Theme;
  /** Preferencia explícita, incluida la opción automática. */
  preference: ThemePreference;
  setTheme: (theme: Theme) => void;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}
const Context = createContext<ThemeContextValue | null>(null);

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

function initialPreference(): ThemePreference {
  try { return parseThemePreference(window.localStorage.getItem(KEY)); }
  catch { return 'light'; }
}

function systemPrefersDark(): boolean {
  try { return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches; }
  catch { return false; }
}

/** Sigue el tema del sistema en tiempo real sin sobrescribir la preferencia guardada. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(KEY, preference); }
    catch { /* Almacenamiento inhabilitado: la preferencia sigue viva en esta sesión. */ }
  }, [theme, preference]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme, preference, setPreference, setTheme: setPreference,
    // Alternar manualmente desde el login desactiva Automático intencionalmente.
    toggle: () => setPreference(theme === 'light' ? 'dark' : 'light'),
  }), [theme, preference]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('useTheme requiere ThemeProvider.');
  return value;
}
