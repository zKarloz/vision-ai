import { describe, expect, it } from 'vitest';
import { RuleEngine } from '../src/core/domain/ruleEngine';
import { STARTER_PERSON_RULE } from '../src/core/domain/zone';

const observation = { cameraId: 'CAM-02', zoneId: STARTER_PERSON_RULE.zoneId,
  trackId: '17', classId: 'person' as const, confidence: 0.81 };

describe('Dominio: reglas anti falsas alarmas', () => {
  it('descarta observaciones de otra clase, confianza baja o regla deshabilitada', () => {
    const engine = new RuleEngine();
    expect(engine.shouldRaise(STARTER_PERSON_RULE,{...observation, confidence:0.19},1000)).toBe(false);
    expect(engine.shouldRaise(STARTER_PERSON_RULE,{...observation,classId:'cone'},1000)).toBe(false);
    expect(engine.shouldRaise({...STARTER_PERSON_RULE, enabled:false},observation,1000)).toBe(false);
  });
  it('emite una vez durante el cooldown y luego acepta una nueva entrada', () => {
    const engine = new RuleEngine();
    expect(engine.shouldRaise(STARTER_PERSON_RULE,observation,1000)).toBe(true);
    expect(engine.shouldRaise(STARTER_PERSON_RULE,observation,1100)).toBe(false);
    expect(engine.shouldRaise(STARTER_PERSON_RULE,observation,6100)).toBe(true);
  });
  it('aísla el cooldown entre cámara, zona y track', () => {
    const engine = new RuleEngine();
    expect(engine.shouldRaise(STARTER_PERSON_RULE,observation,1000)).toBe(true);
    expect(engine.shouldRaise(STARTER_PERSON_RULE,{...observation, trackId:'18'},1100)).toBe(true);
    expect(engine.shouldRaise(STARTER_PERSON_RULE,{...observation, cameraId:'CAM-01'},1100)).toBe(true);
  });
});
