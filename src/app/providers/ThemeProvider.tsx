import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'vision-3d-theme'; // Se conserva la preferencia visual del prototipo de Fase 0.

interface ThemeContextValue { theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void }
const Context = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* Preferencia no persistente. */ }
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme, toggle: () => setTheme((prev) => prev === 'light' ? 'dark' : 'light') }), [theme]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('useTheme requiere ThemeProvider.');
  return value;
}
