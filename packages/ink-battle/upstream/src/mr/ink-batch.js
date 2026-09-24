import * as THREE from "three";
import { pencilGeometries } from "./pencil-geometry.js";
import { PENCIL } from "./pencil-palette.js";
import { fillGeometries, paintMaterial } from "./watercolor.js";

const COLORS = new Map();
const colorValue = (value) => {
  if (!COLORS.has(value)) {
    COLORS.set(value, new THREE.Color(value));
  }
  return COLORS.get(value);
};

/** Bounded, instanced pencil paths with opaque, grainy watercolor beneath. */
export class InkBatch {
  constructor(parent, { capacity = 12000 } = {}) {
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    // Maintain pencil width when a primitive is stretched into a wall or barrel.
    // Width follows model/table scale, not the dimensions of an individual part.
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nattribute vec3 pencilCenter;\nattribute vec3 pencilOffset;\nattribute vec3 pencilRadius;",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "vec3 transformed = pencilCenter + pencilOffset * pencilRadius;",
      );
    };
    this.material.customProgramCacheKey = () => "spatial-pencil-width-v1";
    this.fillMaterial = paintMaterial();
    this.meshes = {};
    this.counts = {};
    this.overflow = 0;
    this.triangles = 0;
    for (const [name, geometry] of Object.entries({
      ...pencilGeometries(),
      ...fillGeometries(),
    })) {
      const filled = name.startsWith("fill_");
      if (!filled)
        geometry.setAttribute(
          "pencilRadius",
          new THREE.InstancedBufferAttribute(
            new Float32Array(capacity * 3),
            3,
          ).setUsage(THREE.DynamicDrawUsage),
        );
      const mesh = new THREE.InstancedMesh(
        geometry,
        filled ? this.fillMaterial : this.material,
        capacity,
      );
      mesh.name = `pencil-${name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      parent.add(mesh);
      this.meshes[name] = mesh;
    }
    this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.direction = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.frames = [];
    this.depth = 0;
    this.poseTranslation = new THREE.Matrix4();
    this.modelRotation = new THREE.Quaternion();
    this.context = { x: 0, y: 0, z: 0, scale: 1, face: 1, yaw: 0, cos: 1, sin: 0, paint: PENCIL.paper };
    this.begin();
  }
  begin() {
    for (const name of Object.keys(this.meshes)) this.counts[name] = 0;
    this.overflow = 0;
  }
  model(x, y, z, scale = 1, face = 1, yaw = 0) {
    this.context = { x, y, z, scale, face, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), paint: PENCIL.paper };
    this.modelRotation.setFromAxisAngle(this.up, yaw);
    this.depth = 0;
  }
  paint(color) {
    this.context.paint = color;
  }
  point([x, y, z = 0]) {
    const c = this.context;
    if (this.depth) {
      this.p.set(x, y, z).applyMatrix4(this.frames[this.depth - 1].matrix);
      x = this.p.x;
      y = this.p.y;
      z = this.p.z;
    }
    const dx = x * c.scale * c.face, dz = z * c.scale;
    return [c.x + dx * c.cos + dz * c.sin, c.y + y * c.scale, c.z - dx * c.sin + dz * c.cos];
  }
  // Articulated local joints. Reuse a tiny stack of transforms; both strokes
  // and paint follow the same pose, without per-piece meshes or skeletons.
  pose(pivot, rotation, offset, draw) {
    let frame = this.frames[this.depth];
    if (!frame)
      frame = this.frames[this.depth] = {
        matrix: new THREE.Matrix4(),
        rotation: new THREE.Quaternion(),
      };
    frame.rotation.setFromEuler(this.euler.set(...rotation));
    frame.matrix
      .makeRotationFromQuaternion(frame.rotation)
      .setPosition(
        pivot[0] + offset[0],
        pivot[1] + offset[1],
        pivot[2] + offset[2],
      )
      .multiply(
        this.poseTranslation.makeTranslation(-pivot[0], -pivot[1], -pivot[2]),
      );
    if (this.depth) {
      frame.matrix.premultiply(this.frames[this.depth - 1].matrix);
      frame.rotation.premultiply(this.frames[this.depth - 1].rotation);
    }
    this.depth++;
    try {
      draw();
    } finally {
      this.depth--;
    }
  }
  rotation(value) {
    this.q.setFromEuler(this.euler.set(...value));
    if (this.depth) this.q.premultiply(this.frames[this.depth - 1].rotation);
    // Reflect a local rotation toward the enemy, keeping positive instance
    // determinants (the filled primitives themselves are symmetric).
    this.q.y *= this.context.face;
    this.q.z *= this.context.face;
    this.q.premultiply(this.modelRotation);
    return this.q;
  }
  write(shape, p, s, color, q, width = 0.0015 * this.context.scale) {
    const mesh = this.meshes[shape],
      index = this.counts[shape];
    if (index >= mesh.instanceMatrix.count) {
      this.overflow++;
      return;
    }
    this.p.set(...p);
    this.s.set(...s);
    this.m.compose(this.p, q, this.s);
    mesh.setMatrixAt(index, this.m);
    mesh.setColorAt(index, colorValue(color));
    mesh.geometry.attributes.pencilRadius?.setXYZ(
      index,
      ...s.map((v) => width / Math.max(Math.abs(v), 1e-8)),
    );
    this.counts[shape]++;
  }
  part(shape, p, size, color = PENCIL.graphite, rotation = [0, 0, 0], fill) {
    const scale = this.context.scale;
    this.rotation(rotation);
    this.write(
      shape,
      this.point(p),
      size.map((v) => v * scale),
      color,
      this.q,
    );
    if (this.meshes[`fill_${shape}`]) {
      this.fill(
        shape,
        p,
        size,
        fill || (color === PENCIL.graphite ? this.context.paint : color),
        rotation,
      );
    }
  }
  fill(shape, p, size, color, rotation = [0, 0, 0]) {
    this.rotation(rotation);
    this.write(
      `fill_${shape}`,
      this.point(p),
      size.map((v) => v * this.context.scale),
      color,
      this.q,
    );
  }
  // Convex, planar patches for cloth and paper-cut equipment. Triangles share
  // one instanced buffer, so a new bottle silhouette adds no draw calls.
  panel(points, color) {
    const mesh = this.meshes.fill_triangle;
    const a = new THREE.Vector3(...this.point(points[0]));
    for (let i = 2; i < points.length; i++) {
      const index = this.counts.fill_triangle;
      if (index >= mesh.instanceMatrix.count) {
        this.overflow++;
        return;
      }
      const u = new THREE.Vector3(...this.point(points[i - 1])).sub(a);
      const v = new THREE.Vector3(...this.point(points[i])).sub(a);
      const normal = new THREE.Vector3().crossVectors(u, v);
      // A strip can narrow to a single point at a flask's bottom. Skip its
      // zero-area half so instance transforms remain invertible in the shader.
      if (normal.lengthSq() === 0) continue;
      normal.normalize();
      this.m.makeBasis(u, v, normal).setPosition(a);
      mesh.setMatrixAt(index, this.m);
      mesh.setColorAt(index, colorValue(color));
      this.counts.fill_triangle++;
    }
  }
  line(a, b, radius = 0.004, color = "#342d2b") {
    const p = this.point(a),
      end = this.point(b);
    this.direction.set(end[0] - p[0], end[1] - p[1], end[2] - p[2]);
    const len = this.direction.length();
    if (len < 1e-6) return;
    this.q.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / len));
    const width = Math.min(radius, 0.006) * 0.82 * this.context.scale;
    this.write(
      "stroke",
      p.map((v, i) => (v + end[i]) / 2),
      [width, len, width],
      color,
      this.q,
      width * 0.75,
    );
  }
  path(points, radius = 0.004, color = "#342d2b") {
    for (let i = 1; i < points.length; i++)
      this.line(points[i - 1], points[i], radius, color);
  }
  ellipse(center, radii, plane = "xy", color = "#342d2b", steps = 16) {
    this.path(
      Array.from({ length: steps + 1 }, (_, i) => {
        const t = (i / steps) * Math.PI * 2;
        const a = Math.cos(t) * radii[0],
          b = Math.sin(t) * radii[1];
        const p =
          plane === "xz" ? [a, 0, b] : plane === "yz" ? [0, a, b] : [a, b, 0];
        return p.map((v, axis) => v + center[axis]);
      }),
      0.003,
      color,
    );
  }
  sphere(p, radius, color) {
    this.part("sphere", p, [radius, radius, radius], color);
  }
  outlineBall(p, radius, color = PENCIL.graphite) {
    this.part(
      "sphere",
      p,
      [radius, radius, radius],
      color,
      [0, 0, 0],
      color === PENCIL.graphite ? PENCIL.paper : color,
    );
  }
  box(p, size, color = PENCIL.graphite) {
    this.part("box", p, size, color);
  }
  end() {
    this.triangles = 0;
    for (const [name, mesh] of Object.entries(this.meshes)) {
      mesh.count = this.counts[name];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.geometry.attributes.pencilRadius)
        mesh.geometry.attributes.pencilRadius.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.triangles +=
        (mesh.count *
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count)) /
        3;
    }
  }
  dispose() {
    for (const mesh of Object.values(this.meshes)) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.material.dispose();
    this.fillMaterial.dispose();
  }
}
