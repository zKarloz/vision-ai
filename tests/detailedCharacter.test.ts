import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWorkerCharacter } from '../src/infrastructure/simulation/CharacterFactory';

describe('Operario 3D oficial (variante C original)', () => {
  it('crea un modelo único detallado sin variantes seleccionables', () => {
    const model = createWorkerCharacter();
    const meshes: THREE.Mesh[] = [];
    model.group.traverse(item => { if (item instanceof THREE.Mesh) meshes.push(item); });
    expect(model.group.name).toBe('Operario-detallado-C');
    expect(meshes.length).toBeGreaterThan(30);
    expect(model.limbs.armLeft.children.length).toBeGreaterThan(2);
    expect(model.limbs.legRight.children.length).toBeGreaterThan(2);
    // No se abre contexto WebGL, y no se consulta la posición para producir detecciones.
    meshes.forEach(mesh => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
  });
});
