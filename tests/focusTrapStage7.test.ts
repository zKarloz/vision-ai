import { describe, expect, it } from 'vitest';
import { wrappedFocusTarget } from '../src/shared/utils/focusTrap';

const items = ['cerrar', 'campo', 'guardar'];

describe('Etapa 7: contención accesible del foco', () => {
  it('Tab desde el último control regresa al primero', () => {
    expect(wrappedFocusTarget(items, 'guardar', false)).toBe('cerrar');
  });
  it('Shift+Tab desde el primer control regresa al último', () => {
    expect(wrappedFocusTarget(items, 'cerrar', true)).toBe('guardar');
  });
  it('no interfiere en una navegación intermedia', () => {
    expect(wrappedFocusTarget(items, 'campo', false)).toBeNull();
    expect(wrappedFocusTarget(items, 'campo', true)).toBeNull();
  });
  it('recupera el foco fugado fuera de un diálogo', () => {
    expect(wrappedFocusTarget(items, 'en otra ventana', false)).toBe('cerrar');
    expect(wrappedFocusTarget(items, 'en otra ventana', true)).toBe('guardar');
  });
  it('admite listas vacías y controles únicos sin errores', () => {
    expect(wrappedFocusTarget([], null, false)).toBeNull();
    expect(wrappedFocusTarget(['único'], 'único', false)).toBe('único');
    expect(wrappedFocusTarget(['único'], 'único', true)).toBe('único');
  });
});
