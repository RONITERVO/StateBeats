import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';
import type { ThemePreferences } from './themes.js';

export interface TargetGuide {
  object: THREE.Object3D;
  update(
    entity: Observation['entities'][number],
    view: Observation,
    preferences: ThemePreferences,
  ): void;
  dispose(): void;
}
const MAX_POINTS = 290;
const SIDES = 6;
/** Reusable bounded ribbon: actual trajectory geometry, with a tapered, fading moving window. */
export function createPathGuide(color: number, radius = 0.009): TargetGuide {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * SIDES * 3), 3);
  const strengths = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * SIDES), 1);
  positions.setUsage(THREE.DynamicDrawUsage);
  strengths.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('strength', strengths);
  const indices: number[] = [];
  for (let i = 0; i < MAX_POINTS - 1; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j,
        b = i * SIDES + ((j + 1) % SIDES);
      indices.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
    }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, contrast: { value: 0 } },
    vertexShader: `attribute float strength; varying float vStrength;
      void main() { vStrength = strength; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 tint; uniform float contrast; varying float vStrength;
      void main() { gl_FragColor = vec4(mix(tint, vec3(1.0), contrast * 0.25), vStrength * 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'trajectory-guide';
  object.frustumCulled = false;
  const inverse = new THREE.Quaternion(),
    origin = new THREE.Vector3();
  const tangent = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    binormal = new THREE.Vector3();
  const up = new THREE.Vector3(),
    vertex = new THREE.Vector3();
  return {
    object,
    update(entity, _view, preferences) {
      // Old observations remain displayable, but do not silently reveal legacy complete rails.
      const path = entity.presentation?.path ?? [];
      const count = Math.min(path.length, MAX_POINTS);
      object.visible = count > 1;
      geometry.setDrawRange(0, Math.max(0, count - 1) * SIDES * 6);
      if (count < 2) return;
      inverse.fromArray(entity.orientation).invert();
      origin.fromArray(entity.position);
      const points = path
        .slice(0, count)
        .map((p) => new THREE.Vector3(...p.position).sub(origin).applyQuaternion(inverse));
      material.uniforms.contrast.value = preferences.highContrast ? 1 : 0;
      for (let i = 0; i < count; i++) {
        tangent.subVectors(points[Math.min(count - 1, i + 1)], points[Math.max(0, i - 1)]);
        if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, 1);
        tangent.normalize();
        up.set(0, Math.abs(tangent.y) < 0.9 ? 1 : 0, Math.abs(tangent.y) < 0.9 ? 0 : 1);
        normal.crossVectors(tangent, up).normalize();
        binormal.crossVectors(tangent, normal).normalize();
        const strength = path[i].strength;
        const width = radius * Math.sqrt(strength) * (preferences.highContrast ? 1.6 : 1);
        for (let j = 0; j < SIDES; j++) {
          const angle = (2 * Math.PI * j) / SIDES;
          vertex
            .copy(points[i])
            .addScaledVector(normal, Math.cos(angle) * width)
            .addScaledVector(binormal, Math.sin(angle) * width);
          positions.setXYZ(i * SIDES + j, vertex.x, vertex.y, vertex.z);
          strengths.setX(i * SIDES + j, strength);
        }
      }
      positions.needsUpdate = strengths.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
