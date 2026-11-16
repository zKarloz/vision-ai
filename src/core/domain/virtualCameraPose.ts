/** Perspectiva virtual: coordenadas de mundo Three.js, sin dependencia gráfica. */
export interface VirtualCameraPose {
  x: number; y: number; z: number;
  targetX: number; targetY: number; targetZ: number;
  fov: number;
}

/** Perspectivas originales preservadas para configuraciones v1.4.x sin pose. */
export const DEFAULT_VIRTUAL_POSES: Readonly<Record<string, VirtualCameraPose>> = {
  'CAM-01': { x: -10.5, y: 7.9, z: 10.3, targetX: -7.1, targetY: 0.8, targetZ: 0, fov: 49 },
  'CAM-02': { x: 11.6, y: 8.2, z: 11.2, targetX: 7.5, targetY: 1, targetZ: 0, fov: 49 },
};
export const NEW_VIRTUAL_POSE: VirtualCameraPose = {
  x: 0, y: 9, z: 13, targetX: 0, targetY: 1, targetZ: 0, fov: 50,
};

/** Valores acotados: evitan cámaras degeneradas o fuera del suelo industrial. */
export function validateVirtualCameraPose(pose: VirtualCameraPose): string[] {
  const problems: string[] = [];
  const ranges: Array<[keyof VirtualCameraPose, number, number]> = [
    ['x', -20, 20], ['y', 1.5, 18], ['z', -20, 20],
    ['targetX', -14, 14], ['targetY', 0, 8], ['targetZ', -10, 10],
    ['fov', 30, 100],
  ];
  for (const [field, min, max] of ranges) {
    const value = pose[field];
    if (!Number.isFinite(value) || value < min || value > max) {
      problems.push(`${field} debe estar entre ${min} y ${max}.`);
    }
  }
  if (!problems.length && Math.hypot(
    pose.x - pose.targetX, pose.y - pose.targetY, pose.z - pose.targetZ,
  ) < 0.75) problems.push('La cámara debe estar al menos a 0.75 unidades de su objetivo.');
  return problems;
}

export function virtualPoseFor(cameraId: string, pose?: VirtualCameraPose): VirtualCameraPose {
  return pose ?? DEFAULT_VIRTUAL_POSES[cameraId] ?? NEW_VIRTUAL_POSE;
}


/** Barrido horizontal: oscila alrededor de la orientación central del encuadre. */
export interface VirtualCameraSweep {
  mode: 'sweep';
  /** Desplazamiento máximo a cada lado del centro, en grados. */
  amplitudeDeg: number;
  /** Duración completa del ciclo izquierda -> derecha -> izquierda. */
  periodSec: number;
}

export function validateVirtualCameraSweep(sweep: VirtualCameraSweep): string[] {
  const errors: string[] = [];
  if (sweep.mode !== 'sweep') errors.push('El modo de barrido no es válido.');
  if (!Number.isFinite(sweep.amplitudeDeg) || sweep.amplitudeDeg < 5 || sweep.amplitudeDeg > 75)
    errors.push('El giro por lado debe estar entre 5° y 75°.');
  if (!Number.isFinite(sweep.periodSec) || sweep.periodSec < 4 || sweep.periodSec > 30)
    errors.push('El ciclo debe durar entre 4 y 30 segundos.');
  return errors;
}

/** Calcula la dirección de una cámara oscilante sin desplazar su soporte físico. */
export function sweepPoseAt(base: VirtualCameraPose, sweep: VirtualCameraSweep, seconds: number): VirtualCameraPose {
  const rotation = Math.sin((2 * Math.PI * seconds) / sweep.periodSec) * sweep.amplitudeDeg * Math.PI / 180;
  const dx = base.targetX - base.x;
  const dz = base.targetZ - base.z;
  return {
    ...base,
    targetX: base.x + dx * Math.cos(rotation) - dz * Math.sin(rotation),
    targetZ: base.z + dx * Math.sin(rotation) + dz * Math.cos(rotation),
  };
}

/** Edición visual: orbitamos alrededor del objetivo sin exponer coordenadas al usuario. */
export function orbitVirtualPose(base: VirtualCameraPose, yawDeg: number, pitchDeg: number): VirtualCameraPose {
  const dx = base.x - base.targetX;
  const dy = base.y - base.targetY;
  const dz = base.z - base.targetZ;
  const radius = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz) + yawDeg * Math.PI / 180;
  const pitch = Math.max(-1.20, Math.min(1.20, Math.atan2(dy, Math.hypot(dx, dz)) + pitchDeg * Math.PI / 180));
  const horizontal = Math.cos(pitch) * radius;
  const result = {
    ...base,
    x: base.targetX + horizontal * Math.sin(yaw),
    y: base.targetY + radius * Math.sin(pitch),
    z: base.targetZ + horizontal * Math.cos(yaw),
  };
  return validateVirtualCameraPose(result).length ? base : result;
}

/** Acerca/aleja la cámara conservando su orientación hacia el punto de interés. */
export function dollyVirtualPose(base: VirtualCameraPose, factor: number): VirtualCameraPose {
  const result = {
    ...base,
    x: base.targetX + (base.x - base.targetX) * factor,
    y: base.targetY + (base.y - base.targetY) * factor,
    z: base.targetZ + (base.z - base.targetZ) * factor,
  };
  return validateVirtualCameraPose(result).length ? base : result;
}
