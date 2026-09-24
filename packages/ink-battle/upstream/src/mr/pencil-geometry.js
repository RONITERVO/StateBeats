import * as THREE from "three";

/** Actual marks in space, not the triangle edges of a filled mesh. Each path is
 * authored once and instanced; its pressure and wobble never change with time. */
export function strokeGeometry(paths, radius = 0.018) {
  const positions = [],
    colors = [],
    centers = [],
    offsets = [];
  const tangent = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    side = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  for (const [pathIndex, path] of paths.entries()) {
    const rings = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i],
        before = path[Math.max(0, i - 1)],
        after = path[Math.min(path.length - 1, i + 1)];
      tangent
        .set(after[0] - before[0], after[1] - before[1], after[2] - before[2])
        .normalize();
      normal
        .crossVectors(
          tangent,
          Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up,
        )
        .normalize();
      side.crossVectors(tangent, normal).normalize();
      const pressure = 0.76 + Math.sin(i * 2.3 + pathIndex * 4.1) * 0.16;
      const end = i === 0 || i === path.length - 1 ? 0.55 : 1;
      rings.push(
        Array.from({ length: 3 }, (_, j) => {
          const angle = (j * Math.PI * 2) / 3;
          const offset = p.map(
            (_, axis) =>
              pressure *
              end *
              (normal.getComponent(axis) * Math.cos(angle) +
                side.getComponent(axis) * Math.sin(angle)),
          );
          return {
            position: p.map((v, axis) => v + radius * offset[axis]),
            center: p,
            offset,
          };
        }),
      );
    }
    for (let i = 1; i < rings.length; i++) {
      const value = 0.75 + 0.22 * Math.sin(i * 1.7 + pathIndex) ** 2;
      for (let j = 0; j < 3; j++) {
        const k = (j + 1) % 3;
        for (const vertex of [
          rings[i - 1][j],
          rings[i][j],
          rings[i][k],
          rings[i - 1][j],
          rings[i][k],
          rings[i - 1][k],
        ]) {
          positions.push(...vertex.position);
          centers.push(...vertex.center);
          offsets.push(...vertex.offset);
          colors.push(value, value, value);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "pencilCenter",
    new THREE.Float32BufferAttribute(centers, 3),
  );
  geometry.setAttribute(
    "pencilOffset",
    new THREE.Float32BufferAttribute(offsets, 3),
  );
  geometry.computeBoundingSphere();
  geometry.userData.pencil = true;
  geometry.userData.paths = paths.length;
  return geometry;
}

const ellipse = (plane, radius = 1, offset = 0, steps = 12) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 2,
      r = radius * (1 + Math.sin(t * 3 + plane) * 0.014);
    return plane === 0
      ? [Math.cos(t) * r, Math.sin(t) * r, offset]
      : plane === 1
        ? [Math.cos(t) * r, offset, Math.sin(t) * r]
        : [offset, Math.cos(t) * r, Math.sin(t) * r];
  });

export function pencilGeometries() {
  const sphere = [ellipse(0), ellipse(2)];
  for (let i = 0; i < 4; i++) {
    const y = -0.65 + i * 0.24,
      r = Math.sqrt(1 - y * y);
    sphere.push(
      Array.from({ length: 4 }, (_, j) => {
        const a = 0.2 + j * 0.25;
        return [Math.cos(a) * r, y + j * 0.025, Math.sin(a) * r];
      }),
    );
  }
  const box = [];
  for (const a of [-0.5, 0.5])
    for (const b of [-0.5, 0.5]) {
      box.push([
        [-0.5, a, b],
        [0.5, a + 0.006, b],
      ]);
      box.push([
        [a, -0.5, b],
        [a, 0.5, b + 0.006],
      ]);
      box.push([
        [a, b, -0.5],
        [a + 0.006, b, 0.5],
      ]);
    }
  // Three broad marks keep the dry-pencil fill while leaving room for combat
  // flashes in a full army of painted tanks.
  for (let i = 0; i < 3; i++) {
    const x = -0.35 + i * 0.25;
    box.push([
      [x, -0.48, 0.505],
      [x + 0.1, -0.12, 0.505],
    ]);
    box.push([
      [0.505, -0.35 + i * 0.25, -0.4],
      [0.505, -0.25 + i * 0.25, 0.15],
    ]);
  }
  const rod = [ellipse(1, 1, -0.5, 10), ellipse(1, 1, 0.5, 10)];
  const cone = [ellipse(1, 1, -0.5)];
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    rod.push([
      [Math.cos(a), -0.5, Math.sin(a)],
      [Math.cos(a), 0.5, Math.sin(a)],
    ]);
    cone.push([
      [Math.cos(a), -0.5, Math.sin(a)],
      [0, 0.5, 0],
    ]);
  }
  return {
    stroke: strokeGeometry(
      [
        [
          [0, -0.5, 0],
          [0.11, -0.18, 0.06],
          [-0.06, 0.2, -0.04],
          [0, 0.5, 0],
        ],
      ],
      0.75,
    ),
    sphere: strokeGeometry(sphere, 0.06),
    box: strokeGeometry(box, 0.029),
    rod: strokeGeometry(rod, 0.055),
    cone: strokeGeometry(cone, 0.055),
    // Twelve facets match the pencil sphere. Tiny tank wheels don't need a
    // denser circle; this saves geometry across a full army without wider lines.
    ring: strokeGeometry([ellipse(0, 1, 0, 12)], 0.045),
    shadow: strokeGeometry(
      Array.from({ length: 7 }, (_, i) => {
        const y = -0.75 + i * 0.25,
          x = Math.sqrt(1 - y * y);
        return [
          [-x, y, 0],
          [0, y + 0.025, 0],
          [x, y + 0.08, 0],
        ];
      }),
      0.014,
    ),
  };
}
