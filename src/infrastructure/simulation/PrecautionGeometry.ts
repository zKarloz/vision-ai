/**
 * Datos geométricos del sector de conos. Es señalización gráfica, NO una detección
 * producida por YOLO ni un incidente registrado por el motor de reglas.
 * Las coordenadas se mantienen fuera de la zona roja de maquinaria.
 */
export const PRECAUTION_ZONE = {
  centerX: 0.45,
  centerZ: -1.65,
  width: 4.9,
  depth: 4.5,
} as const;

/** Distribución estable para que todas las cámaras vean los mismos conos. */
export const CONE_POSITIONS = [
  { x: -1.45, z: -3.42 },
  { x: 0.45, z: -3.42 },
  { x: 2.35, z: -3.42 },
  { x: -1.45, z: 0.12 },
  { x: 0.45, z: 0.12 },
  { x: 2.35, z: 0.12 },
] as const;

