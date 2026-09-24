import * as THREE from "three";
import { chapterPalette, seededPaint, pigmentTexture } from "./watercolor.js";

// The painted page is opaque, not a translucent overlay: passthrough furniture
// must never compete with the combat lane or the prices printed on the paper.
export function paintPage(canvas, age) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  const palette = chapterPalette(age),
    random = seededPaint(130 + age);
  c.globalAlpha = 1;
  c.fillStyle = palette.paper;
  c.fillRect(0, 0, w, h);
  const blob = (x, y, rx, ry, color, alpha) => {
    c.fillStyle = color;
    c.globalAlpha = alpha;
    const points = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2,
        r = 0.86 + random() * 0.18;
      const xx = (x + Math.cos(a) * rx * r) * w;
      const yy = (y + Math.sin(a) * ry * r) * h;
      return [xx, yy];
    });
    // Curved wet edges, without a full-canvas blur pass per daub. Filters made
    // an age change stall on software renderers; these paths are cheap to fill.
    c.beginPath();
    const last = points[points.length - 1],
      first = points[0];
    c.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      c.quadraticCurveTo(
        p[0],
        p[1],
        (p[0] + next[0]) / 2,
        (p[1] + next[1]) / 2,
      );
    });
    c.closePath();
    c.fill();
  };
  // Pool the stronger color behind scenery and along the edges. Keep the front
  // shop margin and the battle lane pale enough for small graphite lettering.
  for (let i = 0; i < 42; i++) {
    const x = random(),
      y = random() * 0.5;
    blob(
      x,
      y,
      0.055 + random() * 0.15,
      0.025 + random() * 0.055,
      i % 4 === 0 ? palette.body : palette.accent,
      0.055,
    );
  }
  for (const x of [0.055, 0.945]) {
    for (let i = 0; i < 12; i++)
      blob(
        x,
        0.06 + i * 0.076,
        0.04 + random() * 0.05,
        0.055,
        palette.accent,
        0.07,
      );
  }
  // Light washes span the center and both flanks of the open battlefield.
  for (const row of [.174,.405,.627]) for (let i = 0; i < 16; i++)
    blob(0.07 + i * 0.056, row, 0.057, 0.045, "#ba9660", 0.04);
  // Subtle colored paint under the existing deployment markings.
  blob(0.229, 0.405, 0.09, 0.235, "#319788", 0.11);
  blob(0.067, 0.401, 0.045, 0.225, "#c49737", 0.16);
  c.globalAlpha = 1;
  const crease = c.createLinearGradient(w * 0.476, 0, w * 0.524, 0);
  crease.addColorStop(0, "#6d4d2b00");
  crease.addColorStop(0.47, "#6d4d2b28");
  crease.addColorStop(0.5, "#6d4d2b54");
  crease.addColorStop(0.56, "#fff9e988");
  crease.addColorStop(1, "#fff9e900");
  c.fillStyle = crease;
  c.fillRect(w * 0.476, 0, w * 0.048, h);
  // Fixed paper fibers; never randomize the wash on a render tick.
  const pixels = c.getImageData(0, 0, w, h);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - 0.5) * 9;
    for (let k = 0; k < 3; k++) pixels.data[i + k] += grain;
    pixels.data[i + 3] = 255;
  }
  c.putImageData(pixels, 0, 0);
}

export function pageGeometry() {
  const geometry = new THREE.PlaneGeometry(2.44, 2.12, 24, 1);
  geometry.rotateX(-Math.PI / 2).translate(0, -0.004, 0.34);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = Math.abs(positions.getX(i));
    positions.setY(i, -0.004 - 0.024 * Math.max(0, 1 - x / 0.14) ** 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class BookPaper extends THREE.Group {
  constructor() {
    super();
    this.name = "watercolor-paper-book";
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 1024;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.page = new THREE.Mesh(
      pageGeometry(),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        side: THREE.DoubleSide,
      }),
    );
    this.page.name = "opaque-painted-pages";
    this.add(this.page);
    const box = (size, position, color) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshBasicMaterial({ color, map: pigmentTexture() }),
      );
      mesh.position.set(...position);
      this.add(mesh);
    };
    box([2.57, 0.03, 2.21], [0, -0.107, 0.345], "#73534e");
    // A real page block conceals the room when viewed from the side or below.
    box([2.46, 0.07, 2.12], [0, -0.059, 0.34], "#e8d8b3");
    box([0.064, 0.008, 0.25], [0.113, -0.115, 1.475], "#c39950");
  }
  setAge(age) {
    paintPage(this.canvas, age);
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.texture.dispose();
    this.removeFromParent();
  }
}
