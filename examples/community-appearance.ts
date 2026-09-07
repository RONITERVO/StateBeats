// Import this module from your reference-player entry before starting a session.
// This trusted code is an adapter; the portable map only names community/mole.
import * as THREE from 'three';
import { registerAppearance } from '../packages/player/src/appearances.js';

export const unregisterMole = registerAppearance('community/mole', () => {
  const object = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.12, 12, 8);
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x9e7259 }));
  body.scale.set(1, 1.3, 0.8); object.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf4bba3 }));
  nose.position.set(0, 0, 0.11); object.add(nose);
  return {
    object,
    update(entity, view, preferences) {
      const remaining = (entity.hitTick - view.tick) / view.tickRate;
      // Cosmetic emergence ends before the interaction window; collider stays at the mapped destination.
      object.position.y = preferences.reducedMotion ? 0 : -Math.max(0, Math.min(0.2, (remaining - 0.35) * 0.2));
    },
    dispose() {
      for (const mesh of [body, nose]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
});
