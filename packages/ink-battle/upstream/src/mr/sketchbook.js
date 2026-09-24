import * as THREE from "three";
import { strokeGeometry } from "./pencil-geometry.js";

export const CHAPTERS = Object.freeze(
  [
    {
      title: "I · FIRST MARKS",
      motif: "fern, volcano, fossil",
      base: "bone cave",
    },
    {
      title: "II · BANNERS & BOWS",
      motif: "oak, hills, masonry",
      base: "crenellated keep",
    },
    {
      title: "III · POWDER & SAIL",
      motif: "cypress, windmill, navigation",
      base: "star bastion",
    },
    {
      title: "IV · IRON & STATIC",
      motif: "birch, wire, radio",
      base: "sandbag bunker",
    },
    {
      title: "V · TOMORROW IN PENCIL",
      motif: "crystal, circuit, observatory",
      base: "orbital laboratory",
    },
    {
      title: "VI · MARGINS OF SPACE",
      motif: "orbit, comet, constellation",
      base: "celestial gate",
    },
  ].map(Object.freeze),
);

function drawing() {
  const paths = [];
  return {
    paths,
    path: (...points) => paths.push(points),
    ellipse(x, y, z, rx, rz, upright = false) {
      paths.push(
        Array.from({ length: 25 }, (_, i) => {
          const t = (i / 24) * Math.PI * 2;
          return [
            x + rx * Math.cos(t),
            y + (upright ? rz * Math.sin(t) : 0),
            z + (upright ? 0 : rz * Math.sin(t)),
          ];
        }),
      );
    },
  };
}

export function bookPaths() {
  const d = drawing();
  // The playable y=0 plane stays exact. Curled contours and page stacks sit below it.
  for (const side of [-1, 1]) {
    for (let leaf = 0; leaf < 8; leaf++) {
      const y = -0.012 - leaf * 0.009,
        edge = side * (1.22 + leaf * 0.002);
      for (const z of [-0.72, 1.4])
        d.path(
          [0, y - 0.016, z],
          [side * 0.13, y + 0.003, z],
          [side * 0.7, y + 0.012, z + side * 0.005],
          [edge, y + 0.008, z],
        );
      d.path(
        [edge, y + 0.008, -0.72],
        [edge + side * 0.008, y + 0.004, 0.3],
        [edge, y + 0.008, 1.4],
      );
    }
    d.path(
      [0, -0.108, -0.76],
      [side * 1.28, -0.087, -0.76],
      [side * 1.3, -0.091, 1.45],
      [side * 0.09, -0.104, 1.45],
      [0, -0.128, 1.43],
    );
    d.path(
      [side * 0.035, -0.024, -0.7],
      [side * 0.035, -0.018, 0.35],
      [side * 0.035, -0.024, 1.4],
    );
    // Pencil rubbed along the fore-edge and the cover, with visible paper between marks.
    for (let i = 0; i < 42; i++) {
      const z = -0.69 + i * 0.049;
      d.path([side * 1.235, -0.075, z], [side * 1.252, -0.025, z + 0.018]);
    }
    for (let i = 0; i < 20; i++) {
      const x = side * (0.08 + i * 0.057);
      d.path([x, -0.079, 1.402], [x + side * 0.024, -0.027, 1.405]);
    }
  }
  // Sewn signatures and a forked ribbon bookmark make the object read as a book.
  for (let i = 0; i < 7; i++) {
    const z = -0.55 + i * 0.29;
    d.path([-0.035, -0.023, z], [0, -0.035, z + 0.035], [0.035, -0.024, z]);
  }
  d.path(
    [0.075, -0.09, 1.36],
    [0.09, -0.12, 1.61],
    [0.12, -0.12, 1.57],
    [0.15, -0.12, 1.61],
    [0.135, -0.09, 1.36],
  );
  for (let i = 0; i < 6; i++)
    d.path([0.096, -0.116, 1.4 + i * 0.027], [0.134, -0.116, 1.42 + i * 0.027]);
  // Shop is drawn into the front margins of the same spread.
  d.path(
    [-1.18, 0.001, 0.7],
    [-0.45, 0.003, 0.697],
    [0, -0.013, 0.7],
    [0.6, 0.003, 0.702],
    [1.18, 0.001, 0.7],
  );
  return d.paths;
}

