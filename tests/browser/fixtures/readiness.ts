import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import { OrbitScene } from '../../../packages/player/src/scene.js';
import { registerAppearance, applyPresence } from '../../../packages/player/src/appearances.js';

export function readinessScene(
  frames: Observation[],
  targetId: string,
  highContrast = false,
  reducedMotion = false,
) {
  document.body.replaceChildren();
  document.body.style.margin = '0';
  const scene = new OrbitScene(document.body);
  scene.theme.preferences.highContrast = highContrast;
  scene.theme.preferences.reducedMotion = reducedMotion;
  const focus = frames.at(-1)!.entities.find((e) => e.id === targetId)!;
  scene.camera.position.set(0, 1.65, 0);
  scene.camera.lookAt(focus.position[0], 1.4, focus.position[2]);
  function draw(view: Observation) {
    scene.update(view);
    scene.render();
    // Render order is stable across frames, while observation ordering can change.
    const group = (scene as unknown as { objects: Map<string, THREE.Group> }).objects.get(
      targetId,
    )!;
    const mesh = (name: string) =>
      group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const artworkRoot = group.getObjectByName('artwork-root');
    const artwork = artworkRoot?.children[0];
    const opacity: number[] = [];
    artwork?.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points)
        for (const material of Array.isArray(child.material) ? child.material : [child.material])
          opacity.push(material.opacity);
    });
    return {
      visible: group.visible,
      body: mesh('body').material.opacity,
      bodyVisible: mesh('body').visible,
      core: mesh('core').material.opacity,
      ring: mesh('timing').material.opacity,
      label: (group.getObjectByName('requirement') as THREE.Sprite).material.opacity,
      marker: mesh('waiting-marker').material.opacity,
      markerVisible: mesh('waiting-marker').visible,
      artworkVisible: artwork?.visible,
      artworkRootVisible: artworkRoot?.visible,
      opacity,
    };
  }
  const samples = frames.map(draw);
  // A restore/seek must reproduce the same rendering, independent of frame history.
  const redraw = frames.map(draw);
  return { scene, draw, samples, redraw };
}

export function registerReadinessFixture(ownsReadiness: boolean) {
  return registerAppearance('test/readiness', () => {
    const material = new THREE.MeshBasicMaterial({ opacity: 0.8 });
    const geometry = new THREE.IcosahedronGeometry(0.1);
    const object = new THREE.Mesh(geometry, material);
    return {
      object,
      handlesPresence: true,
      handlesReadiness: ownsReadiness,
      update(entity) {
        // Demonstrates a legacy presence-aware adapter, including intentional object visibility.
        object.visible = false;
        applyPresence(object, entity.presentation?.visibility ?? 1);
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  });
}
