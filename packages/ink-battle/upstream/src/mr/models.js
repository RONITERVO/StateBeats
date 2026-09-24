import { glyph } from "./glyphs.js";
import { PENCIL, TEAM_COLORS } from "./pencil-palette.js";
import { chapterPalette } from "./watercolor.js";
import { unitModel } from "./troop-models.js";
import { cannonModel } from "./defense-models.js";
import { dockModel } from './dock-model.js';
export { unitModel, cannonModel, TEAM_COLORS };
const INK = PENCIL.ink,
  GRAPHITE = PENCIL.graphite;

export function baseModel(b, age, x, team, progress = 1) {
  const color = TEAM_COLORS[team],
    y = -0.3 * (1 - progress);
  b.model(x, y, 0.14, 1, team);
  b.paint(chapterPalette(age).body);
  b.box([0, 0.025, 0], [0.27, 0.05, 0.48], GRAPHITE);
  if (age === 0) {
    b.part("sphere", [0, 0.07, 0], [0.14, 0.145, 0.15], GRAPHITE);
    b.part("sphere", [0.11, 0.066, 0.02], [0.013, 0.068, 0.05], INK);
    for (let i = 0; i < 8; i++)
      b.line(
        [-0.1 + i * 0.028, 0.05, 0.13],
        [-0.06 + i * 0.02, 0.18 - Math.abs(i - 3.5) * 0.016, -0.09],
        0.0018,
        GRAPHITE,
      );
  } else if (age === 1) {
    b.box([0, 0.111, 0], [0.21, 0.17, 0.3], GRAPHITE);
    for (const z of [-0.12, 0.12]) {
      b.box([0, 0.175, z], [0.15, 0.24, 0.065], GRAPHITE);
      for (const xx of [-0.06, 0, 0.06])
        b.box([xx, 0.31, z], [0.037, 0.044, 0.065], GRAPHITE);
    }
    b.box([0.109, 0.089, 0.01], [0.008, 0.105, 0.07], INK);
  } else if (age === 2) {
    b.box([0, 0.09, 0], [0.2, 0.12, 0.29], GRAPHITE);
    for (const z of [-0.14, 0.14]) {
      b.path(
        [
          [-0.11, 0.04, z],
          [-0.13, 0.15, z],
          [-0.045, 0.19, z],
          [0.09, 0.14, z],
          [0.13, 0.04, z],
        ],
        0.004,
      );
      b.path(
        [
          [-0.13, 0.15, z],
          [-0.13, 0.15, z + Math.sign(z) * 0.07],
          [-0.045, 0.19, z + Math.sign(z) * 0.1],
          [0.09, 0.14, z],
        ],
        0.004,
      );
    }
    b.part("cone", [-0.045, 0.227, 0], [0.065, 0.09, 0.075], GRAPHITE);
    for (const z of [-0.07, 0, 0.07])
      b.box([0.103, 0.09, z], [0.005, 0.026, 0.022]);
  } else if (age === 3) {
    b.box([0, 0.07, 0], [0.22, 0.1, 0.31], GRAPHITE);
    b.part("sphere", [0, 0.12, 0], [0.15, 0.04, 0.18], GRAPHITE);
    b.box([0.117, 0.077, 0], [0.012, 0.024, 0.19], INK);
    for (const z of [-0.11, 0, 0.11])
      b.box([0.114, 0.032, z], [0.045, 0.035, 0.08]);
    b.line([-0.08, 0.13, -0.12], [-0.08, 0.32, -0.12], 0.003);
    b.line([-0.12, 0.28, -0.12], [-0.035, 0.28, -0.12], 0.003);
  } else {
    b.part("sphere", [0, 0.064, 0], [0.145, 0.12, 0.18], GRAPHITE);
    for (const z of [-0.15, 0.15]) {
      b.part("cone", [0, 0.175, z], [0.047, 0.3, 0.047], color);
      b.sphere([0, 0.333, z], 0.022, GRAPHITE);
    }
    if (age === 5)
      b.part("ring", [0.11, 0.16, 0], [0.12, 0.12, 0.12], GRAPHITE, [
        0,
        Math.PI / 2,
        0,
      ]);
    if (age === 4) {
      b.part("ring", [0, 0.15, 0], [0.17, 0.17, 0.17], color, [
        Math.PI / 2,
        0,
        0,
      ]);
      b.path(
        [
          [-0.05, 0.17, 0],
          [-0.11, 0.23, 0],
          [-0.16, 0.25, 0],
        ],
        0.004,
      );
      b.part("ring", [-0.16, 0.25, 0], [0.05, 0.05, 0.05], INK, [
        0,
        Math.PI / 2,
        0.3,
      ]);
    }
  }
  b.line([0, 0.17, -0.2], [0, 0.4, -0.2], 0.004);
  b.box([0.043, 0.369, -0.2], [0.083, 0.045, 0.004], color);
}

