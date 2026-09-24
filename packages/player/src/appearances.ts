import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import type { ThemePreferences } from './themes.js';
import { createPathGuide } from './target-guide.js';
import type { TargetGuide } from './target-guide.js';

export interface TargetAppearance {
  object: THREE.Object3D;
  /** Own the complete guide; undefined uses the reference guide, false deliberately omits it. */
  guide?: TargetGuide | false;
  /** The adapter interprets lifecycle progress itself instead of using the default opacity envelope. */
  handlesPresence?: boolean;
  update?(
    entity: Observation['entities'][number],
    view: Observation,
    preferences: ThemePreferences,
  ): void;
  dispose(): void;
}
export type AppearanceFactory = (
  entity: Observation['entities'][number],
  color: number,
) => TargetAppearance;
const registry = new Map<string, AppearanceFactory>();
/** Trusted renderer extension. Artwork, guide and transitions never alter authoritative movement. */
export function registerAppearance(id: string, factory: AppearanceFactory): () => void {
  if (registry.has(id)) throw new Error(`Appearance already registered: ${id}`);
  registry.set(id, factory);
  return () => {
    if (registry.get(id) === factory) registry.delete(id);
  };
}
export function createAppearance(
  entity: Observation['entities'][number],
  color: number,
): TargetAppearance | undefined {
  return entity.appearance ? registry.get(entity.appearance)?.(entity, color) : undefined;
}
const star: AppearanceFactory = (entity, color) => {
  const geometry = new THREE.OctahedronGeometry(
    entity.shape.kind === 'sphere' ? entity.shape.radius * 0.9 : 0.14,
  );
  const material = new THREE.MeshBasicMaterial({ color });
  return {
    object: new THREE.Mesh(geometry, material),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
};
registerAppearance('statebeats/star', star);
registerAppearance('statebeats/firefly', star);
registerAppearance('statebeats/prism', (entity, color) => {
  const object = new THREE.Group();
  const radius = entity.shape.kind === 'sphere' ? entity.shape.radius : 0.115;
  const crystalGeometry = new THREE.OctahedronGeometry(radius * 0.86);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true });
  const crystal = new THREE.Mesh(crystalGeometry, material);
  const haloGeometry = new THREE.TorusGeometry(radius * 1.18, 0.008, 4, 24);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  object.add(crystal, halo);
  return {
    object,
    guide: entity.presentation?.guide === 'none' ? false : createPathGuide(color),
    handlesPresence: true,
    update(entity, view, preferences) {
      const cue = entity.presentation;
      const visibility = cue?.visibility ?? 1;
      material.opacity = visibility;
      haloMaterial.opacity = 0.65 * visibility;
      // Emergence is artistic: this reference crystal assembles at its authored location.
      const emergence =
        cue?.presence === 'emerge' && !preferences.reducedMotion
          ? 0.35 + 0.65 * cue.appearanceProgress
          : 1;
      object.scale.setScalar(emergence * (1 - (cue?.releaseProgress ?? 0) * 0.35));
      crystal.rotation.y = preferences.reducedMotion ? 0 : (view.tick / view.tickRate) * 1.4;
      halo.rotation.x = Math.PI / 3;
      halo.rotation.y = preferences.reducedMotion ? 0 : (-view.tick / view.tickRate) * 0.6;
    },
    dispose() {
      crystalGeometry.dispose();
      haloGeometry.dispose();
      material.dispose();
      haloMaterial.dispose();
    },
  };
});

const opacityState = new WeakMap<THREE.Material, { baseline: number; applied: number }>();
function materialsIn(object: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (
      !(
        child instanceof THREE.Mesh ||
        child instanceof THREE.Sprite ||
        child instanceof THREE.Line ||
        child instanceof THREE.Points
      )
    )
      return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material])
      materials.add(material);
  });
  return materials;
}
/** Restore the unfaded baseline, run adapter animation, then apply this frame's lifecycle envelope. */
export function applyPresence(object: THREE.Object3D, visibility: number, update?: () => void) {
  for (const material of materialsIn(object)) {
    const prior = opacityState.get(material);
    // Preserve assignments made between calls; never divide by a previous zero visibility.
    if (prior && material.opacity === prior.applied) material.opacity = prior.baseline;
    opacityState.delete(material);
  }
  update?.();
  // The callback may add/remove children or replace their materials.
  for (const material of materialsIn(object)) {
    const baseline = material.opacity,
      applied = baseline * visibility;
    if (!material.transparent) {
      material.transparent = true;
      material.needsUpdate = true;
    }
    opacityState.set(material, { baseline, applied });
    material.opacity = applied;
  }
}
registerAppearance('statebeats/bird', () => {
  const object = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xf3babb, side: THREE.DoubleSide });
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0.12, side * 0.6, 0.08, -0.06, side * 0.15, 0, -0.22],
        3,
      ),
    );
    const wing = new THREE.Mesh(geometry, material);
    wings.push(wing);
    object.add(wing);
  }
  return {
    object,
    update(_entity, view, preferences) {
      wings.forEach((wing, i) => {
        wing.rotation.z = preferences.reducedMotion
          ? 0
          : Math.sin((view.tick / view.tickRate) * 10) * 0.28 * (i ? 1 : -1);
      });
    },
    dispose() {
      wings.forEach((wing) => wing.geometry.dispose());
      material.dispose();
    },
  };
});
