import { describe, expect, it } from 'vitest';
import { ZoneEvaluator } from '../src/core/domain/ZoneEvaluator';
import type { Zone } from '../src/core/domain/zone';
const zone: Zone = { id:'Z-01',cameraId:'CAM-02',name:'Peligro',type:'restricted',enabled:true,configVersion:1,
  polygon:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}] };

describe('ZoneEvaluator: punto de contacto, pertenencia y conos', () => {
  it('incluye la zona si el pie de la persona cae en el polígono', () => {
    const result = new ZoneEvaluator().evaluate('CAM-02', {x:.3,y:.2,width:.2,height:.5}, [zone]);
    expect(result.point).toEqual({x:.4,y:.7});
    expect(result.zones).toHaveLength(1);
  });
  it('ignora zonas de otras cámaras y zonas deshabilitadas', () => {
    expect(new ZoneEvaluator().evaluate('CAM-01',{x:.3,y:.2,width:.2,height:.5},[zone]).zones).toHaveLength(0);
    expect(new ZoneEvaluator().evaluate('CAM-02',{x:.3,y:.2,width:.2,height:.5},[{...zone,enabled:false}]).zones).toHaveLength(0);
  });
  it('mide radio de precaución sin disparar sirena', () => {
    const e = new ZoneEvaluator();
    expect(e.isNearCone({x:.5,y:.5},{x:.53,y:.54},.06)).toBe(true);
    expect(e.isNearCone({x:.5,y:.5},{x:.8,y:.8},.06)).toBe(false);
  });
});
