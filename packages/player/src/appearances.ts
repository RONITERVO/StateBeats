import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import type { ThemePreferences } from './themes.js';

export interface TargetAppearance {
  object: THREE.Object3D;
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
/** Trusted renderer extension. Geometry, labels, timing and authoritative state stay independent. */
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
