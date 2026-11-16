import { describe, expect, it } from 'vitest';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';
import type { VisionEvent } from '../src/domain/visualTracking';

const entry: VisionEvent = { id:1, trackId:17, cameraId:'CAM-02',type:'opened',atMs:1000,confidence:.91,source:'yolo' };
const when = '2026-11-14T12:00:00Z';

describe('Aplicación: eventos visuales confirmados -> incidentes', () => {
  it('abre un incidente YOLO sin duplicar aperturas', () => {
    const coordinator = new VisualIncidentCoordinator();
    coordinator.ingest([entry,entry],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    expect(coordinator.snapshot().incidents).toHaveLength(1);
    expect(coordinator.snapshot().incidents[0].source).toBe('yolo');
    expect(coordinator.snapshot().log).toHaveLength(1);
  });
  it('mantiene el incidente abierto al perder seguimiento', () => {
    const coordinator = new VisualIncidentCoordinator();
    coordinator.ingest([entry],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    coordinator.ingest([{...entry,id:2,type:'lost',atMs:1500}],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,'2026-11-14T12:00:01Z');
    const incident = coordinator.snapshot().incidents[0];
    expect(incident.status).toBe('open');
    expect(incident.requiresReview).toBe(true);
  });
  it('cierra solamente con salida confirmada por visión', () => {
    const coordinator = new VisualIncidentCoordinator();
    coordinator.ingest([entry],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    coordinator.ingest([{...entry,id:2,type:'left',atMs:1500}],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,'2026-11-14T12:00:06Z');
    expect(coordinator.snapshot().incidents[0].status).toBe('closed');
    expect(coordinator.snapshot().incidents[0].durationSec).toBe(6);
  });
  it('rechaza cámara ajena, confianza baja y ausencia de zona', () => {
    const coordinator = new VisualIncidentCoordinator();
    coordinator.ingest([{...entry,cameraId:'CAM-01'}],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    coordinator.ingest([{...entry,confidence:.01}],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    coordinator.ingest([{...entry,source:'demo'} as unknown as VisionEvent],STARTER_RESTRICTED_ZONE,STARTER_PERSON_RULE,when);
    coordinator.ingest([entry],null,STARTER_PERSON_RULE,when);
    expect(coordinator.snapshot().incidents).toHaveLength(0);
  });
});
