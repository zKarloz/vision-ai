import { describe, expect, it } from 'vitest';
import { isRecognizedRole, mayEnterProduct, canAccessModule, canAcknowledgeIncident, canManageConfiguration, canManageUsers } from '../src/application/remote/accessPolicy';

/** El acceso de los cuatro roles se habilita solo en los módulos permitidos. */
describe('VISION AI · RBAC', () => {
  it.each(['administrador', 'operador', 'supervisor', 'auditor'] as const)('permite entrar con %s', role => {
    expect(mayEnterProduct(role)).toBe(true);
  });
  it('deniega cuentas sin membresía', () => expect(mayEnterProduct(null)).toBe(false));
  it('Usuarios y configuración operativa son exclusivos del administrador', () => {
    expect(canManageUsers('administrador')).toBe(true);
    expect(canManageConfiguration('administrador')).toBe(true);
    for (const role of ['operador', 'supervisor', 'auditor'] as const) {
      expect(canManageUsers(role)).toBe(false);
      expect(canAccessModule(role, 'usuarios')).toBe(false);
      expect(canAccessModule(role, 'configuracion')).toBe(true); // Preferencias propias.
      expect(canManageConfiguration(role)).toBe(false); // Sin control operativo.
      expect(canAccessModule(role, 'zonas')).toBe(false);
    }
  });
  it('solo supervisor y administrador reconocen incidentes', () => {
    expect(canAcknowledgeIncident('supervisor')).toBe(true);
    expect(canAcknowledgeIncident('administrador')).toBe(true);
    expect(canAcknowledgeIncident('operador')).toBe(false);
    expect(canAcknowledgeIncident('auditor')).toBe(false);
  });
  it('auditor consulta reportes sin monitorear', () => {
    expect(canAccessModule('auditor', 'reportes')).toBe(true);
    expect(canAccessModule('auditor', 'monitoreo')).toBe(false);
  });
  it('rechaza roles inyectados', () => {
    expect(isRecognizedRole('root')).toBe(false);
    expect(isRecognizedRole({ role: 'administrador' })).toBe(false);
  });
});
