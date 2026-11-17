/**
 * Calcula el siguiente destino cuando Tab intenta salir de un diálogo.
 * No cambia el foco por sí mismo: se comparte entre modal y menú móvil.
 * Si el foco escapó por código externo, lo devuelve al extremo adecuado.
 */
export function wrappedFocusTarget<T>(
  focusable: readonly T[],
  active: T | null,
  backwards: boolean,
): T | null {
  if (!focusable.length) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!focusable.includes(active as T)) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
