import { describe, expect, it } from 'vitest';
import { readCameraPolygons, writeCameraPolygons } from '../src/infrastructure/persistence/LocalImageZoneRepository';

function storage(initial: Record<string,string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key:string) => data[key] ?? null,
    setItem: (key:string,value:string) => { data[key] = value; },
  };
}

describe('Infraestructura: persistencia de zonas por cámara', () => {
  it('incluye un polígono inicial para CAM-02 y sin zona para CAM-01', () => {
    const result = readCameraPolygons(storage());
    expect(result['CAM-01']).toHaveLength(0);
    expect(result['CAM-02']).toHaveLength(4);
  });
  it('respeta la eliminación intencional de una zona', () => {
    const store = storage();
    const zones = readCameraPolygons(store);
    zones['CAM-02'] = [];
    writeCameraPolygons(store,zones);
    expect(readCameraPolygons(store)['CAM-02']).toEqual([]);
  });
  it('migra la zona válida desde la fase 0', () => {
    const store = storage({ 'vision-ai-image-zones-v03': JSON.stringify({
      'CAM-01': [{x:0,y:0},{x:1,y:0},{x:1,y:1}], 'CAM-02': [],
    }) });
    expect(readCameraPolygons(store)['CAM-01']).toHaveLength(3);
    expect(readCameraPolygons(store)['CAM-02']).toHaveLength(0);
  });
});
