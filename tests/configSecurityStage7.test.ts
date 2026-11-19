import { describe, expect, it } from 'vitest';
import { INITIAL_CAMERAS } from '../src/core/domain/camera';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import { ConfigValidationError, validateConfig } from '../src/application/config/configSchema';

/** Regresión de seguridad: rechazar colecciones grandes antes de analizarlas con Zod. */
describe('Bloque D · límites del importador de configuración', () => {
  const valid = () => ({
    schemaVersion: 1,
    cameras: INITIAL_CAMERAS,
    zones: [STARTER_RESTRICTED_ZONE],
    rules: [STARTER_PERSON_RULE],
  });

  it('mantiene el contrato de importación de la configuración inicial', () => {
    const result = validateConfig(valid());
    expect(result.cameras).toHaveLength(2);
    expect(result.zones).toHaveLength(1);
  });

  it('rechaza muchas cámaras sin procesar los objetos', () => {
    const cameras = Array.from({ length: 10_000 }, () => ({ unsupported: true }));
    expect(() => validateConfig({ ...valid(), cameras })).toThrow(ConfigValidationError);
    expect(() => validateConfig({ ...valid(), cameras })).toThrow(/cameras.*100/i);
  });

  it('rechaza demasiadas zonas y reglas antes de validaciones semánticas', () => {
    const zones = Array(251).fill({ polygon: 'inválido' });
    const rules = Array(501).fill({ classId: 'inválido' });
    expect(() => validateConfig({ ...valid(), zones })).toThrow(/zones.*250/i);
    expect(() => validateConfig({ ...valid(), rules })).toThrow(/rules.*500/i);
  });

  it('sigue rechazando referencias cruzadas inexistentes', () => {
    expect(() => validateConfig({
      ...valid(), rules: [{ ...STARTER_PERSON_RULE, zoneId: 'ZONA-NO-EXISTE' }],
    })).toThrow(/no existe/i);
  });
});