export function objectModel(b, offer, age, options = {}) {
  const { x = 0, y = 0, z = 0, scale = 1, time = 0, held = false } = options;
  if (offer.kind === "unit")
    return unitModel(b, age, offer.command.index, { ...options, team: 1 });
  b.model(x, y, z, scale);
  b.paint(PENCIL.wood);
  if (offer.kind === "turret")
    return cannonModel(b, age, offer.command.index, TEAM_COLORS[1]);
  const potionColor =
    { dmg: PENCIL.damage, hp: PENCIL.health, econ: PENCIL.income }[
      offer.command?.stat
    ] || (offer.kind === "special" ? PENCIL.special : PENCIL.evolution);
  if (["potion", "evolve", "special"].includes(offer.kind)) {
    const symbol = offer.command?.stat || offer.kind;
    const outlines = {
      dmg: [
        [-0.011, 0.095],
        [-0.011, 0.073],
        [-0.034, 0.042],
        [-0.026, 0.014],
        [0.026, 0.014],
        [0.034, 0.042],
        [0.011, 0.073],
        [0.011, 0.095],
      ],
      hp: [
        [-0.013, 0.093],
        [-0.013, 0.076],
        [-0.036, 0.064],
        [-0.039, 0.035],
        [-0.023, 0.012],
        [0.022, 0.012],
        [0.039, 0.035],
        [0.036, 0.064],
        [0.013, 0.076],
        [0.013, 0.093],
      ],
      econ: [
        [-0.025, 0.084],
        [-0.033, 0.072],
        [-0.033, 0.015],
        [0.033, 0.015],
        [0.033, 0.072],
        [0.025, 0.084],
      ],
      evolve: [
        [-0.012, 0.12],
        [-0.012, 0.081],
        [-0.036, 0.023],
        [-0.031, 0.013],
        [0.031, 0.013],
        [0.036, 0.023],
        [0.012, 0.081],
        [0.012, 0.12],
      ],
      special: [
        [-0.017, 0.098],
        [-0.017, 0.081],
        [-0.041, 0.045],
        [-0.026, 0.009],
        [0, 0.003],
        [0.026, 0.009],
        [0.041, 0.045],
        [0.017, 0.081],
        [0.017, 0.098],
      ],
    };
    const outline = outlines[symbol];
    // Paint the closed bottle volume in horizontal strips. This preserves each
    // flask's concave neck and distinct outline without translucent sorting.
    const half = Math.floor(outline.length / 2);
    for (let i = 0; i < half - (outline.length % 2 ? 0 : 1); i++) {
      const [ax, ay] = outline[i],
        [bx, by] = outline[i + 1];
      const fill = by > 0.07 ? PENCIL.paper : potionColor;
      for (const zz of [-0.0205, 0.0205])
        b.panel(
          [
            [ax, ay, zz],
            [bx, by, zz],
            [-bx, by, zz],
            [-ax, ay, zz],
          ],
          fill,
        );
      for (const side of [-1, 1])
        b.panel(
          [
            [ax * side, ay, -0.0205],
            [bx * side, by, -0.0205],
            [bx * side, by, 0.0205],
            [ax * side, ay, 0.0205],
          ],
          fill,
        );
    }
    const bottom = outline[half - 1];
    b.panel(
      [
        [bottom[0], bottom[1], -0.0205],
        [-bottom[0], bottom[1], -0.0205],
        [-bottom[0], bottom[1], 0.0205],
        [bottom[0], bottom[1], 0.0205],
      ],
      potionColor,
    );
    for (const zz of [-0.021, 0.021])
      b.path(
        outline.map(([xx, yy]) => [xx, yy, zz]),
        0.0037,
      );
    for (const i of [0, Math.floor(outline.length / 2), outline.length - 1])
      b.line([...outline[i], -0.021], [...outline[i], 0.021], 0.003);
    const top = outline[0][1];
    b.box([0, top + 0.004, 0], [Math.abs(outline[0][0]) * 2.3, 0.012, 0.047]);
    // Pencil hatching and a dark glyph sit on the colored pigment.
    for (let i = 0; i < 5; i++)
      b.line(
        [-0.025 + i * 0.01, 0.018, 0.022],
        [-0.019 + i * 0.01, 0.04, 0.022],
        0.0028,
        potionColor,
      );
    glyph(b, symbol, 0, 0.055, 0.024, 0.017, INK);
  } else if (offer.kind === "hourglass") {
    for (const yy of [0.013, 0.122])
      b.box([0, yy, 0], [0.08, 0.013, 0.055], GRAPHITE);
    b.part(
      "cone",
      [0, 0.044, 0],
      [0.03, 0.056, 0.025],
      GRAPHITE,
      [0, 0, 0],
      PENCIL.income,
    );
    b.part("cone", [0, 0.088, 0], [0.03, 0.056, 0.025], GRAPHITE, [
      Math.PI,
      0,
      0,
    ]);
    for (const xx of [-0.034, 0.034])
      b.line([xx, 0.018, 0], [xx, 0.115, 0], 0.003);
  } else if (offer.kind === "clock" || offer.kind === "compass") {
    b.paint(PENCIL.paper);
    b.part("ring", [0, 0.063, 0], [0.046, 0.046, 0.015], GRAPHITE);
    b.part("sphere", [0, 0.063, 0], [0.043, 0.043, 0.007], GRAPHITE);
    if (offer.kind === "compass") glyph(b, "compass", 0, 0.063, 0.015, 0.031);
    else {
      b.line([0, 0.063, 0.012], [0.018, 0.083, 0.012], 0.0025);
      b.line([0, 0.063, 0.012], [-0.025, 0.049, 0.012], 0.0025);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        b.line(
          [Math.cos(a) * 0.035, 0.063 + Math.sin(a) * 0.035, 0.013],
          [Math.cos(a) * 0.04, 0.063 + Math.sin(a) * 0.04, 0.013],
          0.0025,
        );
      }
    }
  } else if (offer.kind === "music") {
    b.box([0, 0.033, 0], [0.09, 0.066, 0.066], GRAPHITE);
    b.part("ring", [0, 0.04, 0.035], [0.023, 0.023, 0.012], INK);
    b.line([0.04, 0.07, 0], [0.065, 0.12, 0], 0.003);
    b.line([0.065, 0.12, 0], [0.092, 0.127, 0], 0.003);
    b.sphere([0.092, 0.12, 0], 0.009, INK);
    glyph(b, "music", 0, 0.041, 0.035, 0.019);
  } else if (offer.kind === "feather") {
    b.line([-0.021, 0.012, 0], [0.031, 0.135, 0], 0.002);
    for (let i = 0; i < 7; i++)
      b.line(
        [-0.015 + i * 0.006, 0.025 + i * 0.014, 0],
        [0.025 + i * 0.006, 0.037 + i * 0.014, 0.003],
        0.004,
        GRAPHITE,
      );
  } else if (offer.kind === "slot") {
    dockModel(b);
  } else if (offer.kind === "eraser") {
    b.paint(PENCIL.damage);
    b.box([0, 0.022, 0], [0.085, 0.039, 0.048], GRAPHITE);
    for (let i = 0; i < 4; i++)
      b.line(
        [-0.04 + i * 0.008, 0.004, 0.025],
        [-0.035 + i * 0.008, 0.039, 0.025],
        0.002,
      );
  } else if (offer.kind === "seal") {
    b.paint(
      {
        normal: PENCIL.health,
        hard: PENCIL.income,
        harder: PENCIL.special,
        impossible: PENCIL.damage,
      }[offer.difficulty],
    );
    b.part("rod", [0, 0.018, 0], [0.058, 0.022, 0.058], GRAPHITE);
    b.part("ring", [0, 0.034, 0], [0.043, 0.043, 0.043], GRAPHITE, [
      Math.PI / 2,
      0,
      0,
    ]);
    b.part("cone", [0, 0.064, 0], [0.024, 0.06, 0.024], GRAPHITE);
    const rank =
      ["normal", "hard", "harder", "impossible"].indexOf(offer.difficulty) + 1;
    for (let i = 0; i < rank; i++)
      b.path(
        [
          [-0.018, 0.004 + i * 0.011, 0.06],
          [0, 0.012 + i * 0.011, 0.06],
          [0.018, 0.004 + i * 0.011, 0.06],
        ],
        0.003,
      );
  } else {
    b.paint(PENCIL.paper);
    b.box([0, 0.025, 0], [0.1, 0.04, 0.08], GRAPHITE);
    glyph(b, "page", 0, 0.05, 0.042, 0.03);
    for (let i = 0; i < 3; i++)
      b.line(
        [-0.046, 0.015 + i * 0.007, 0.042],
        [0.046, 0.015 + i * 0.007, 0.042],
        0.002,
      );
  }
  if (held)
    b.part(
      "ring",
      [0, 0.15 + Math.sin(time * 4) * 0.003, 0],
      [0.019, 0.019, 0.019],
      GRAPHITE,
      [Math.PI / 2, 0, 0],
    );
}

