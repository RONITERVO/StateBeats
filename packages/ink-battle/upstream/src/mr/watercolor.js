import * as THREE from "three";
import { AGES } from "../content/ages.js";

// Reuse the classic game's chapter hues. Lift dark chapters onto pale paper so
// graphite remains legible in passthrough, independently of the room's lighting.
const chapters = new Map();
export function chapterPalette(age) {
  if (chapters.has(age)) return chapters.get(age);
  const theme = AGES[age].theme;
  const base = new THREE.Color(`hsl(${theme.bg.split(" ").join(",")})`);
  const accent = new THREE.Color(`hsl(${theme.accent.split(" ").join(",")})`);
  const paper = base.clone().lerp(new THREE.Color("#fff6df"), 0.76);
  const body = base.clone().lerp(accent, 0.42).lerp(paper, 0.2);
  const palette = {
    paper: paper.getStyle(),
    accent: accent.getStyle(),
    body: body.getStyle(),
  };
  chapters.set(age, palette);
  return palette;
}

export function seededPaint(seed = 71) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// One tiny, shared opaque pigment texture. Dry brush streaks and pooled pigment
// are fixed in object space: no screen-space noise or shimmer between XR eyes.
let pigment;
export function pigmentTexture() {
  if (pigment) return pigment;
  const size = 128,
    data = new Uint8Array(size * size * 4);
  const random = seededPaint();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const brush = Math.sin((x + y * 0.37) * 0.9);
      const pool = Math.sin(x * 0.095) * Math.cos(y * 0.072);
      const value = Math.round(229 + pool * 12 + brush * 5 + random() * 9);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  pigment = new THREE.DataTexture(data, size, size);
  pigment.colorSpace = THREE.SRGBColorSpace;
  pigment.wrapS = pigment.wrapT = THREE.RepeatWrapping;
  pigment.magFilter = THREE.LinearFilter;
  pigment.minFilter = THREE.LinearMipmapLinearFilter;
  pigment.generateMipmaps = true;
  pigment.needsUpdate = true;
  return pigment;
}

export function paintMaterial() {
  return new THREE.MeshBasicMaterial({
    map: pigmentTexture(),
    vertexColors: true,
    side: THREE.DoubleSide,
    // Keep authored hatch marks just above their opaque painted surfaces.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

export function fillGeometries() {
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  triangle.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2),
  );
  triangle.computeVertexNormals();
  const geometries = {
    fill_sphere: new THREE.SphereGeometry(0.985, 12, 5),
    fill_box: new THREE.BoxGeometry(0.994, 0.994, 0.994),
    fill_rod: new THREE.CylinderGeometry(0.985, 0.985, 0.994, 10),
    fill_cone: new THREE.ConeGeometry(0.985, 0.994, 12),
    fill_triangle: triangle,
  };
  // Baked, subtle face values give volume without glossy lighting or a costly
  // lit material. The entire drawing remains readable in an unlit real room.
  const light = new THREE.Vector3(-0.3, 0.8, 0.5).normalize();
  const normal = new THREE.Vector3();
  for (const geometry of Object.values(geometries)) {
    const normals = geometry.attributes.normal;
    const colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      normal.fromBufferAttribute(normals, i);
      const value = 0.88 + Math.max(0, normal.dot(light)) * 0.12;
      colors.set([value, value, value], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  return geometries;
}
