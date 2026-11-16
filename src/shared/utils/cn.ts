/** Une clases de Tailwind sin añadir dependencias externas. */
export function cn(...values: Array<string | false | undefined | null>): string {
  return values.filter(Boolean).join(' ');
}
