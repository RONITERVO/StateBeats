import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import { OrbitScene } from '../../../packages/player/src/scene.js';

let scene: OrbitScene;
export function renderInk(view: Observation, heading = 0, overview = false) {
  if (!scene) {
    document.body.replaceChildren();
    document.body.style.margin = '0';
    scene = new OrbitScene(document.body);
  }
  scene.setPlaying(true);
  scene.camera.position.set(0, 1.65, 0);
  scene.camera.lookAt(
    Math.sin((heading * Math.PI) / 180),
    1.5,
    -Math.cos((heading * Math.PI) / 180),
  );
  if (overview) {
    scene.camera.position.set(0, 17, 18);
    scene.camera.lookAt(0, 0, 0);
  }
  scene.update(view);
  scene.render();
  const offsets: number[][] = [];
  let maxOverflow = 0,
    bodiesVisible = 0;
  scene.targets.traverse((object) => {
    if (object.userData.contactOffset) offsets.push(object.userData.contactOffset);
    maxOverflow = Math.max(maxOverflow, object.userData.overflow ?? 0);
    if (object.name === 'body' && object.visible) bodiesVisible++;
  });
  const world = scene.scene.getObjectByName('ink-battle-world')!;
  return {
    offsets,
    maxOverflow,
    bodiesVisible,
    ...world.userData.inkBattle,
    draws: scene.renderer.info.render.calls,
    triangles: scene.renderer.info.render.triangles,
    geometries: scene.renderer.info.memory.geometries,
    textures: scene.renderer.info.memory.textures,
  };
}
export function clearInk(view: Observation) {
  scene.update(view);
  scene.render();
  const info = {
    geometries: scene.renderer.info.memory.geometries,
    textures: scene.renderer.info.memory.textures,
  };
  return info;
}
