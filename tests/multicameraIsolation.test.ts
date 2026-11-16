import { describe, expect, it } from 'vitest';
import type { Detection } from '../src/core/types/vision';
import { VisualZoneMonitor } from '../src/domain/visualTracking';
import { VisualIncidentCoordinator } from '../src/application/incidents/VisualIncidentCoordinator';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../src/core/domain/zone';

const zoneA = {
  ...STARTER_RESTRICTED_ZONE, id: 'Z-VIS-CAM-01', cameraId: 'CAM-01',
  polygon: [{x:.2,y:.3},{x:.9,y:.3},{x:.9,y:.9},{x:.2,y:.9}],
};
const zoneB = { ...zoneA, id: 'Z-VIS-CAM-02', cameraId: 'CAM-02' };
const sample: Detection = { classId: 0, label: 'persona', confidence: .85,
  box: {x:.4,y:.4,width:.2,height:.4} };

describe('aislamiento entre cámaras en un solo Worker YOLO', () => {
  it('mantiene dos tracks con ID local y dos incidentes con cámara diferente', () => {
    const first = new VisualZoneMonitor();
    const second = new VisualZoneMonitor();
    const coordinator = new VisualIncidentCoordinator();
    const ruleA = { ...STARTER_PERSON_RULE, id: 'R-A', zoneId: zoneA.id };
    const ruleB = { ...STARTER_PERSON_RULE, id: 'R-B', zoneId: zoneB.id };
    for (let frame = 1; frame <= 3; frame++) {
      const t = frame * 300;
      const a = first.step('CAM-01', [sample], zoneA, t);
      const b = second.step('CAM-02', [sample], zoneB, t + 150);
      coordinator.ingest(a.events, zoneA, ruleA, '2026-11-14T12:00:00Z');
      coordinator.ingest(b.events, zoneB, ruleB, '2026-11-14T12:00:01Z');
    }
    const incidents = coordinator.snapshot().incidents;
    expect(incidents).toHaveLength(2);
    expect(incidents.map(i => i.cameraId).sort()).toEqual(['CAM-01', 'CAM-02']);
    expect(incidents.every(i => i.source === 'yolo')).toBe(true);
    expect(incidents.every(i => i.trackId === '1')).toBe(true);
  });
});
