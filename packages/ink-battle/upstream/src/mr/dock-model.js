import { DOCK } from './defense-layout.js';
import { PENCIL } from './pencil-palette.js';

/** Painted foundation, shared with the shop token. No new meshes or textures. */
export function dockModel(b, { built = true, occupied = false, highlighted = false, color = PENCIL.player } = {}) {
  const w = DOCK.width / 2, d = DOCK.depth / 2;
  const y = built ? DOCK.height + 0.002 : 0.004;
  if (built) {
    b.paint(PENCIL.wood);
    b.box([0, DOCK.height / 2, 0], [DOCK.width, DOCK.height, DOCK.depth]);
    // Team-colored face and inset pencil seams make the raised plinth readable.
    b.part('box', [0, 0.026, d + 0.001], [DOCK.width * 0.8, 0.013, 0.002], PENCIL.graphite, [0, 0, 0], color);
    if (!occupied) {
      b.part('ring', [0, y, 0], [0.028, 0.028, 0.028], color, [Math.PI / 2, 0, 0]);
      b.line([-0.015, y, 0], [0.015, y, 0], 0.002, color);
    }
  }
  if (!built || highlighted) {
    const ink = highlighted ? PENCIL.income : PENCIL.soft;
    // Broken corners mean an unbuilt blueprint; gold corners indicate the
    // current drop target. No solid surface until the dock has been purchased.
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      b.line([x * w, y, z * d], [x * w * 0.55, y, z * d], 0.0024, ink);
      b.line([x * w, y, z * d], [x * w, y, z * d * 0.5], 0.0024, ink);
    }
  }
}