/** Presentation effects follow authoritative projectiles/specials, never hit tests. */
export function projectileModel(b, type, team, age = 0) {
  const color = TEAM_COLORS[team];
  if (type === "arc" && age === 1) {
    b.line([-0.03 * team, 0, 0], [0.025 * team, 0, 0], 0.0028);
    b.path(
      [
        [0.012 * team, 0.009, 0],
        [0.028 * team, 0, 0],
        [0.012 * team, -0.009, 0],
      ],
      0.0025,
    );
  } else if (type === "laser") {
    b.line([-0.03 * team, -0.003, 0], [0.03 * team, -0.003, 0], 0.0028, color);
    b.line([-0.026 * team, 0.003, 0], [0.035 * team, 0.003, 0], 0.0028, color);
  } else if (type === "straight")
    b.line([-0.015 * team, 0, 0], [0.014 * team, 0, 0], 0.003, color);
  else {
    b.part("sphere", [0, 0, 0], [0.012, 0.012, 0.01], color);
    if (type === "orb")
      b.part("ring", [0, 0, 0], [0.02, 0.02, 0.02], color, [Math.PI / 2, 0, 0]);
  }
}

export function specialModel(b, age, time, team, detailed = true) {
  const color = TEAM_COLORS[team],
    radius = age === 4 ? 0.28 : 0.5;
  b.part("ring", [0, 0, 0], [radius, radius, 0.025], color, [
    Math.PI / 2,
    0,
    0,
  ]);
  if (!detailed) return;
  if (age === 4) {
    b.part("ring", [0, 0.55, 0], [0.09, 0.09, 0.09], color, [
      Math.PI / 2,
      0,
      0,
    ]);
    for (const x of [-0.022, 0, 0.023])
      b.path(
        [
          [x * 2, 0.54, 0],
          [x, 0.28, 0.009],
          [x * 0.3, 0, 0],
        ],
        0.003,
        color,
      );
  } else if (age === 5) {
    for (const sign of [-1, 1])
      b.path(
        [
          [sign * 0.07, 0.025, 0],
          [sign * 0.035, 0.13, 0.01],
          [sign * 0.065, 0.2, 0],
          [sign * 0.023, 0.3, -0.01],
          [0, 0.38, 0],
        ],
        0.004,
        color,
      );
    b.part("ring", [0, 0.16, 0], [0.14, 0.14, 0.14], color, [
      0.3,
      time * 0.3,
      0,
    ]);
  } else {
    for (let i = 0; i < 6; i++) {
      const x = Math.sin(i * 4.7) * radius,
        z = Math.cos(i * 2.3) * 0.075,
        y = 0.03 + ((((0.4 - time * 0.25 + i * 0.061) % 0.4) + 0.4) % 0.4);
      if (age === 1) {
        b.path(
          [
            [x - 0.012, y + 0.06, z],
            [x, y, z],
            [x - 0.008, y + 0.012, z],
          ],
          0.0028,
        );
      } else {
        b.outlineBall([x, y, z], age === 0 ? 0.02 : 0.012, color);
        b.line([x, y + 0.023, z], [x - 0.025, y + 0.08, z], 0.0025, color);
      }
    }
    if (age === 3) {
      const x = Math.sin(time * 2) * 0.4;
      b.path(
        [
          [x - 0.13, 0.45, 0],
          [x + 0.12, 0.45, 0],
          [x + 0.02, 0.45, -0.11],
          [x - 0.01, 0.45, 0.11],
          [x + 0.12, 0.45, 0],
        ],
        0.0035,
      );
    }
  }
}
