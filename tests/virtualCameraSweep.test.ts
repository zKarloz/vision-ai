import { describe, expect, it } from 'vitest';
import { NEW_VIRTUAL_POSE, dollyVirtualPose, orbitVirtualPose, sweepPoseAt, validateVirtualCameraPose, validateVirtualCameraSweep } from '../src/core/domain/virtualCameraPose';
import { validateCameraDraft } from '../src/core/domain/camera';
import { validateConfig } from '../src/application/config/configSchema';
import { INITIAL_CAMERAS } from '../src/core/domain/camera';

const sweep = { mode: 'sweep' as const, amplitudeDeg: 25, periodSec: 12 };

describe('Etapa 4 · editor visual y barrido', () => {
  it('orbita sin perder el punto de interés y permite zoom', () => {
    const moved = orbitVirtualPose(NEW_VIRTUAL_POSE, 10, 3);
    expect(moved).not.toEqual(NEW_VIRTUAL_POSE);
    expect([moved.targetX, moved.targetY, moved.targetZ]).toEqual([NEW_VIRTUAL_POSE.targetX, NEW_VIRTUAL_POSE.targetY, NEW_VIRTUAL_POSE.targetZ]);
    expect(validateVirtualCameraPose(moved)).toEqual([]);
    expect(validateVirtualCameraPose(dollyVirtualPose(moved, 0.9))).toEqual([]);
  });
  it('oscila alrededor del encuadre central y vuelve a él cada ciclo', () => {
    expect(sweepPoseAt(NEW_VIRTUAL_POSE, sweep, 0)).toEqual(NEW_VIRTUAL_POSE);
    expect(sweepPoseAt(NEW_VIRTUAL_POSE, sweep, 12).targetX).toBeCloseTo(NEW_VIRTUAL_POSE.targetX, 8);
    expect(sweepPoseAt(NEW_VIRTUAL_POSE, sweep, 3).targetX).not.toBeCloseTo(sweepPoseAt(NEW_VIRTUAL_POSE, sweep, 9).targetX, 5);
  });
  it('no permite ángulos ni velocidad fuera de rango', () => {
    expect(validateVirtualCameraSweep({ ...sweep, amplitudeDeg: 99 })).not.toHaveLength(0);
    expect(validateVirtualCameraSweep({ ...sweep, periodSec: 2 })).not.toHaveLength(0);
  });
  it('valida barrido como configuración de cámara 3D y rechaza fuente externa', () => {
    const draft = { name:'Barrido almacén', location:'Almacén norte', sourceType:'virtual-3d' as const, enabled:true, virtualPose:NEW_VIRTUAL_POSE, virtualSweep:sweep };
    expect(validateCameraDraft(draft)).toEqual([]);
    expect(validateCameraDraft({ ...draft, sourceType:'webcam' })).not.toEqual([]);
    const cameras = INITIAL_CAMERAS.map(c => c.id === 'CAM-01' ? { ...c, virtualSweep:sweep } : c);
    expect(validateConfig({ schemaVersion:1, cameras, zones:[], rules:[] }).cameras[0].virtualSweep).toEqual(sweep);
    expect(() => validateConfig({ schemaVersion:1, cameras: cameras.map(c => ({ ...c, virtualSweep:{...sweep, periodSec:1} })), zones:[], rules:[] })).toThrow();
  });
});
