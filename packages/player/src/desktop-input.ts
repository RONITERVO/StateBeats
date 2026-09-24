import * as THREE from 'three';
import type { Observation } from '@statebeats/sdk';

/** Selects a point along the pointer ray; the normal pose/collision path still judges contact. */
export function assistedTargetPoint(
  ray: THREE.Ray,
  entity: Observation['entities'][number],
  tick: number,
): THREE.Vector3 | null {
  // Authoritative existence does not grant assistance before the map's reveal time.
  if (entity.presentation?.readiness?.phase === 'hidden') return null;
  const target = new THREE.Vector3(
    ...(tick >= entity.hitTick ? entity.position : (entity.targetPosition ?? entity.position)),
  );
  const orientation = new THREE.Quaternion(...entity.orientation);
  const shape = entity.shape;
  let point: THREE.Vector3 | null = null;
  if (shape.kind === 'sphere') {
    const depth = target.clone().sub(ray.origin).dot(ray.direction);
    if (ray.distanceToPoint(target) <= shape.radius + 0.035)
      point = ray.at(depth, new THREE.Vector3());
  } else if (shape.kind === 'box') {
    if (shape.rotation) orientation.multiply(new THREE.Quaternion(...shape.rotation));
    const inverse = orientation.clone().invert();
    const localRay = new THREE.Ray(
      ray.origin.clone().sub(target).applyQuaternion(inverse),
      ray.direction.clone().applyQuaternion(inverse),
    );
    const half = new THREE.Vector3(...shape.half).addScalar(0.035);
    const hit = localRay.intersectBox(
      new THREE.Box3(half.clone().negate(), half),
      new THREE.Vector3(),
    );
    if (hit) point = hit.applyQuaternion(orientation).add(target);
  } else {
    const a = new THREE.Vector3(...shape.a).applyQuaternion(orientation).add(target);
    const b = new THREE.Vector3(...shape.b).applyQuaternion(orientation).add(target);
    const onRay = new THREE.Vector3();
    if (ray.distanceSqToSegment(a, b, onRay) <= (shape.radius + 0.035) ** 2) point = onRay;
  }
  if (!point) return null;
  const depth = point.clone().sub(ray.origin).dot(ray.direction);
  return depth >= 0.15 && depth <= 2 ? point : null;
}
