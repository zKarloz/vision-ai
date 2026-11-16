import { describe, expect, it } from 'vitest';
import { openIncident, transitionIncident } from '../src/core/domain/incident';

const initial = openIncident({ id:'INC-0001',cameraId:'CAM-02',zoneId:'Z-02',ruleId:'R1', trackId:'17',
  severity:'high', source:'yolo',confidence:.91,openedAt:'2026-11-14T12:00:00Z' });

describe('Dominio: máquina de estados de incidente', () => {
  it('abre, reconoce y cierra un incidente con duración', () => {
    const acknowledged = transitionIncident(initial,{action:'acknowledge',by:'supervisor',at:'2026-11-14T12:00:02Z'});
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.acknowledgedBy).toBe('supervisor');
    const closed = transitionIncident(acknowledged,{action:'close',at:'2026-11-14T12:00:10Z'});
    expect(closed.status).toBe('closed');
    expect(closed.durationSec).toBe(10);
    expect(() => transitionIncident(closed,{action:'escalate',at:'2026-11-14T12:00:11Z'})).toThrow();
  });
  it('una pérdida de tracking NO cierra el incidente ni inventa salida', () => {
    const lost = transitionIncident(initial,{action:'tracking-lost',at:'2026-11-14T12:00:03Z'});
    expect(lost.status).toBe('open');
    expect(lost.closedAt).toBeUndefined();
    expect(lost.requiresReview).toBe(true);
  });
  it('no permite reconocimiento anónimo ni fechas anteriores a la apertura', () => {
    expect(() => transitionIncident(initial,{action:'acknowledge',by:'',at:'2026-11-14T12:00:05Z'})).toThrow();
    expect(() => transitionIncident(initial,{action:'close',at:'2026-11-14T11:59:00Z'})).toThrow();
  });
  it('escalar un incidente reconocido no está permitido', () => {
    const acknowledged = transitionIncident(initial,{action:'acknowledge',by:'supervisor',at:'2026-11-14T12:00:01Z'});
    expect(() => transitionIncident(acknowledged,{action:'escalate',at:'2026-11-14T12:00:02Z'})).toThrow();
  });
});
