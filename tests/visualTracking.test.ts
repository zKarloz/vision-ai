import { describe, expect, it } from 'vitest';
import type { Detection } from '../src/core/types/vision';
import { VisualZoneMonitor } from '../src/domain/visualTracking';
import type { ImageZone } from '../src/domain/imageZones';
const zone: ImageZone = { id:'Z-IMG', cameraId:'CAM-02', polygon:[
  {x:0.3,y:0.5},{x:0.9,y:0.5},{x:0.9,y:0.95},{x:0.3,y:0.95},
] };
const person = (x:number): Detection => ({classId:0, label:'persona', confidence:0.7,
  box:{x, y:0.36, width:0.14, height:0.48}});
describe('asociación de tracks y alertas YOLO', () => {
  it('abre con 3 observaciones consecutivas, sin emitir repetidos', () => {
    const monitor = new VisualZoneMonitor();
    expect(monitor.step('CAM-02', [person(0.41)], zone, 100).events).toEqual([]);
    expect(monitor.step('CAM-02', [person(0.43)], zone, 300).events).toEqual([]);
    const third = monitor.step('CAM-02', [person(0.45)], zone, 500);
    expect(third.tracks[0].id).toBe(1);
    expect(third.events.map(e=>e.type)).toEqual(['opened']);
    expect(monitor.step('CAM-02', [person(0.46)], zone, 700).events).toEqual([]);
  });
  it('no cierra por una pérdida corta, sí por salida confirmada', () => {
    const monitor = new VisualZoneMonitor();
    for(let i=0;i<3;i++) monitor.step('CAM-02',[person(0.43)],zone, i*100);
    const missing = monitor.step('CAM-02',[],zone,400);
    expect(missing.events).toEqual([]);
    expect(missing.tracks[0]).toMatchObject({seen:false, missed:1, lastSeenAt:200, alertOpen:true});
    expect(monitor.step('CAM-02',[person(0.61)],zone,500).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(0.79)],zone,600).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(0.87)],zone,700).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(0.87)],zone,800).events.map(e=>e.type)).toEqual(['left']);
  });
  it('marca señal perdida sin inventar una salida', () => {
    const monitor = new VisualZoneMonitor();
    for(let i=0;i<3;i++) monitor.step('CAM-02',[person(0.43)],zone, i*100);
    const events = Array.from({length:4},(_,i)=>monitor.step('CAM-02',[],zone,500+i*100).events).flat();
    expect(events.map(e=>e.type)).toEqual(['lost']);
  });
  it('no produce eventos sin zona ni reutiliza un track de otra cámara', () => {
    const monitor = new VisualZoneMonitor();
    let idCam02 = -1;
    // Sin polígono, las observaciones nunca generan una infracción.
    for (let i = 0; i < 5; i++) {
      const result = monitor.step('CAM-02', [person(0.43)], null, i * 100);
      expect(result.events).toEqual([]);
      idCam02 = result.tracks[0].id;
    }
    // Al cambiar de cámara se descartan tracks, pero el contador global NO se reinicia.
    const fromCam01 = monitor.step('CAM-01', [person(0.43)], zone, 600);
    expect(fromCam01.events).toEqual([]);
    expect(fromCam01.tracks).toHaveLength(1);
    expect(fromCam01.tracks[0].id).toBeGreaterThan(idCam02);
    expect(fromCam01.tracks[0].alertOpen).toBe(false);
  });
  it('evalúa solo la zona correspondiente a la cámara activa', () => {
    const monitor = new VisualZoneMonitor();
    const zoneCam01: ImageZone = { ...zone, id: 'Z-CAM-01', cameraId: 'CAM-01' };
    // Una zona de CAM-02 no debe abrir incidentes de CAM-01.
    for (let i = 0; i < 3; i++) {
      expect(monitor.step('CAM-01', [person(0.43)], zone, i * 100).events).toEqual([]);
    }
    // La zona correctamente asociada requiere observaciones nuevas antes de abrir.
    expect(monitor.step('CAM-01', [person(0.43)], zoneCam01, 400).events).toEqual([]);
    expect(monitor.step('CAM-01', [person(0.43)], zoneCam01, 500).events).toEqual([]);
    const opened = monitor.step('CAM-01', [person(0.43)], zoneCam01, 600);
    expect(opened.events).toHaveLength(1);
    expect(opened.events[0]).toMatchObject({ type: 'opened', cameraId: 'CAM-01', source: 'yolo' });
  });
});

// La ausencia de detección no permite abrir una alerta nueva ni confirmar una salida.
describe('seguridad ante detecciones intermitentes', () => {
  it('reinicia confirmación temporal cuando faltan detecciones', () => {
    const monitor = new VisualZoneMonitor();
    expect(monitor.step('CAM-02',[person(.43)],zone,100).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(.43)],zone,200).events).toEqual([]);
    expect(monitor.step('CAM-02',[],zone,300).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(.43)],zone,400).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(.43)],zone,500).events).toEqual([]);
    expect(monitor.step('CAM-02',[person(.43)],zone,600).events.map(e=>e.type)).toEqual(['opened']);
  });
});
