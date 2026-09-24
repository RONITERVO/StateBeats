import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyPresence } from '../packages/player/src/appearances.js';

it('composes adapter opacity animation with the envelope, including equal outputs and zero visibility', () => {
  const material = new THREE.MeshBasicMaterial({ opacity: 0.8 });
  const geometry = new THREE.SphereGeometry();
  const object = new THREE.Mesh(geometry, material);
  applyPresence(object, 0.25);
  expect(material.opacity).toBe(0.2);
  applyPresence(object, 1, () => {
    expect(material.opacity).toBe(0.8);
    material.opacity = 0.2; // Deliberately equals the previous faded output.
  });
  expect(material.opacity).toBe(0.2);
  applyPresence(object, 0, () => {
    material.opacity *= 0.5;
  });
  expect(material.opacity).toBe(0);
  applyPresence(object, 0.5, () => {
    expect(material.opacity).toBe(0.1);
    material.opacity *= 0.5;
  });
  expect(material.opacity).toBe(0.025);
  applyPresence(object, 0.5);
  expect(material.opacity).toBe(0.025); // Repainting a paused frame cannot compound the fade.
  applyPresence(object, 1);
  expect(material.opacity).toBe(0.05);
  material.opacity = 0.7; // Also preserve direct assignments between standalone calls.
  applyPresence(object, 1);
  expect(material.opacity).toBe(0.7);
  geometry.dispose();
  material.dispose();
});

it('fades particles, sprites, lines and repeated materials once, including materials added during update', () => {
  const object = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const meshMaterial = new THREE.MeshBasicMaterial({ opacity: 0.8 });
  const particleMaterial = new THREE.PointsMaterial({ opacity: 0.6 });
  const spriteMaterial = new THREE.SpriteMaterial({ opacity: 0.4 });
  const lineMaterial = new THREE.LineBasicMaterial({ opacity: 0.2 });
  object.add(
    new THREE.Mesh(geometry, [meshMaterial, meshMaterial]),
    new THREE.Mesh(geometry, meshMaterial),
    new THREE.Points(geometry, particleMaterial),
    new THREE.Sprite(spriteMaterial),
  );
  applyPresence(object, 0.5, () => object.add(new THREE.Line(geometry, lineMaterial)));
  for (const [material, expected] of [
    [meshMaterial, 0.4],
    [particleMaterial, 0.3],
    [spriteMaterial, 0.2],
    [lineMaterial, 0.1],
  ] as const) {
    expect(material.opacity).toBeCloseTo(expected);
    expect(material.transparent).toBe(true);
  }
  applyPresence(object, 0);
  applyPresence(object, 1);
  expect(meshMaterial.opacity).toBe(0.8);
  expect(particleMaterial.opacity).toBe(0.6);
  expect(spriteMaterial.opacity).toBe(0.4);
  expect(lineMaterial.opacity).toBe(0.2);
  geometry.dispose();
  for (const material of [meshMaterial, particleMaterial, spriteMaterial, lineMaterial])
    material.dispose();
});
