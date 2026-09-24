import * as THREE from 'three';
import type { TargetPresentation } from '@statebeats/sdk';

/** Reference visual interpretation. Timing and reveal policy come exclusively from the SDK cue. */
export function readinessStyle(cue: TargetPresentation | undefined, highContrast: boolean) {
  const progress = cue?.readiness?.progress ?? 1;
  const emphasis = progress * progress * (3 - 2 * progress);
  const waiting = !!cue?.readiness && cue.readiness.phase !== 'resolved' && progress < 1;
  return {
    emphasis,
    marker: waiting ? (highContrast ? 0.55 : 0.26) * (1 - emphasis) : 0,
    label: waiting ? (highContrast ? 0.4 + 0.6 * emphasis : 0.22 + 0.78 * emphasis) : 1,
  };
}

/** A broken outline reads as pending without relying on color, glow or extra motion. */
export function createWaitingMarker(color: number) {
  const points: number[] = [];
  for (let section = 0; section < 8; section++) {
    for (let segment = 0; segment < 5; segment++) {
      for (const end of [segment, segment + 1]) {
        const angle = (2 * Math.PI * (section + (end / 5) * 0.66)) / 8;
        points.push(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const marker = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  marker.name = 'waiting-marker';
  return marker;
}
