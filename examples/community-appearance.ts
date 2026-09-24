// Import this module from your reference-player entry before starting a session.
// This trusted code is an adapter; the portable map only names community/mole.
import * as THREE from 'three';
import { registerAppearance, applyPresence } from '../packages/player/src/appearances.js';

export const unregisterMole = registerAppearance('community/mole', () => {
  const object = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.12, 12, 8);
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x9e7259 }));
  body.scale.set(1, 1.3, 0.8); object.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf4bba3 }));
  nose.position.set(0, 0, 0.11); object.add(nose);
  return {
    object,
    handlesPresence: true,
    update(entity, view, preferences) {
      const cue = entity.presentation;
      // The same lifecycle can mean emerging from a hole instead of fading a star.
      // The SDK finishes appearance before contact counts; the collider never moves with this artwork.
      const emergence = cue?.appearanceProgress ?? 1;
      object.position.y = preferences.reducedMotion ? 0 : -0.2 * (1 - emergence);
      applyPresence(object, cue?.visibility ?? 1);
    },
    dispose() {
      for (const mesh of [body, nose]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
});
