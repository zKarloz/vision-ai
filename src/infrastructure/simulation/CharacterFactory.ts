import * as THREE from 'three';

/**
 * Operario detallado de la fase 0, originalmente variante C.
 * Es el ÚNICO modelo del producto: cara, chaleco, manos, botas y casco.
 * Las posiciones 3D nunca se utilizan como detecciones de YOLO.
 */
export interface CharacterModel {
  group: THREE.Group;
  limbs: { armLeft: THREE.Group; armRight: THREE.Group; legLeft: THREE.Group; legRight: THREE.Group };
}

export function createWorkerCharacter(uniform = '#46768f', helmet = '#f4c64e'): CharacterModel {
  const root = new THREE.Group();
  root.name = 'Operario-detallado-C';
  const body = new THREE.Group();
  root.add(body);
  const limbs = {
    armLeft: new THREE.Group(), armRight: new THREE.Group(),
    legLeft: new THREE.Group(), legRight: new THREE.Group(),
  };
  const add = (parent: THREE.Group, shape: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ color, roughness: 0.69 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (p: THREE.Group, w: number, h: number, d: number, c: string, x: number, y: number, z: number) =>
    add(p, new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const sphere = (p: THREE.Group, r: number, c: string, x: number, y: number, z: number, segments = 20) =>
    add(p, new THREE.SphereGeometry(r, segments, Math.max(12, segments - 4)), c, x, y, z);
  const capsule = (p: THREE.Group, r: number, length: number, c: string, x: number, y: number, z: number, segments = 12) =>
    add(p, new THREE.CapsuleGeometry(r, length, 5, segments), c, x, y, z);

  // Geometría y proporciones de la variante C original; sin A/B ni selector de estilos.
  const chest = capsule(body, 0.37, 0.46, uniform, 0, 1.43, 0, 20);
  chest.scale.z = 0.72;
  capsule(body, 0.285, 0.14, '#243a51', 0, 1.01, 0, 18).scale.z = 0.78;
  add(body, new THREE.CylinderGeometry(0.13, 0.13, 0.18, 16), '#bf8d6c', 0, 1.90, 0);
  const face = sphere(body, 0.277, '#d4a481', 0, 2.22, 0.04, 28);
  face.scale.set(0.96, 1.12, 0.88);
  // Rostro orientado hacia +Z.
  for (const x of [-0.105, 0.105]) sphere(body, 0.025, '#403a38', x, 2.235, 0.281, 12);
  capsule(body, 0.028, 0.036, '#b37b5c', 0, 2.14, 0.288, 10);
  box(body, 0.11, 0.013, 0.014, '#79564b', 0, 2.065, 0.291);
  for (const x of [-0.277, 0.277]) sphere(body, 0.063, '#c99a7c', x, 2.19, 0.02, 12);
  add(body, new THREE.SphereGeometry(0.32, 28, 16, 0, Math.PI * 2, 0, Math.PI / 1.9), helmet, 0, 2.435, 0.015);
  add(body, new THREE.CylinderGeometry(0.355, 0.35, 0.06, 28), helmet, 0, 2.43, 0.02);
  box(body, 0.10, 0.024, 0.39, '#dba839', 0, 2.715, 0);
  box(body, 0.13, 0.045, 0.07, '#ffffff', 0, 2.44, 0.355);

  // Chaleco con cintas reflectantes y detalles de uniforme.
  for (const x of [-0.248, 0.248]) {
    box(body, 0.115, 0.65, 0.045, '#f6cc51', x, 1.48, 0.238);
    box(body, 0.075, 0.43, 0.022, '#eaeff0', x, 1.48, 0.274);
  }
  box(body, 0.60, 0.092, 0.046, '#e9eded', 0, 1.27, 0.245);
  box(body, 0.11, 0.67, 0.055, '#e5eef0', 0, 1.44, 0.263);
  box(body, 0.18, 0.11, 0.056, '#203a50', -0.15, 1.30, 0.275);
  box(body, 0.14, 0.085, 0.035, '#fafafa', -0.15, 1.30, 0.319);
  for (const x of [-0.21, 0.21]) box(body, 0.13, 0.1, 0.04, '#385368', x, 1.08, 0.245);

  // Se conservan articulaciones independientes para la animación de marcha.
  for (const sign of [-1, 1] as const) {
    const arm = sign < 0 ? limbs.armLeft : limbs.armRight;
    const leg = sign < 0 ? limbs.legLeft : limbs.legRight;
    arm.position.set(sign * 0.43, 1.72, 0);
    leg.position.set(sign * 0.20, 1.0, 0);
    body.add(arm, leg);
    capsule(arm, 0.147, 0.36, uniform, 0, -0.28, 0, 18);
    capsule(arm, 0.122, 0.32, uniform, 0, -0.69, 0.025, 18);
    capsule(arm, 0.103, 0.13, '#d0a081', 0, -0.945, 0.035, 18);
    capsule(leg, 0.166, 0.39, '#30435a', 0, -0.32, 0, 18);
    capsule(leg, 0.145, 0.32, '#30435a', 0, -0.72, 0.018, 18);
    box(arm, 0.26, 0.045, 0.22, '#dae2e5', 0, -0.7, 0.03);
    box(leg, 0.31, 0.105, 0.31, '#526474', 0, -0.57, 0.015);
    box(leg, 0.35, 0.22, 0.53, '#212c37', 0, -0.91, 0.13);
  }
  return { group: root, limbs };
}
