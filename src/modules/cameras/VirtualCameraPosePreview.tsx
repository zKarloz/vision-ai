import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { SimulationWorld } from '../../infrastructure/simulation/SimulationWorld';
import { dollyVirtualPose, orbitVirtualPose, type VirtualCameraPose, type VirtualCameraSweep } from '../../core/domain/virtualCameraPose';

/** Editor 3D visual: arrastrar para orbitar y rueda para acercar, sin coordenadas. */
export function VirtualCameraPosePreview({ pose, sweep, onChange }: {
  pose: VirtualCameraPose; sweep?: VirtualCameraSweep; onChange: (pose: VirtualCameraPose) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<SimulationWorld | null>(null);
  const poseRef = useRef(pose);
  const onChangeRef = useRef(onChange);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [error, setError] = useState('');
  poseRef.current = pose;
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let world: SimulationWorld | null = null;
    try {
      world = new SimulationWorld(canvas, () => {}, () => {});
      world.setVirtualCameras([{ id: 'PREVIEW', sourceType: 'virtual-3d', virtualPose: poseRef.current }]);
      world.selectCamera('PREVIEW');
      world.start();
      worldRef.current = world;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo mostrar la vista 3D.'); }
    // Listener nativo no pasivo: evita que la página se desplace al hacer zoom sobre el visor.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      onChangeRef.current(dollyVirtualPose(poseRef.current, event.deltaY > 0 ? 1.06 : 0.94));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => world?.resize()) : null;
    observer?.observe(canvas);
    return () => { canvas.removeEventListener('wheel', onWheel); observer?.disconnect(); world?.dispose(); worldRef.current = null; };
  }, []);

  useEffect(() => {
    worldRef.current?.setVirtualCameras([{ id: 'PREVIEW', sourceType: 'virtual-3d', virtualPose: pose, virtualSweep: sweep }]);
  }, [pose, sweep]);

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const previous = pointerRef.current;
    if (!previous || previous.id !== event.pointerId) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointerRef.current = { ...previous, x: event.clientX, y: event.clientY };
    onChangeRef.current(orbitVirtualPose(poseRef.current, -dx * 0.3, dy * 0.25));
  }
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="overflow-hidden rounded-xl border border-[var(--border)]">
    <canvas ref={canvasRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      className="block aspect-video w-full cursor-grab touch-none bg-[#dde3e8] active:cursor-grabbing"
      aria-label="Vista interactiva: arrastra para girar la cámara y usa la rueda para acercar o alejar" />
    <p className="px-3 py-2 text-[11px] text-[var(--muted)]">Arrastra la imagen para cambiar el ángulo; usa la rueda para acercar o alejar. {sweep ? 'El barrido se muestra automáticamente.' : 'Vista fija sin inferencia YOLO.'}</p>
    {error && <p role="alert" className="p-3 text-xs text-[var(--danger)]">{error}</p>}
  </div>;
}
