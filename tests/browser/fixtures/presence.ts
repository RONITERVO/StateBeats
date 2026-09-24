import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import { OrbitScene } from '../../../packages/player/src/scene.js';
import { registerAppearance } from '../../../packages/player/src/appearances.js';

/** Real browser fixture: use the same Three instance and renderer lifecycle as the player. */
export function exercisePresence(frames: Observation[]) {
  const counts = {
    guideUpdates: 0,
    guideDisposals: 0,
    artworkDisposals: 0,
    labelDisposals: 0,
    textureDisposals: 0,
  };
  const remove = registerAppearance('test/presence-adapter', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const material = new THREE.PointsMaterial({ opacity: 0.8, size: 0.05 });
    const object = new THREE.Points(geometry, material);
    const guideGeometry = new THREE.SphereGeometry(0.1);
    const guideMaterial = new THREE.MeshBasicMaterial();
    guideGeometry.addEventListener('dispose', () => counts.guideDisposals++);
    return {
      object,
      guide: {
        object: new THREE.Mesh(guideGeometry, guideMaterial),
        update() {
          counts.guideUpdates++;
        },
        dispose() {
          guideGeometry.dispose();
          guideMaterial.dispose();
        },
      },
      update(_entity, view) {
        material.opacity = view.tick <= 150 ? 0.8 : 0.2;
      },
      dispose() {
        counts.artworkDisposals++;
        geometry.dispose();
        material.dispose();
      },
    };
  });
  document.body.replaceChildren();
  const scene = new OrbitScene(document.body);
  const samples = frames.map((frame) => {
    scene.update(frame);
    scene.render();
    return scene.targets.children
      .map((group) => ({
        body: ((group.getObjectByName('body') as THREE.Mesh).material as THREE.Material).opacity,
        ring: ((group.getObjectByName('timing') as THREE.Mesh).material as THREE.Material).opacity,
        core: ((group.getObjectByName('core') as THREE.Mesh).material as THREE.Material).opacity,
        label: (group.getObjectByName('requirement') as THREE.Sprite).material.opacity,
        particle: (group.getObjectByProperty('type', 'Points') as THREE.Points | undefined)
          ?.material,
      }))
      .map(({ particle, ...values }) => ({
        ...values,
        particle: (particle as THREE.Material | undefined)?.opacity,
      }));
  });
  const labels = scene.targets.children.map(
    (g) => g.getObjectByName('requirement') as THREE.Sprite,
  );
  const independentLabels = labels[0].material !== labels[1].material;
  const sharedTexture = labels[0].material.map === labels[1].material.map;
  for (const label of labels)
    label.material.addEventListener('dispose', () => counts.labelDisposals++);
  labels[0].material.map!.addEventListener('dispose', () => counts.textureDisposals++);
  scene.update({ ...frames.at(-1)!, entities: [], resolvedEntities: [] });
  scene.render();
  const afterRemoval = { ...counts, targets: scene.targets.children.length };
  scene.dispose();
  remove();
  return { samples, independentLabels, sharedTexture, afterRemoval, afterDisposal: { ...counts } };
}

export function exerciseLegacyGuides(view: Observation) {
  let customUpdates = 0,
    customDisposals = 0;
  const unregister = registerAppearance('test/legacy-guide', () => ({
    object: new THREE.Group(),
    guide: {
      object: new THREE.Group(),
      update() {
        customUpdates++;
      },
      dispose() {
        customDisposals++;
      },
    },
    dispose() {},
  }));
  const scene = new OrbitScene(document.body);
  const countFallbacks = () =>
    scene.targets.children.filter((g) => g.getObjectByName('trajectory-guide')).length;
  scene.update({
    ...view,
    entities: view.entities.map(({ presentation: _, ...entity }) => entity),
  });
  scene.render();
  const legacyFallbacks = countFallbacks();
  scene.clear();
  scene.update(view);
  scene.render();
  const currentFallbacks = countFallbacks();
  scene.dispose();
  unregister();
  return { legacyFallbacks, currentFallbacks, customUpdates, customDisposals };
}
