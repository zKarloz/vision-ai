import { describe, expect, it } from 'vitest';
import { isRecognizedRole, mayEnterProduct } from '../src/application/remote/accessPolicy';

/** Contratos para la puerta de entrada antes de habilitar RBAC en otra etapa. */
describe('VISION AI · acceso inicial', () => {
  it('solo deja ingresar a un administrador provisionado', () => {
    expect(mayEnterProduct('administrador')).toBe(true);
  });
  it('deniega cuentas sin membresía', () => {
    expect(mayEnterProduct(null)).toBe(false);
  });
  it.each(['operador', 'supervisor', 'auditor'] as const)('no concede acceso total todavía a %s', role => {
    expect(mayEnterProduct(role)).toBe(false);
  });
  it('rechaza un rol inyectado o desconocido', () => {
    expect(isRecognizedRole('root')).toBe(false);
    expect(isRecognizedRole('administrador')).toBe(true);
    expect(isRecognizedRole({ role: 'administrador' })).toBe(false);
  });
});
