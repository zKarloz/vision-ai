import * as THREE from 'three';

// Coordenadas compartidas con el adaptador DEMO puro, sin dependencia de Three.js.
import { CONE_POSITIONS, PRECAUTION_ZONE } from './PrecautionGeometry';
export { CONE_POSITIONS, PRECAUTION_ZONE } from './PrecautionGeometry';

/**
 * Fabrica una única agrupación reutilizable en render, capturas YOLO y editor
 * de cámaras. Las geometrías y materiales de los conos se comparten para
 * mantener bajo el coste de dibujado y de memoria.
 */
export function createPrecautionArea(): THREE.Group {
  const area = new THREE.Group();
  area.name = 'Zona de precaución — obras';
  area.userData = { type: 'visual-precaution-area', isDetection: false };

  // Pavimento ambar semitransparente, sin competir visualmente con la zona roja.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(PRECAUTION_ZONE.width, PRECAUTION_ZONE.depth),
    new THREE.MeshBasicMaterial({
      color: '#f0ac37', transparent: true, opacity: 0.24,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  surface.name = 'Superficie de precaución';
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(PRECAUTION_ZONE.centerX, 0.042, PRECAUTION_ZONE.centerZ);
  area.add(surface);

  const halfW = PRECAUTION_ZONE.width / 2;
  const halfD = PRECAUTION_ZONE.depth / 2;
  const perimeter = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(PRECAUTION_ZONE.centerX - halfW, 0.056, PRECAUTION_ZONE.centerZ - halfD),
      new THREE.Vector3(PRECAUTION_ZONE.centerX + halfW, 0.056, PRECAUTION_ZONE.centerZ - halfD),
      new THREE.Vector3(PRECAUTION_ZONE.centerX + halfW, 0.056, PRECAUTION_ZONE.centerZ + halfD),
      new THREE.Vector3(PRECAUTION_ZONE.centerX - halfW, 0.056, PRECAUTION_ZONE.centerZ + halfD),
    ]),
    new THREE.LineBasicMaterial({ color: '#bb7915' }),
  );
  perimeter.name = 'Contorno de precaución';
  area.add(perimeter);

  // Las franjas blancas son troncos de cono ajustados al mismo perfil naranja.
  const baseGeometry = new THREE.BoxGeometry(0.54, 0.075, 0.54);
  const coneGeometry = new THREE.ConeGeometry(0.23, 0.68, 16);
  const bandLowGeometry = new THREE.CylinderGeometry(0.125, 0.163, 0.105, 16);
  const bandHighGeometry = new THREE.CylinderGeometry(0.055, 0.083, 0.078, 16);
  const rubber = new THREE.MeshStandardMaterial({ color: '#272c33', roughness: 0.92 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ee7228', roughness: 0.75 });
  const white = new THREE.MeshStandardMaterial({ color: '#f7f7f3', roughness: 0.58 });

  for (const [index, position] of CONE_POSITIONS.entries()) {
    const cone = new THREE.Group();
    cone.name = `Cono de seguridad ${index + 1}`;
    cone.position.set(position.x, 0, position.z);
    const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; y: number }> = [
      { geometry: baseGeometry, material: rubber, y: 0.06 },
      { geometry: coneGeometry, material: orange, y: 0.43 },
      { geometry: bandLowGeometry, material: white, y: 0.35 },
      { geometry: bandHighGeometry, material: white, y: 0.56 },
    ];
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.position.y = part.y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cone.add(mesh);
    }
    area.add(cone);
  }

  // Material de obra sencillo: contextualiza el área sin dependencias 3D externas.
  const material = new THREE.MeshStandardMaterial({ color: '#9f8d71', roughness: 0.9 });
  const materials = new THREE.Group();
  materials.name = 'Materiales de obra';
  materials.position.set(PRECAUTION_ZONE.centerX, 0, PRECAUTION_ZONE.centerZ);
  for (const [index, elevation] of [0.16, 0.33].entries()) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0 - index * 0.18, 0.26, 0.75), material);
    crate.position.y = elevation;
    crate.castShadow = true;
    crate.receiveShadow = true;
    materials.add(crate);
  }
  area.add(materials);
  return area;
}