export function landscapePaths(age, wide = false) {
  const d = drawing();
  // Hand-scored route: the old side-view horizon becomes a map on the spread.
  for (let row = 0; row < 3; row++) {
    const z = 0.37 + row * 0.074;
    d.path(
      ...Array.from({ length: 30 }, (_, i) => {
        const x = -0.92 + i * 0.064;
        return [x, 0.001, z + Math.sin(i * 1.7 + row) * 0.006];
      }),
    );
  }
  for (let i = 0; i < 20; i++) {
    const x = -0.9 + i * 0.093,
      z = 0.55 + Math.sin(i * 4.3) * 0.026;
    d.path([x, 0.001, z], [x + 0.04, 0.001, z + 0.018]);
  }
  const terrainStart = d.paths.length;
  // Terrain is deliberately in the rear field, away from purchases and combat.
  for (const side of [-1, 1]) {
    const x = side * 0.54;
    if (age === 0) {
      d.path(
        [x - 0.23, 0, 0.04],
        [x - 0.04, 0, -0.35],
        [x + 0.01, 0, -0.28],
        [x + 0.2, 0, 0.08],
      );
      for (let i = 0; i < 8; i++)
        d.path(
          [x - 0.06 + i * 0.024, 0.002, -0.12 + i * 0.02],
          [x - 0.15 + i * 0.03, 0.002, 0.06],
        );
      d.path([x, 0, 0.16], [x + 0.04, 0.19, 0.12], [x + 0.01, 0.28, 0.1]);
      for (let i = 0; i < 5; i++)
        for (const s of [-1, 1])
          d.path(
            [x + 0.035, 0.055 + i * 0.034, 0.12],
            [x + s * (0.1 - i * 0.011), 0.11 + i * 0.034, 0.11],
          );
      d.ellipse(x + 0.25, 0.002, 0.04, 0.055, 0.039);
    } else if (age === 1) {
      d.path(
        [x - 0.24, 0, -0.08],
        [x - 0.07, 0, -0.27],
        [x + 0.09, 0, -0.3],
        [x + 0.28, 0, -0.05],
      );
      d.path([x, 0, 0.13], [x + 0.008, 0.2, 0.13], [x - 0.034, 0.28, 0.14]);
      d.path([x + 0.004, 0.14, 0.13], [x + 0.065, 0.23, 0.1]);
      for (const [dx, dy] of [
        [-0.055, 0.26],
        [0.03, 0.31],
        [0.085, 0.26],
      ])
        d.ellipse(x + dx, dy, 0.12, 0.073, 0.055, true);
      for (let i = 0; i < 6; i++)
        d.path(
          [x - 0.14 + i * 0.044, 0.002, -0.08],
          [x - 0.08 + i * 0.043, 0.002, -0.17],
        );
    } else if (age === 2) {
      d.path(
        [x - 0.055, 0, 0.12],
        [x - 0.034, 0.23, 0.12],
        [x + 0.034, 0.23, 0.12],
        [x + 0.055, 0, 0.12],
      );
      for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2 + 0.3;
        d.path(
          [x, 0.2, 0.15],
          [x + Math.cos(a) * 0.16, 0.2 + Math.sin(a) * 0.16, 0.15],
          [
            x + Math.cos(a + 0.18) * 0.16,
            0.2 + Math.sin(a + 0.18) * 0.16,
            0.15,
          ],
        );
      }
      for (let i = 0; i < 5; i++)
        d.path(
          [x - 0.2, 0, -0.1 - i * 0.027],
          [x + 0.17, 0, -0.13 - i * 0.027],
        );
    } else if (age === 3) {
      d.path([x - 0.075, 0, 0.13], [x, 0.34, 0.13], [x + 0.075, 0, 0.13]);
      for (let i = 0; i < 4; i++)
        d.path(
          [x - 0.065 + i * 0.012, i * 0.06, 0.13],
          [x + 0.05 - i * 0.01, 0.08 + i * 0.06, 0.13],
        );
      d.ellipse(x, 0.3, 0.13, 0.055, 0.036, true);
      for (let i = 0; i < 6; i++)
        d.path([x - 0.2 + i * 0.07, 0, -0.1], [x - 0.2 + i * 0.07, 0.04, -0.1]);
      d.path([x - 0.2, 0.024, -0.1], [x + 0.15, 0.027, -0.1]);
    } else if (age === 4) {
      for (let i = 0; i < 3; i++) {
        const xx = x + (i - 1) * 0.095,
          h = 0.15 + i * 0.055;
        d.path(
          [xx - 0.045, 0, 0.12],
          [xx - 0.038, h, 0.12],
          [xx, h + 0.06, 0.08],
          [xx + 0.041, h, 0.1],
          [xx + 0.045, 0, 0.12],
        );
        d.path([xx, 0, 0.08], [xx, h + 0.06, 0.08]);
      }
      for (let i = 0; i < 4; i++)
        d.path(
          [x - 0.2, 0, -0.06 - i * 0.04],
          [x - 0.04, 0, -0.06 - i * 0.04],
          [x + 0.04, 0, -0.12 - i * 0.04],
          [x + 0.2, 0, -0.12 - i * 0.04],
        );
    } else {
      d.ellipse(x, 0.14, 0.1, 0.1, 0.1, true);
      d.ellipse(x, 0.14, 0.1, 0.17, 0.045);
      const stars = [
        [x - 0.23, 0, -0.2],
        [x - 0.09, 0, -0.31],
        [x + 0.14, 0, -0.19],
        [x + 0.2, 0, -0.04],
      ];
      d.path(...stars);
      for (const [xx, y, z] of stars) {
        d.path([xx - 0.022, y, z], [xx + 0.022, y, z]);
        d.path([xx, y, z - 0.022], [xx, y, z + 0.022]);
      }
    }
  }
  if (!wide) return d.paths;
  // Keep the chapter motifs in the back margin; three lightly scored routes
  // span the entire frontage without turning the page into rigid board lanes.
  const routes = [-.35, .14, .61].map(z => Array.from({length: 30},(_,i) =>
    [-.91 + i*.063, .001, z + Math.sin(i*1.7)*.006]));
  return [...routes, ...d.paths.slice(terrainStart).map(path => path.map(([x,y,z]) => [x,y*.7,-.525 + z*.14]))];
}

export function pencilMesh(paths, color = "#635b51", radius = 0.0011) {
  const mesh = new THREE.Mesh(
    strokeGeometry(paths, radius),
    new THREE.MeshBasicMaterial({ color, vertexColors: true }),
  );
  mesh.name = "spatial-pencil-drawing";
  return mesh;
}

export function mistPaths() {
  return Array.from({ length: 16 }, (_, row) =>
    Array.from({ length: 21 }, (_, i) => {
      const x = -1.06 + i * 0.105;
      return [
        x,
        0.018 + (row % 3) * 0.009,
        -0.28 + row * 0.052 + Math.sin(i * 0.4 + row) * 0.014,
      ];
    }),
  );
}
